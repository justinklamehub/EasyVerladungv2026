import { z } from "zod/v4";
import { deliveryNumberOf, event, snapshots, WarehouseError, type Client, type Data } from "./model";
import { listPickupPlans } from "./pickup-plans";

export const pickupBatchInput = z.object({
  deliveries: z.array(z.object({ deliveryNumber: z.string().trim().regex(/^8\d+$/).max(100), expectedUpdatedAt: z.iso.datetime().nullable() })).min(1).max(10000),
  planned: z.boolean(), shipmentMode: z.enum(["keep", "assign", "remove"]), shipmentId: z.number().int().positive().nullable(),
}).superRefine((b, ctx) => {
  if (new Set(b.deliveries.map((d) => d.deliveryNumber)).size !== b.deliveries.length)
    ctx.addIssue({ code: "custom", message: "Jede Liefernummer darf nur einmal ausgewählt sein." });
  if ((!b.planned && b.shipmentMode !== "remove") || (b.shipmentMode === "assign" ? (!b.planned || b.shipmentId == null) : b.shipmentId != null))
    ctx.addIssue({ code: "custom", message: "Bitte eine gültige gemeinsame Planungsaktion und LKW-Zuordnung wählen." });
});

/** Caller holds the same warehouse transaction/advisory lock as imports and single-plan edits. */
export async function savePickupBatch(c: Client, input: unknown, username: string, access: number[] | null) {
  const b = pickupBatchInput.parse(input);
  const numbers = b.deliveries.map((d) => d.deliveryNumber);
  const old = new Map((await c.query("SELECT * FROM einlagerung_pickup_plans WHERE delivery_number=ANY($1::text[]) FOR UPDATE", [numbers])).rows.map((r) => [r.delivery_number, r]));
  for (const d of b.deliveries) {
    const previous = old.get(d.deliveryNumber);
    if ((previous ? new Date(previous.updated_at).toISOString() : null) !== d.expectedUpdatedAt)
      throw new WarehouseError(`Die Planung für ${d.deliveryNumber} wurde zwischenzeitlich geändert. Es wurde nichts gespeichert. Bitte Auswahl neu öffnen.`, 409);
  }
  const newNumbers = numbers.filter((n) => !old.has(n));
  if (newNumbers.length) {
    const ds = (await snapshots(c)).find((d) => d.type === "auftraege");
    const imported = new Set((ds?.rows ?? []).map((r: Data) => deliveryNumberOf(r)));
    const missing = newNumbers.find((n) => !imported.has(n));
    if (missing) throw new WarehouseError(`Lieferung ${missing} im aktuellen Auftragsimport nicht gefunden. Es wurde nichts gespeichert.`, 404);
  }
  if (b.shipmentMode === "assign") {
    const truck = (await c.query("SELECT id,status FROM shipments WHERE id=$1 AND ($2::integer[] IS NULL OR spedition_id=ANY($2)) FOR SHARE", [b.shipmentId, access])).rows[0];
    if (!truck) throw new WarehouseError("LKW-Anmeldung nicht gefunden oder nicht freigegeben.", 404);
    if (["Abgefertigt", "Storniert"].includes(truck.status)) throw new WarehouseError("Bitte eine aktive LKW-Anmeldung auswählen.");
  }
  const updates = numbers.map((number) => ({
    delivery_number: number, planned: b.planned,
    shipment_id: !b.planned || b.shipmentMode === "remove" ? null : b.shipmentMode === "assign" ? b.shipmentId : old.get(number)?.shipment_id ?? null,
  }));
  await c.query(`INSERT INTO einlagerung_pickup_plans(delivery_number,planned,shipment_id)
    SELECT delivery_number,planned,shipment_id FROM jsonb_to_recordset($1::jsonb)
      AS x(delivery_number TEXT,planned BOOLEAN,shipment_id INTEGER)
    ON CONFLICT(delivery_number) DO UPDATE SET planned=EXCLUDED.planned,shipment_id=EXCLUDED.shipment_id,
      updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),einlagerung_pickup_plans.updated_at+interval '1 millisecond')`, [JSON.stringify(updates)]);
  await event(c, username, "Abholplanung gesammelt geändert", JSON.stringify({
    shipmentMode: b.shipmentMode, deliveries: updates.map((after) => {
      const previous = old.get(after.delivery_number);
      return { deliveryNumber: after.delivery_number, before: previous ? { planned: previous.planned, shipmentId: previous.shipment_id } : null, after: { planned: after.planned, shipmentId: after.shipment_id } };
    }),
  }));
  const wanted = new Set(numbers);
  return (await listPickupPlans(c, access)).filter((p) => wanted.has(p.deliveryNumber));
}
