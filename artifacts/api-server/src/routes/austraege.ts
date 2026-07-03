import { Router } from "express";
import { db } from "@workspace/db";
import { lkwAustraegeTable, speditionenTable, palletMovementsTable, shipmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import { can } from "../lib/permissions";
import type { Server as IOServer } from "socket.io";

const router = Router();

const COMET_ALL_ROLES = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];

function getIO(req: any): IOServer | null {
  return req.app.get("io") || null;
}

function emit(req: any, event: string, data: any, speditionId?: number | null) {
  const io = getIO(req);
  if (io) emitToRooms(io, event, data, speditionId);
}

router.get("/austraege", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!COMET_ALL_ROLES.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { shipmentId } = req.query as Record<string, string>;

    let rows = await db.select().from(lkwAustraegeTable).orderBy(lkwAustraegeTable.createdAt);

    if (shipmentId) {
      rows = rows.filter((r) => r.shipmentId === Number(shipmentId));
    }

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    return res.json(
      rows.map((r) => ({
        ...r,
        beauftragteSpeditionName: r.beauftragteSpeditionId ? (spedMap[r.beauftragteSpeditionId] ?? null) : null,
      })),
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/austraege", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "austrag.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung für Austragen" });
    }

    const {
      shipmentId,
      ladelistennummer,
      palettenscheinnummer,
      datum,
      kennzeichen,
      beauftragteSpeditionId,
      subSpedition,
      tor,
      vonCometEuropaletten,
      vonCometLadungssicherung,
      vonDefektePaletten,
      anCometEuropaletten,
      anCometLadungssicherung,
      anDefektePaletten,
    } = req.body;

    if (!datum) {
      return res.status(400).json({ error: "Datum ist erforderlich" });
    }

    // Gross = euro + ladungssicherung (ohne Defekte-Abzug); Net = gross - defekte.
    // Identisch zur Berechnung in "Palettenkonto -> Neue Buchung" (movement-dialog.tsx).
    const vonGross =
      Number(vonCometEuropaletten ?? 0) + Number(vonCometLadungssicherung ?? 0);
    const anGross =
      Number(anCometEuropaletten ?? 0) + Number(anCometLadungssicherung ?? 0);
    const vonTotal = vonGross - Number(vonDefektePaletten ?? 0);
    const anTotal = anGross - Number(anDefektePaletten ?? 0);
    const calculatedAmount = vonTotal - anTotal;

    // Art wird wie im Buchungsdialog anhand der Brutto-Mengen ermittelt:
    // beide Seiten (brutto) > 0 → Neutral, nur Von → Ausgang, nur An → Eingang.
    const movementType: "neutral" | "ausgang" | "eingang" | null =
      vonGross > 0 && anGross > 0
        ? "neutral"
        : vonGross > 0
          ? "ausgang"
          : anGross > 0
            ? "eingang"
            : null;

    let palletFaktor = 1;
    const spedIdForFaktor = beauftragteSpeditionId ? Number(beauftragteSpeditionId) : null;
    if (spedIdForFaktor) {
      const [sped] = await db
        .select({ palletFaktor: speditionenTable.palletFaktor })
        .from(speditionenTable)
        .where(eq(speditionenTable.id, spedIdForFaktor));
      palletFaktor = sped?.palletFaktor ?? 1;
    }

    // Bei Neutral-Buchungen mit Tauschfaktor > 1 zählen Defekte nicht (Brutto-Mengen),
    // und der Eingang wird faktor-fach gewertet — identisch zum Buchungsdialog.
    const netAmount =
      movementType === "neutral" && palletFaktor > 1
        ? anGross * palletFaktor - vonGross
        : calculatedAmount;

    const [row] = await db
      .insert(lkwAustraegeTable)
      .values({
        shipmentId: shipmentId ? Number(shipmentId) : null,
        ladelistennummer: ladelistennummer || null,
        palettenscheinnummer: palettenscheinnummer || null,
        datum,
        kennzeichen: kennzeichen || null,
        beauftragteSpeditionId: beauftragteSpeditionId ? Number(beauftragteSpeditionId) : null,
        subSpedition: subSpedition || null,
        tor: tor || null,
        vonCometEuropaletten: Number(vonCometEuropaletten ?? 0),
        vonCometLadungssicherung: Number(vonCometLadungssicherung ?? 0),
        vonDefektePaletten: Number(vonDefektePaletten ?? 0),
        anCometEuropaletten: Number(anCometEuropaletten ?? 0),
        anCometLadungssicherung: Number(anCometLadungssicherung ?? 0),
        anDefektePaletten: Number(anDefektePaletten ?? 0),
        createdBy: req.session.userId!,
      })
      .returning();

    await logAudit(req.session.userId!, "austrag", row.id, "create", null, JSON.stringify({ shipmentId, datum, tor }));

    // Auto-book a single pallet movement if a spedition is assigned and pallets were exchanged.
    // Art und Betrag werden identisch zu "Palettenkonto -> Neue Buchung" berechnet (inkl. Tauschfaktor).
    const spedId = beauftragteSpeditionId ? Number(beauftragteSpeditionId) : null;
    if (spedId && movementType) {
      const absNet = Math.abs(netAmount);
      await db.insert(palletMovementsTable).values({
        speditionId: spedId,
        shipmentId: shipmentId ? Number(shipmentId) : null,
        movementType,
        movementDate: datum,
        amount: absNet,
        palettenscheinnummer: palettenscheinnummer || null,
        vonCometEuropaletten: Number(vonCometEuropaletten ?? 0),
        vonCometLadungssicherung: Number(vonCometLadungssicherung ?? 0),
        vonDefektePaletten: Number(vonDefektePaletten ?? 0),
        anCometEuropaletten: Number(anCometEuropaletten ?? 0),
        anCometLadungssicherung: Number(anCometLadungssicherung ?? 0),
        anDefektePaletten: Number(anDefektePaletten ?? 0),
        bemerkungen: `Auto: Austrag #${row.id}`,
        createdBy: req.session.userId!,
      });
      emit(req, "pallet_movement.created", { speditionId: spedId }, spedId);
      emit(req, "pallet_balance.updated", { speditionId: spedId }, spedId);
    }

    // Auto-set shipment status to "Abgefertigt"
    if (shipmentId) {
      const numShipmentId = Number(shipmentId);
      await db
        .update(shipmentsTable)
        .set({ status: "Abgefertigt", updatedBy: req.session.userId!, updatedAt: new Date() })
        .where(eq(shipmentsTable.id, numShipmentId));
      await logAudit(req.session.userId!, "shipment", numShipmentId, "status_changed", "auto via Austrag", "Abgefertigt");
      emit(req, "shipment.updated", { id: numShipmentId }, null);
    }

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    return res.status(201).json({
      ...row,
      beauftragteSpeditionName: row.beauftragteSpeditionId ? (spedMap[row.beauftragteSpeditionId] ?? null) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/austraege/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "austrag.delete"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }

    const id = Number(req.params.id);
    await db.delete(lkwAustraegeTable).where(eq(lkwAustraegeTable.id, id));
    await logAudit(req.session.userId!, "austrag", id, "delete", null, null);

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
