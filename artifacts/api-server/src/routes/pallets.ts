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

    // Build factor map from already-fetched speditionen
    const faktorMap: Record<number, number> = Object.fromEntries(speds.map((s) => [s.id, s.palletFaktor ?? 1]));

    // Aggregation split by movement type so factor can be applied in JS
    const agg = await db
      .select({
        speditionId: palletMovementsTable.speditionId,
        sumEingang:      sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'eingang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAusgang:      sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'ausgang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumKorrektur:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'korrektur' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        neutralAnNet:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        neutralVonNet:   sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        // Gross (no defekte) — used when faktor > 1 to exclude defective pallets entirely
        neutralAnGross:  sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        neutralVonGross: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        lastMovementDate: sql<string>`MAX(${palletMovementsTable.movementDate})`,
      })
      .from(palletMovementsTable)
      .where(inArray(palletMovementsTable.speditionId, spedIds))
      .groupBy(palletMovementsTable.speditionId);

    const aggMap: Record<number, { balance: number; lastMovementDate: string | null }> =
      Object.fromEntries(agg.map((r) => {
        const f = faktorMap[r.speditionId] ?? 1;
        // Factor N:1 = COMET gives 1, Spedition owes N back.
        // What COMET receives (eingang / an-side) is multiplied by f.
        // Ausgang and von-side are unchanged.
        // When f > 1, defective pallets are excluded (use gross totals instead of net).
        const balance = f > 1
          ? r.sumEingang * f - r.sumAusgang + r.sumKorrektur + (r.neutralAnGross * f - r.neutralVonGross)
          : r.sumEingang - r.sumAusgang + r.sumKorrektur + (r.neutralAnNet - r.neutralVonNet);
        return [r.speditionId, { balance, lastMovementDate: r.lastMovementDate }];
      }));

    return res.json(
      speds.map((s) => ({
        speditionId: s.id,
        speditionName: s.name,
        kuerzel: s.kuerzel,
        balance: aggMap[s.id]?.balance ?? 0,
        lastMovementDate: aggMap[s.id]?.lastMovementDate ?? null,
        palletFaktor: s.palletFaktor ?? 1,
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

    // Build factor map
    const faktorMap: Record<number, number> = Object.fromEntries(speds.map((s) => [s.id, s.palletFaktor ?? 1]));

    // Aggregation split so factor can be applied per-Spedition in JS
    const agg = await db
      .select({
        speditionId: palletMovementsTable.speditionId,
        // Pre-period components (for anfangsbestand)
        preEingang:     sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'eingang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preAusgang:     sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'ausgang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preKorrektur:   sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'korrektur' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preNeutralAnNet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        preNeutralVonNet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        preNeutralAnGross: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        preNeutralVonGross: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        // Within-period components
        zugaenge:       sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'eingang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        abgaengeRaw:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'ausgang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        korrekturRaw:   sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'korrektur' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        neutralAnNet:   sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        neutralVonNet:  sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        neutralAnGross:  sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        neutralVonGross:  sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        defekteVonComet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} THEN COALESCE(${palletMovementsTable.vonDefektePaletten}, 0) ELSE 0 END)`.mapWith(Number),
        defekteAnComet:  sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} THEN COALESCE(${palletMovementsTable.anDefektePaletten}, 0) ELSE 0 END)`.mapWith(Number),
      })
      .from(palletMovementsTable)
      .where(inArray(palletMovementsTable.speditionId, spedIds))
      .groupBy(palletMovementsTable.speditionId);

    const aggMap = Object.fromEntries(agg.map((r) => [r.speditionId, r]));

    const report = speds.map((s) => {
      const r = aggMap[s.id] ?? {
        preEingang: 0, preAusgang: 0, preKorrektur: 0, preNeutralAnNet: 0, preNeutralVonNet: 0,
        zugaenge: 0, abgaengeRaw: 0, korrekturRaw: 0, neutralAnNet: 0, neutralVonNet: 0,
        defekteVonComet: 0, defekteAnComet: 0,
        preNeutralAnGross: 0, preNeutralVonGross: 0,
        neutralAnGross: 0, neutralVonGross: 0,
      };
      const f = faktorMap[s.id] ?? 1;
      // Factor N:1: what COMET receives (eingang + neutral-an-side) × f; ausgang + neutral-von-side unchanged.
      // When f > 1: defekte excluded (use gross). When f = 1: use net (defekte subtracted).
      // Neutral movements are split into zugaenge (an-side) and abgaenge (von-side) for clear reporting.
      const preNeutralAn  = f > 1 ? r.preNeutralAnGross  : r.preNeutralAnNet;
      const preNeutralVon = f > 1 ? r.preNeutralVonGross : r.preNeutralVonNet;
      const neutralAn     = f > 1 ? r.neutralAnGross      : r.neutralAnNet;
      const neutralVon    = f > 1 ? r.neutralVonGross     : r.neutralVonNet;

      const anfangsbestand = (r.preEingang + preNeutralAn) * f - (r.preAusgang + preNeutralVon) + r.preKorrektur;
      const zugaenge   = (r.zugaenge + neutralAn) * f;
      const abgaenge   = r.abgaengeRaw + neutralVon;
      const korrekturen = r.korrekturRaw;
      const endbestand = anfangsbestand + zugaenge - abgaenge + korrekturen;
      return {
        speditionId: s.id,
        speditionName: s.name,
        palletFaktor: f,
        anfangsbestand,
        zugaenge: r.zugaenge,
        abgaenge,
        korrekturen,
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
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    const conditions = [];
    if (dateFrom) conditions.push(gte(palletPlantCountsTable.recordedAt, dateFrom));
    if (dateTo) conditions.push(lte(palletPlantCountsTable.recordedAt, dateTo));
    const rows = await db
      .select()
      .from(palletPlantCountsTable)
      .where(conditions.length ? and(...conditions) : undefined)
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
    // Recompute `amount` for ALL movements from their raw pallet fields.
    // Formula: ABS(an_net - von_net), same for every movement type.
    const rows = await db
      .update(palletMovementsTable)
      .set({
        amount: sql<number>`ABS(
          (COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0))
          - (COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0))
        )`,
      })
      .returning({ id: palletMovementsTable.id });
    const updated = rows.length;
    return res.json({ updated, message: `${updated} Buchung${updated !== 1 ? "en" : ""} geprüft und neu berechnet.` });
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
