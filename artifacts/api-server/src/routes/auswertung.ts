import { Router } from "express";
import { db } from "@workspace/db";
import { shipmentsTable, speditionenTable, auditLogTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

function parseDateTime(date: string | null, time: string | null): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time.length === 5 ? time : time + ":00"}:00`);
  return isNaN(d.getTime()) ? null : d;
}

function computeDelayMin(
  etaDate: string | null, etaTime: string | null,
  ataDate: string | null, ataTime: string | null,
): number | null {
  const eta = parseDateTime(etaDate, etaTime);
  const ata = parseDateTime(ataDate, ataTime);
  if (!eta || !ata) return null;
  return Math.round((ata.getTime() - eta.getTime()) / 60000);
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

router.get("/auswertung", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"].includes(role);

    const {
      dateFrom,
      dateTo,
      relation,
      speditionId,
      status,
    } = req.query as Record<string, string>;

    const today = new Date().toISOString().split("T")[0];
    const from = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const to = dateTo || today;

    let allShipments = await db.select().from(shipmentsTable);

    // Date filter (by etaDate or ataDate)
    allShipments = allShipments.filter((s) => {
      const refDate = s.etaDate || s.ataDate;
      if (!refDate) return false;
      return refDate >= from && refDate <= to;
    });

    // Role-based filter
    if (!isCometUser) {
      allShipments = allShipments.filter((s) => s.speditionId === sessionSpeditionId);
    }

    // Optional filters
    if (relation) allShipments = allShipments.filter((s) => s.relation === relation);
    if (speditionId) allShipments = allShipments.filter((s) => s.speditionId === Number(speditionId));
    if (status) allShipments = allShipments.filter((s) => s.status === status);

    const shipmentIds = allShipments.map((s) => s.id);

    // Load audit log for status changes
    const auditEntries = shipmentIds.length
      ? await db
          .select()
          .from(auditLogTable)
          .where(
            and(
              eq(auditLogTable.module, "shipments"),
              eq(auditLogTable.field, "status"),
              inArray(auditLogTable.recordId, shipmentIds),
            ),
          )
      : [];

    // Build map: shipmentId → { angekommenAt, verladenAt }
    const statusTimestamps: Record<number, { angekommenAt?: Date; verladenAt?: Date }> = {};
    for (const entry of auditEntries) {
      if (!statusTimestamps[entry.recordId]) statusTimestamps[entry.recordId] = {};
      const ts = statusTimestamps[entry.recordId];
      const entryTime = new Date(entry.changedAt);

      if (entry.newValue === "Angekommen") {
        if (!ts.angekommenAt || entryTime < ts.angekommenAt) ts.angekommenAt = entryTime;
      }
      if (entry.newValue === "Verladen" || entry.newValue === "Abgefertigt") {
        if (!ts.verladenAt || entryTime < ts.verladenAt) ts.verladenAt = entryTime;
      }
    }

    // Load speditionen
    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    // Build enriched shipments
    const enriched = allShipments.map((s) => {
      const verzoegerungMin = computeDelayMin(s.etaDate, s.etaTime, s.ataDate, s.ataTime);
      const ts = statusTimestamps[s.id];
      const verarbeitungszeitMin =
        ts?.angekommenAt && ts?.verladenAt
          ? Math.round((ts.verladenAt.getTime() - ts.angekommenAt.getTime()) / 60000)
          : null;

      return {
        id: s.id,
        bezeichnung: s.bezeichnung,
        kennzeichen: s.kennzeichen,
        relation: s.relation,
        lkwArt: s.lkwArt,
        speditionId: s.speditionId,
        speditionName: s.speditionId ? (spedMap[s.speditionId] ?? "–") : "–",
        tor: s.tor,
        status: s.status,
        etaDate: s.etaDate,
        etaTime: s.etaTime,
        ataDate: s.ataDate,
        ataTime: s.ataTime,
        verzoegerungMin,
        angekommenAt: ts?.angekommenAt?.toISOString() ?? null,
        verladenAt: ts?.verladenAt?.toISOString() ?? null,
        verarbeitungszeitMin,
        createdAt: s.createdAt,
      };
    });

    // ── Aggregate stats ────────────────────────────────────────────────────
    const withDelay = enriched.filter((s) => s.verzoegerungMin !== null);
    const TOLERANCE = 15;

    const puenktlich = withDelay.filter((s) => Math.abs(s.verzoegerungMin!) <= TOLERANCE).length;
    const verspaetet = withDelay.filter((s) => s.verzoegerungMin! > TOLERANCE).length;
    const zuFrueh   = withDelay.filter((s) => s.verzoegerungMin! < -TOLERANCE).length;

    const avgVerzoegerungMin = avg(withDelay.map((s) => s.verzoegerungMin!));
    const avgVerarbeitungszeitMin = avg(
      enriched.filter((s) => s.verarbeitungszeitMin !== null && s.verarbeitungszeitMin >= 0).map((s) => s.verarbeitungszeitMin!),
    );

    // By status
    const statusMap: Record<string, number> = {};
    for (const s of enriched) statusMap[s.status] = (statusMap[s.status] || 0) + 1;
    const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // By relation
    const relationMap: Record<string, { count: number; delays: number[] }> = {};
    for (const s of enriched) {
      const key = s.relation || "–";
      if (!relationMap[key]) relationMap[key] = { count: 0, delays: [] };
      relationMap[key].count++;
      if (s.verzoegerungMin !== null) relationMap[key].delays.push(s.verzoegerungMin);
    }
    const byRelation = Object.entries(relationMap)
      .map(([relation, { count, delays }]) => ({ relation, count, avgVerzoegerungMin: avg(delays) }))
      .sort((a, b) => b.count - a.count);

    // By spedition
    const spedCountMap: Record<string, { count: number; delays: number[]; name: string }> = {};
    for (const s of enriched) {
      const key = String(s.speditionId ?? 0);
      if (!spedCountMap[key]) spedCountMap[key] = { count: 0, delays: [], name: s.speditionName };
      spedCountMap[key].count++;
      if (s.verzoegerungMin !== null) spedCountMap[key].delays.push(s.verzoegerungMin);
    }
    const bySpedition = Object.entries(spedCountMap)
      .map(([id, { count, delays, name }]) => ({ speditionId: Number(id), speditionName: name, count, avgVerzoegerungMin: avg(delays) }))
      .sort((a, b) => b.count - a.count);

    // Available filter values
    const relations = [...new Set(allShipments.map((s) => s.relation).filter(Boolean))].sort();

    return res.json({
      shipments: enriched,
      stats: {
        gesamt: enriched.length,
        mitAta: withDelay.length,
        puenktlich,
        verspaetet,
        zuFrueh,
        avgVerzoegerungMin,
        avgVerarbeitungszeitMin,
        byStatus,
        byRelation,
        bySpedition,
      },
      meta: { from, to, relations, speditionen: speds.map((s) => ({ id: s.id, name: s.name })) },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
