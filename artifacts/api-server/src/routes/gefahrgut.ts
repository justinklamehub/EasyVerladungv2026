import { Router } from "express";
import { db } from "@workspace/db";
import { gefahrgutChecklistenTable, shipmentsTable, speditionenTable } from "@workspace/db";
import { eq, desc, isNotNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { isCometRole } from "../lib/auth";
import { can } from "../lib/permissions";

const router = Router();

router.get("/api/scanner/find-shipment", async (req, res) => {
  try {
    const { id } = req.query as { id?: string };
    if (!id) {
      return res.status(400).json({ error: "id erforderlich" });
    }
    const numId = Number(id);
    if (isNaN(numId)) {
      return res.status(400).json({ error: "Ungültige ID" });
    }
    const shipments = await db
      .select({
        id: shipmentsTable.id,
        kennzeichen: shipmentsTable.kennzeichen,
        bezeichnung: shipmentsTable.bezeichnung,
        speditionId: shipmentsTable.speditionId,
        status: shipmentsTable.status,
      })
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, numId))
      .limit(1);

    if (shipments.length === 0) {
      return res.json({ found: false, shipment: null, spedition: null });
    }

    const shipment = shipments[0];
    let speditionName: string | null = null;
    if (shipment.speditionId) {
      const speds = await db
        .select({ name: speditionenTable.name })
        .from(speditionenTable)
        .where(eq(speditionenTable.id, shipment.speditionId))
        .limit(1);
      if (speds.length > 0) speditionName = speds[0].name;
    }

    return res.json({ found: true, shipment, spedition: speditionName });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.post("/api/scanner/gefahrgut", async (req, res) => {
  try {
    const {
      shipmentId, kennzeichen, items, anhaenger, spedition,
      nameFahrer, unterschriftFahrer, nameVerlader, datum,
      unterschriftVerlader,
      vonCometEuropaletten, vonCometLadungssicherung, vonDefektePaletten,
      anCometEuropaletten, anCometLadungssicherung, anDefektePaletten,
      bemerkungen,
    } = req.body;

    const [inserted] = await db
      .insert(gefahrgutChecklistenTable)
      .values({
        shipmentId: shipmentId ?? null,
        kennzeichen: kennzeichen ? String(kennzeichen).toUpperCase().trim() : null,
        items: items ?? {},
        anhaenger: anhaenger || null,
        spedition: spedition || null,
        nameFahrer: nameFahrer || null,
        unterschriftFahrer: unterschriftFahrer || null,
        nameVerlader: nameVerlader || null,
        datum: datum || null,
        unterschriftVerlader: unterschriftVerlader || null,
        vonCometEuropaletten: vonCometEuropaletten != null ? Number(vonCometEuropaletten) : null,
        vonCometLadungssicherung: vonCometLadungssicherung != null ? Number(vonCometLadungssicherung) : null,
        vonDefektePaletten: vonDefektePaletten != null ? Number(vonDefektePaletten) : null,
        anCometEuropaletten: anCometEuropaletten != null ? Number(anCometEuropaletten) : null,
        anCometLadungssicherung: anCometLadungssicherung != null ? Number(anCometLadungssicherung) : null,
        anDefektePaletten: anDefektePaletten != null ? Number(anDefektePaletten) : null,
        bemerkungen: bemerkungen || null,
      })
      .returning();

    return res.status(201).json({ success: true, id: inserted.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler beim Speichern" });
  }
});

router.get("/api/gefahrgut-status", requireAuth, async (req, res) => {
  try {
    if (!isCometRole(req.session.role!)) {
      return res.status(403).json({ error: "Kein Zugriff" });
    }
    const rows = await db
      .select({ shipmentId: gefahrgutChecklistenTable.shipmentId })
      .from(gefahrgutChecklistenTable)
      .where(isNotNull(gefahrgutChecklistenTable.shipmentId));
    const ids = [
      ...new Set(
        rows.map((r) => r.shipmentId).filter((id): id is number => id !== null)
      ),
    ];
    return res.json({ shipmentIds: ids });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.get("/api/gefahrgut-checklisten", requireAuth, async (req, res) => {
  try {
    if (!isCometRole(req.session.role!)) {
      return res.status(403).json({ error: "Kein Zugriff" });
    }
    const { shipmentId } = req.query as { shipmentId?: string };
    let rows;
    if (shipmentId) {
      rows = await db
        .select()
        .from(gefahrgutChecklistenTable)
        .where(eq(gefahrgutChecklistenTable.shipmentId, Number(shipmentId)))
        .orderBy(desc(gefahrgutChecklistenTable.eingereichtAt));
    } else {
      rows = await db
        .select()
        .from(gefahrgutChecklistenTable)
        .orderBy(desc(gefahrgutChecklistenTable.eingereichtAt))
        .limit(200);
    }
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.get("/api/gefahrgut-checklisten/:id", requireAuth, async (req, res) => {
  try {
    if (!isCometRole(req.session.role!)) {
      return res.status(403).json({ error: "Kein Zugriff" });
    }
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(gefahrgutChecklistenTable)
      .where(eq(gefahrgutChecklistenTable.id, id))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Nicht gefunden" });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.delete("/api/gefahrgut-checklisten/:id", requireAuth, async (req, res) => {
  try {
    if (!isCometRole(req.session.role!)) {
      return res.status(403).json({ error: "Kein Zugriff" });
    }
    const allowed = await can(req.session.role!, "gefahrgut.reset");
    if (!allowed) {
      return res.status(403).json({ error: "Keine Berechtigung (gefahrgut.reset)" });
    }
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });
    await db
      .delete(gefahrgutChecklistenTable)
      .where(eq(gefahrgutChecklistenTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

export default router;
