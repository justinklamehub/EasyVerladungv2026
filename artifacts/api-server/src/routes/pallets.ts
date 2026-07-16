import { Router } from "express";
import { db } from "@workspace/db";
import {
  palletMovementsTable,
  palletPlantCountsTable,
  speditionenTable,
  usersTable,
  shipmentsTable,
} from "@workspace/db";
import { and, eq, gte, lte, ilike, inArray, sql, desc } from "drizzle-orm";
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
    const { speditionId, dateFrom, dateTo, shipmentId, palettenscheinnummer } = req.query as Record<string, string>;
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
    if (palettenscheinnummer) conditions.push(ilike(palletMovementsTable.palettenscheinnummer, `%${palettenscheinnummer}%`));

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
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ error: "Ungültige Menge" });
    }
    // anfangsbestand, abstimmung and abschreibung allow negative values; all other types must be >= 0
    if (movementType !== "anfangsbestand" && movementType !== "abstimmung" && movementType !== "abschreibung" && parsedAmount < 0) {
      return res.status(400).json({ error: "Ungültige Menge" });
    }
    const absAmount = parsedAmount;

    if (movementType !== "abstimmung" && movementType !== "anfangsbestand" && movementType !== "abschreibung" && !palettenscheinnummer) {
      return res.status(400).json({ error: "Palettenscheinnummer ist erforderlich" });
    }

    const { reconciliationId } = req.body;

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
        reconciliationId: reconciliationId ?? null,
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
        sumKorrektur:        sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'korrektur'       THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAnfangsbestand:   sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'anfangsbestand' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAbstimmung:       sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'abstimmung'     THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAbschreibung:     sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType} = 'abschreibung'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
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
          ? r.sumEingang * f - r.sumAusgang + r.sumKorrektur + r.sumAnfangsbestand + r.sumAbstimmung + r.sumAbschreibung + (r.neutralAnGross * f - r.neutralVonGross)
          : r.sumEingang - r.sumAusgang + r.sumKorrektur + r.sumAnfangsbestand + r.sumAbstimmung + r.sumAbschreibung + (r.neutralAnNet - r.neutralVonNet);
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
        preKorrektur:         sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'korrektur'       THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preAnfangsbestand:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'anfangsbestand' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preAbstimmung:        sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'abstimmung'     THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preAbschreibung:      sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'abschreibung'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        preNeutralAnNet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        preNeutralVonNet: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        preNeutralAnGross: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        preNeutralVonGross: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} < ${dateFrom} AND ${palletMovementsTable.movementType} = 'neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        // Within-period components
        zugaenge:       sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'eingang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        abgaengeRaw:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'ausgang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        korrekturRaw:         sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'korrektur'       THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        anfangsbestandRaw:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'anfangsbestand' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        abstimmungRaw:        sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'abstimmung'     THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        abschreibungRaw:      sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementDate} >= ${dateFrom} AND ${palletMovementsTable.movementDate} <= ${dateTo} AND ${palletMovementsTable.movementType} = 'abschreibung'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
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
        preEingang: 0, preAusgang: 0, preKorrektur: 0, preAnfangsbestand: 0, preAbstimmung: 0, preAbschreibung: 0,
        preNeutralAnNet: 0, preNeutralVonNet: 0,
        zugaenge: 0, abgaengeRaw: 0, korrekturRaw: 0, anfangsbestandRaw: 0, abstimmungRaw: 0, abschreibungRaw: 0,
        neutralAnNet: 0, neutralVonNet: 0,
        defekteVonComet: 0, defekteAnComet: 0,
        preNeutralAnGross: 0, preNeutralVonGross: 0,
        neutralAnGross: 0, neutralVonGross: 0,
      };
      const f = faktorMap[s.id] ?? 1;
      // Factor N:1: displayed zugaenge/abgaenge show RAW physical quantities (no factor applied).
      // The factor only affects anfangsbestand and endbestand (balance calculation).
      // Defekte (defective pallets) are EXCLUDED from zugaenge/abgaenge columns — they are
      // shown separately in defekteVonComet / defekteAnComet, and rolled into "saldo".
      // Neutral movements are split: AN-side → Zugänge (gross), VON-side → Abgänge (gross).
      const neutralAnRaw  = r.neutralAnGross;
      const neutralVonRaw = r.neutralVonGross;
      const preNeutralAnRaw  = r.preNeutralAnGross;
      const preNeutralVonRaw = r.preNeutralVonGross;

      // Display columns: raw physical quantities
      const zugaenge    = r.zugaenge + neutralAnRaw;
      const abgaenge    = r.abgaengeRaw + neutralVonRaw;
      const korrekturen = r.korrekturRaw;

      // Balance calculation: factor applied to the "received by COMET" side only
      const preZugaengeRaw = r.preEingang + preNeutralAnRaw;
      const preAbgaengeRaw = r.preAusgang + preNeutralVonRaw;
      const anfangsbestand = preZugaengeRaw * f - preAbgaengeRaw + r.preKorrektur + r.preAnfangsbestand + r.preAbstimmung + r.preAbschreibung;
      const endbestand     = anfangsbestand + zugaenge * f - abgaenge + korrekturen + r.anfangsbestandRaw + r.abstimmungRaw + r.abschreibungRaw;
      return {
        speditionId: s.id,
        speditionName: s.name,
        palletFaktor: f,
        anfangsbestand,
        zugaenge,
        abgaenge,
        korrekturen,
        endbestand,
        defekteVonComet: r.defekteVonComet,
        defekteAnComet: r.defekteAnComet,
        defekteGesamt: r.defekteVonComet + r.defekteAnComet,
        saldo: endbestand + r.defekteVonComet - r.defekteAnComet,
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

router.get("/pallet-werkbestand", requireAuth, async (req, res) => {
  try {
    // Step 1: find the latest manual inventory entry
    const [latest] = await db
      .select({ recordedAt: palletPlantCountsTable.recordedAt, amount: palletPlantCountsTable.amount })
      .from(palletPlantCountsTable)
      .orderBy(sql`${palletPlantCountsTable.recordedAt} DESC`)
      .limit(1);

    if (!latest) {
      return res.json({ werkbestand: null, inventurDate: null, hasInventur: false });
    }

    // Step 2: sum all physical movements AFTER the inventory date
    // Only eingang/ausgang/korrektur/neutral count — anfangsbestand & abstimmung are
    // purely financial customer-account entries, not physical pallet movements.
    const [r] = await db
      .select({
        sumEingang:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='eingang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAusgang:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='ausgang'   THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumKorrektur:  sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='korrektur' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        neutralAnGross: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0)+COALESCE(${palletMovementsTable.anCometLadungssicherung},0)+COALESCE(${palletMovementsTable.anDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        neutralVonGross:sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0)+COALESCE(${palletMovementsTable.vonCometLadungssicherung},0)+COALESCE(${palletMovementsTable.vonDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
      })
      .from(palletMovementsTable)
      .where(sql`${palletMovementsTable.movementDate} > ${latest.recordedAt}`);

    const delta =
      r.sumEingang - r.sumAusgang + r.sumKorrektur
      + (r.neutralAnGross - r.neutralVonGross);

    return res.json({
      werkbestand: latest.amount + delta,
      inventurDate: latest.recordedAt,
      hasInventur: true,
    });
  } catch (err) {
    console.error(err);
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

router.get("/pallet-balance-at", requireAuth, async (req, res) => {
  try {
    const speditionId = Number(req.query.speditionId);
    const asOf = req.query.asOf as string;
    if (!speditionId || !asOf) {
      return res.status(400).json({ error: "speditionId und asOf erforderlich" });
    }
    const [sped] = await db
      .select({ palletFaktor: speditionenTable.palletFaktor })
      .from(speditionenTable)
      .where(eq(speditionenTable.id, speditionId));
    const f = sped?.palletFaktor ?? 1;

    const [r] = await db
      .select({
        sumEingang:        sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='eingang'        THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAusgang:        sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='ausgang'        THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumKorrektur:      sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='korrektur'      THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAnfangsbestand: sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='anfangsbestand' THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        sumAbstimmung:     sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='abstimmung'     THEN ${palletMovementsTable.amount} ELSE 0 END)`.mapWith(Number),
        neutralAnNet:      sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0)+COALESCE(${palletMovementsTable.anCometLadungssicherung},0)-COALESCE(${palletMovementsTable.anDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        neutralVonNet:     sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0)+COALESCE(${palletMovementsTable.vonCometLadungssicherung},0)-COALESCE(${palletMovementsTable.vonDefektePaletten},0) ELSE 0 END)`.mapWith(Number),
        neutralAnGross:    sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='neutral' THEN COALESCE(${palletMovementsTable.anCometEuropaletten},0)+COALESCE(${palletMovementsTable.anCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
        neutralVonGross:   sql<number>`SUM(CASE WHEN ${palletMovementsTable.movementType}='neutral' THEN COALESCE(${palletMovementsTable.vonCometEuropaletten},0)+COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) ELSE 0 END)`.mapWith(Number),
      })
      .from(palletMovementsTable)
      .where(and(
        eq(palletMovementsTable.speditionId, speditionId),
        lte(palletMovementsTable.movementDate, asOf),
      ));

    const balance = f > 1
      ? r.sumEingang * f - r.sumAusgang + r.sumKorrektur + r.sumAnfangsbestand + r.sumAbstimmung + (r.neutralAnGross * f - r.neutralVonGross)
      : r.sumEingang - r.sumAusgang + r.sumKorrektur + r.sumAnfangsbestand + r.sumAbstimmung + (r.neutralAnNet - r.neutralVonNet);

    return res.json({ balance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pallet-recalculate", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "pallet.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    // Recompute `amount` for standard movements from their raw pallet fields.
    // Formula: ABS(an_net - von_net).
    // Excluded: anfangsbestand + abstimmung (signed correction entered directly by user).
    const rows = await db
      .update(palletMovementsTable)
      .set({
        amount: sql<number>`ABS(
          (COALESCE(${palletMovementsTable.anCometEuropaletten},0) + COALESCE(${palletMovementsTable.anCometLadungssicherung},0) - COALESCE(${palletMovementsTable.anDefektePaletten},0))
          - (COALESCE(${palletMovementsTable.vonCometEuropaletten},0) + COALESCE(${palletMovementsTable.vonCometLadungssicherung},0) - COALESCE(${palletMovementsTable.vonDefektePaletten},0))
        )`,
      })
      .where(sql`${palletMovementsTable.movementType} NOT IN ('anfangsbestand', 'abstimmung')`)
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
