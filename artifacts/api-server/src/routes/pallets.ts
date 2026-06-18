import { Router } from "express";
import { db } from "@workspace/db";
import {
  palletMovementsTable,
  palletPlantCountsTable,
  speditionenTable,
  usersTable,
  shipmentsTable,
} from "@workspace/db";
import { and, eq, gte, lte, inArray, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import { can } from "../lib/permissions";
import type { Server as IOServer } from "socket.io";

const router = Router();

const SPED_ROLES = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"];

function getIO(req: any): IOServer | null {
  return req.app.get("io") || null;
}

function emit(req: any, event: string, data: any, speditionId?: number | null) {
  const io = getIO(req);
  if (io) emitToRooms(io, event, data, speditionId);
}

router.get("/pallet-movements", requireAuth, async (req, res) => {
  try {
    const { speditionId, dateFrom, dateTo, shipmentId } = req.query as Record<string, string>;
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    const effectiveSpedId = SPED_ROLES.includes(role)
      ? sessionSpeditionId ?? -1
      : speditionId ? Number(speditionId) : null;

    const conditions = [];
    if (effectiveSpedId !== null) conditions.push(eq(palletMovementsTable.speditionId, effectiveSpedId));
    if (dateFrom) conditions.push(gte(palletMovementsTable.movementDate, dateFrom));
    if (dateTo) conditions.push(lte(palletMovementsTable.movementDate, dateTo));
    if (shipmentId) conditions.push(eq(palletMovementsTable.shipmentId, Number(shipmentId)));

    const rows = await db
      .select()
      .from(palletMovementsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(palletMovementsTable.movementDate));

    // Fetch only the referenced lookup rows (not full tables)
    const spedIds = [...new Set(rows.map((r) => r.speditionId))];
    const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as number[];
    const shipIds = [...new Set(rows.map((r) => r.shipmentId).filter(Boolean))] as number[];

    const [speds, users, ships] = await Promise.all([
      spedIds.length ? db.select({ id: speditionenTable.id, name: speditionenTable.name }).from(speditionenTable).where(inArray(speditionenTable.id, spedIds)) : [],
      userIds.length ? db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      shipIds.length ? db.select({ id: shipmentsTable.id, bezeichnung: shipmentsTable.bezeichnung }).from(shipmentsTable).where(inArray(shipmentsTable.id, shipIds)) : [],
    ]);

    const spedMap: Record<number, string> = Object.fromEntries(speds.map((s) => [s.id, s.name]));
    const userMap: Record<number, string> = Object.fromEntries(users.map((u) => [u.id, u.username]));
    const shipMap: Record<number, string> = Object.fromEntries(ships.map((s) => [s.id, s.bezeichnung ?? `#${s.id}`]));

    return res.json(
      rows.map((m) => ({
        ...m,
        speditionName: spedMap[m.speditionId] ?? null,
        shipmentBezeichnung: m.shipmentId ? (shipMap[m.shipmentId] ?? null) : null,
        createdByName: m.createdBy ? (userMap[m.createdBy] ?? null) : null,
      })),
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pallet-movements", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    if (SPED_ROLES.includes(role)) {
      return res.status(403).json({ error: "Speditionen können keine Palettenbuchungen erstellen" });
    }
    if (!(await can(role, "pallet.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung für Palettenbuchungen" });
    }

    const {
      speditionId, shipmentId, movementType, movementDate, amount, bemerkungen,
      palettenscheinnummer,
      vonCometEuropaletten, vonCometLadungssicherung, vonDefektePaletten,
      anCometEuropaletten, anCometLadungssicherung, anDefektePaletten,
    } = req.body;

    if (SPED_ROLES.includes(role) && speditionId !== sessionSpeditionId) {
      return res.status(403).json({ error: "Forbidden: can only create movements for own spedition" });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: "Ungültige Menge" });
    }
    const absAmount = parsedAmount;

    if (movementType !== "abstimmung" && !palettenscheinnummer) {
      return res.status(400).json({ error: "Palettenscheinnummer ist erforderlich" });
    }

    const [movement] = await db
      .insert(palletMovementsTable)
      .values({
        speditionId,
        shipmentId: shipmentId || null,
        movementType,
        movementDate,
        amount: absAmount,
        bemerkungen,
        palettenscheinnummer: palettenscheinnummer || null,
        vonCometEuropaletten: Number(vonCometEuropaletten) || 0,
        vonCometLadungssicherung: Number(vonCometLadungssicherung) || 0,
        vonDefektePaletten: Number(vonDefektePaletten) || 0,
        anCometEuropaletten: Number(anCometEuropaletten) || 0,
        anCometLadungssicherung: Number(anCometLadungssicherung) || 0,
        anDefektePaletten: Number(anDefektePaletten) || 0,
        createdBy: req.session.userId,
      })
      .returning();

    logAudit(req.session.userId!, "pallet_movement", movement.id, "created", null, `${movementType}:${absAmount}`);
    emit(req, "pallet_movement.created", { id: movement.id, speditionId }, speditionId);
    emit(req, "pallet_balance.updated", { speditionId }, speditionId);

    return res.status(201).json({ ...movement, speditionName: null, shipmentBezeichnung: null, createdByName: null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/pallet-movements/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "pallet.edit"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    const id = Number(req.params.id);
    const { movementType, movementDate, amount, bemerkungen } = req.body;
    const updates: any = {};
    if (movementType !== undefined) updates.movementType = movementType;
    if (movementDate !== undefined) updates.movementDate = movementDate;
    if (amount !== undefined) updates.amount = Math.abs(Number(amount));
    if (bemerkungen !== undefined) updates.bemerkungen = bemerkungen;

    const [movement] = await db
      .update(palletMovementsTable)
      .set(updates)
      .where(eq(palletMovementsTable.id, id))
      .returning();
    if (!movement) return res.status(404).json({ error: "Not found" });

    logAudit(req.session.userId!, "pallet_movement", id, "updated", null, JSON.stringify(updates));
    emit(req, "pallet_balance.updated", { speditionId: movement.speditionId }, movement.speditionId);
    return res.json({ ...movement, speditionName: null, shipmentBezeichnung: null, createdByName: null });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/pallet-movements/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "pallet.delete"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    const id = Number(req.params.id);
    const [m] = await db.delete(palletMovementsTable).where(eq(palletMovementsTable.id, id)).returning();
    if (!m) return res.status(404).json({ error: "Not found" });
    logAudit(req.session.userId!, "pallet_movement", id, "deleted", `${m.movementType}:${m.amount}`, null);
    emit(req, "pallet_balance.updated", { speditionId: m.speditionId }, m.speditionId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pallet-balances", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    const spedConditions: any[] = [eq(speditionenTable.status, "aktiv")];
    if (SPED_ROLES.includes(role)) {
      if (!sessionSpeditionId) return res.json([]);
      spedConditions.push(eq(speditionenTable.id, sessionSpeditionId));
    }
    const speds = await db.select().from(speditionenTable).where(and(...spedConditions));
    if (!speds.length) return res.json([]);

    const spedIds = speds.map((s) => s.id);

    // Single aggregation query: balance + last movement date per spedition
    const agg = await db
      .select({
        speditionId: palletMovementsTable.speditionId,
        balance: sql<number>`SUM(
          CASE
            WHEN ${palletMovementsTable.movementType} = 'eingang'   THEN  ${palletMovementsTable.amount}
            WHEN ${palletMovementsTable.movementType} = 'ausgang'   THEN -${palletMovementsTable.amount}
            WHEN ${palletMovementsTable.movementType} = 'korrektur' THEN  ${palletMovementsTable.amount}
            WHEN ${palletMovementsTable.movementType} = 'neutral'   THEN
              (COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0))
              - (COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0))
            ELSE 0
          END
        )`.mapWith(Number),
        lastMovementDate: sql<string>`MAX(${palletMovementsTable.movementDate})`,
      })
      .from(palletMovementsTable)
      .where(inArray(palletMovementsTable.speditionId, spedIds))
      .groupBy(palletMovementsTable.speditionId);

    const aggMap: Record<number, { balance: number; lastMovementDate: string | null }> =
      Object.fromEntries(agg.map((r) => [r.speditionId, { balance: r.balance, lastMovementDate: r.lastMovementDate }]));

    return res.json(
      speds.map((s) => ({
        speditionId: s.id,
        speditionName: s.name,
        kuerzel: s.kuerzel,
        balance: aggMap[s.id]?.balance ?? 0,
        lastMovementDate: aggMap[s.id]?.lastMovementDate ?? null,
      })),
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pallet-report", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const { dateFrom, dateTo } = req.query as Record<string, string>;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: "dateFrom und dateTo sind erforderlich" });
    }

    const spedConditions: any[] = [eq(speditionenTable.status, "aktiv")];
    if (SPED_ROLES.includes(role)) {
      if (!sessionSpeditionId) return res.json([]);
      spedConditions.push(eq(speditionenTable.id, sessionSpeditionId));
    }
    const speds = await db.select().from(speditionenTable).where(and(...spedConditions));
    if (!speds.length) return res.json([]);

    const spedIds = speds.map((s) => s.id);

    // One query: conditional aggregation for anfangsbestand + period stats
    const agg = await db
      .select({
        speditionId: palletMovementsTable.speditionId,
        anfangsbestand: sql<number>`SUM(CASE
          WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'eingang'   THEN  ${palletMovementsTable.amount}
          WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'ausgang'   THEN -${palletMovementsTable.amount}
          WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'korrektur' THEN  ${palletMovementsTable.amount}
          WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral'   THEN
            (COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0))
            - (COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0))
          ELSE 0 END)`.mapWith(Number),
        zugaenge: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'eingang' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        abgaenge: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'ausgang' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        korrekturen: sql<number>`SUM(CASE
          WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'korrektur' THEN ${palletMovementsTable.amount}
          WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'neutral' THEN
            (COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0))
            - (COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0))
          ELSE 0 END)`.mapWith(Number),
        defekteVonComet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} THEN COALESCE(${palletMovementsTable.vonDefektePaletten}, 0) ELSE 0 END)`.mapWith(Number),
        defekteAnComet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} THEN COALESCE(${palletMovementsTable.anDefektePaletten}, 0) ELSE 0 END)`.mapWith(Number),
      })
      .from(palletMovementsTable)
      .where(inArray(palletMovementsTable.speditionId, spedIds))
      .groupBy(palletMovementsTable.speditionId);

    const aggMap = Object.fromEntries(agg.map((r) => [r.speditionId, r]));

    const report = speds.map((s) => {
      const r = aggMap[s.id] ?? { anfangsbestand: 0, zugaenge: 0, abgaenge: 0, korrekturen: 0, defekteVonComet: 0, defekteAnComet: 0 };
      const endbestand = r.anfangsbestand + r.zugaenge - r.abgaenge + r.korrekturen;
      return {
        speditionId: s.id,
        speditionName: s.name,
        anfangsbestand: r.anfangsbestand,
        zugaenge: r.zugaenge,
        abgaenge: r.abgaenge,
        korrekturen: r.korrekturen,
        endbestand,
        defekteVonComet: r.defekteVonComet,
        defekteAnComet: r.defekteAnComet,
        defekteGesamt: r.defekteVonComet + r.defekteAnComet,
      };
    });

    return res.json(report);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pallet-export", requireAuth, async (req, res) => {
  try {
    const { speditionId, dateFrom, dateTo } = req.query as Record<string, string>;
    const sessionSpeditionId = req.session.speditionId;
    const role = req.session.role!;

    const effectiveSpedId = SPED_ROLES.includes(role)
      ? sessionSpeditionId ?? -1
      : speditionId ? Number(speditionId) : null;

    const conditions = [];
    if (effectiveSpedId !== null) conditions.push(eq(palletMovementsTable.speditionId, effectiveSpedId));
    if (dateFrom) conditions.push(gte(palletMovementsTable.movementDate, dateFrom));
    if (dateTo) conditions.push(lte(palletMovementsTable.movementDate, dateTo));

    const rows = await db
      .select()
      .from(palletMovementsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(palletMovementsTable.movementDate);

    const spedIds = [...new Set(rows.map((r) => r.speditionId))];
    const speds = spedIds.length
      ? await db.select({ id: speditionenTable.id, name: speditionenTable.name }).from(speditionenTable).where(inArray(speditionenTable.id, spedIds))
      : [];
    const spedMap: Record<number, string> = Object.fromEntries(speds.map((s) => [s.id, s.name]));

    const lines = [
      "ID,Datum,Spedition,Art,Menge,Bemerkungen",
      ...rows.map(
        (m) =>
          `${m.id},${m.movementDate},"${spedMap[m.speditionId] ?? m.speditionId}",${m.movementType},${m.amount},"${(m.bemerkungen ?? "").replace(/"/g, '""')}"`,
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="paletten-export.csv"`);
    return res.send(lines.join("\n"));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pallet-plant-count", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(palletPlantCountsTable)
      .orderBy(palletPlantCountsTable.recordedAt);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pallet-recalculate", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "pallet.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    // Recompute `amount` for all neutral movements from their raw pallet fields.
    // Net = an_net - von_net; stored as abs value for display.
    const rows = await db
      .update(palletMovementsTable)
      .set({
        amount: sql<number>`ABS(
          (COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0))
          - (COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0))
        )`,
      })
      .where(eq(palletMovementsTable.movementType, "neutral"))
      .returning({ id: palletMovementsTable.id });
    const updated = rows.length;
    return res.json({ updated, message: `${updated} neutrale Buchung${updated !== 1 ? "en" : ""} neu berechnet.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pallet-plant-count", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!can(role, "pallet.create")) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    const { recordedAt, amount, note } = req.body as { recordedAt: string; amount: number; note?: string };
    if (!recordedAt || amount == null || isNaN(Number(amount))) {
      return res.status(400).json({ error: "recordedAt und amount sind erforderlich" });
    }
    const [row] = await db
      .insert(palletPlantCountsTable)
      .values({ recordedAt, amount: Number(amount), note: note || null, createdBy: req.session.userId })
      .returning();
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
