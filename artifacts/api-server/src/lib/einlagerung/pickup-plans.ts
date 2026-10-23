import { z } from "zod/v4";
import { deliveryNumberOf, event, snapshots, WarehouseError, type Client, type Data } from "./model";
export const pickupInput = z.object({
  planned: z.boolean(), shipmentId: z.number().int().positive().nullable(),
  expectedUpdatedAt: z.iso.datetime().nullable(),
}).refine((v) => v.planned || v.shipmentId === null, "Eine LKW-Zuordnung erfordert eine eingeplante Abholung.");

export async function pickupShipmentAccess(c: Client, role: string, speditionId?: number | null): Promise<number[] | null> {
  if (!["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(role)) return null;
  if (!speditionId) return [];
  const r = await c.query(`SELECT granting_spedition_id AS id FROM spedition_permissions
    WHERE receiving_spedition_id=$1 AND permission_level IN ('view','edit')`, [speditionId]);
  return [speditionId, ...r.rows.map((r) => Number(r.id))];
}

export async function listPickupPlans(c: Client, access: number[] | null) {
  // Restrict linked truck details by the same carrier-sharing scope as /shipments.
  // DATE is a calendar day, not an instant. Return SQL text so node-postgres
  // cannot turn local midnight into a Date that shifts when serialized as UTC.
  const r = await c.query(`SELECT p.*,s.id AS visible_shipment_id,s.kennzeichen,to_char(s.eta_date,'YYYY-MM-DD') AS eta_date,s.eta_time,s.status,s.relation,
    sp.name AS spedition_name FROM einlagerung_pickup_plans p
    LEFT JOIN shipments s ON s.id=p.shipment_id AND ($1::integer[] IS NULL OR s.spedition_id=ANY($1))
    LEFT JOIN speditionen sp ON sp.id=s.spedition_id ORDER BY p.delivery_number`, [access]);
  return r.rows.map((r) => ({
    deliveryNumber: r.delivery_number, planned: r.planned, shipmentId: r.shipment_id,
    updatedAt: new Date(r.updated_at).toISOString(),
    shipment: r.visible_shipment_id == null ? null : {
      id: r.visible_shipment_id, kennzeichen: r.kennzeichen ?? "", speditionName: r.spedition_name ?? "",
      etaDate: r.eta_date ?? "",
      etaTime: r.eta_time ?? "", status: r.status ?? "", relation: r.relation ?? "",
    },
  }));
}

/** Caller holds the warehouse transaction lock. Import snapshots never own these records. */
export async function savePickupPlan(c: Client, delivery: string, input: unknown, username: string, access: number[] | null) {
  const number = z.string().trim().regex(/^8\d+$/).max(100).parse(delivery);
  const b = pickupInput.parse(input);
  const old = (await c.query("SELECT * FROM einlagerung_pickup_plans WHERE delivery_number=$1 FOR UPDATE", [number])).rows[0];
  if ((old ? new Date(old.updated_at).toISOString() : null) !== b.expectedUpdatedAt) {
    throw new WarehouseError("Die Abholplanung wurde zwischenzeitlich geändert. Bitte neu laden und erneut bearbeiten.", 409);
  }
  if (!old) {
    const ds = (await snapshots(c)).find((d) => d.type === "auftraege");
    if (!ds?.rows.some((r: Data) => deliveryNumberOf(r) === number)) throw new WarehouseError("Lieferung im aktuellen Auftragsimport nicht gefunden.", 404);
  }
  if (b.shipmentId != null && b.shipmentId !== old?.shipment_id) {
    const truck = (await c.query(`SELECT id,status FROM shipments
      WHERE id=$1 AND ($2::integer[] IS NULL OR spedition_id=ANY($2)) FOR SHARE`, [b.shipmentId, access])).rows[0];
    if (!truck) throw new WarehouseError("LKW-Anmeldung nicht gefunden oder nicht freigegeben.", 404);
    if (["Abgefertigt", "Storniert"].includes(truck.status)) throw new WarehouseError("Bitte eine aktive LKW-Anmeldung auswählen.");
  }
  await c.query(`INSERT INTO einlagerung_pickup_plans(delivery_number,planned,shipment_id)
    VALUES($1,$2,$3) ON CONFLICT(delivery_number) DO UPDATE SET planned=$2,shipment_id=$3,
    updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),einlagerung_pickup_plans.updated_at+interval '1 millisecond')`,
    [number, b.planned, b.shipmentId]);
  await event(c, username, "Abholplanung geändert", JSON.stringify({
    deliveryNumber: number, before: old ? { planned: old.planned, shipmentId: old.shipment_id } : null,
    after: { planned: b.planned, shipmentId: b.shipmentId },
  }));
  return (await listPickupPlans(c, access)).find((p) => p.deliveryNumber === number)!;
}
