import { Router } from "express";
import { db } from "@workspace/db";
import { gefahrgutChecklistenTable, shipmentsTable, speditionenTable } from "@workspace/db";
import { eq, desc, isNotNull, count, ilike, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { isCometRole } from "../lib/auth";
import { can } from "../lib/permissions";
import { emitToRooms } from "../lib/socket-emit";

function emitShipment(req: any, event: string, id: number, speditionId?: number | null) {
  const io = req.app.get("io");
  if (io) emitToRooms(io, event, { id }, speditionId ?? null, []);
}

const router = Router();

router.get("/scanner/find-shipment", async (req, res) => {
  try {
    const { id, q } = req.query as { id?: string; q?: string };
    const query = (q ?? id ?? "").trim();
    if (!query) {
      return res.status(400).json({ error: "Suchbegriff erforderlich" });
    }

    const numId = Number(query);
    const isNumeric = !isNaN(numId) && query !== "";

    const shipments = await db
      .select({
        id: shipmentsTable.id,
        kennzeichen: shipmentsTable.kennzeichen,
        bezeichnung: shipmentsTable.bezeichnung,
        relation: shipmentsTable.relation,
        speditionId: shipmentsTable.speditionId,
        status: shipmentsTable.status,
        tor: shipmentsTable.tor,
        wareStatus: shipmentsTable.wareStatus,
      })
      .from(shipmentsTable)
      .where(
        isNumeric
          ? or(eq(shipmentsTable.id, numId), ilike(shipmentsTable.kennzeichen, query))
          : ilike(shipmentsTable.kennzeichen, `%${query}%`)
      )
      .limit(5);

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

    const [{ value: checklistCount }] = await db
      .select({ value: count() })
      .from(gefahrgutChecklistenTable)
      .where(eq(gefahrgutChecklistenTable.shipmentId, shipment.id));

    return res.json({ found: true, shipment, spedition: speditionName, checklistCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

const VALID_STATUSES = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];
const VALID_WARE_STATUSES = ["nicht bereit", "vorbereitet", "ausgedruckt"];

router.patch("/scanner/shipment/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });

    const { status, tor, wareStatus } = req.body as {
      status?: string; tor?: string; wareStatus?: string;
    };

    const update: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Ungültiger Status" });
      update.status = status;
      if (status === "Angekommen") {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        update.ataDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        update.ataTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
    }
    if (tor !== undefined) update.tor = tor || null;
    if (wareStatus !== undefined) {
      if (wareStatus && !VALID_WARE_STATUSES.includes(wareStatus)) return res.status(400).json({ error: "Ungültiger Ware-Status" });
      update.wareStatus = wareStatus || null;
    }

    if (Object.keys(update).length === 0) return res.status(400).json({ error: "Keine Änderungen" });

    const existing = await db.select({ id: shipmentsTable.id, speditionId: shipmentsTable.speditionId, status: shipmentsTable.status }).from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: "Verladung nicht gefunden" });

    await db.update(shipmentsTable).set(update).where(eq(shipmentsTable.id, id));

    const isStatusChange = update.status !== undefined && update.status !== existing[0].status;
    emitShipment(req, isStatusChange ? "shipment.status_changed" : "shipment.updated", id, existing[0].speditionId);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.post("/scanner/gefahrgut", async (req, res) => {
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

router.get("/gefahrgut-status", requireAuth, async (req, res) => {
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

router.get("/gefahrgut-checklisten", requireAuth, async (req, res) => {
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

router.get("/gefahrgut-checklisten/:id", requireAuth, async (req, res) => {
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

router.delete("/gefahrgut-checklisten/:id", requireAuth, async (req, res) => {
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
