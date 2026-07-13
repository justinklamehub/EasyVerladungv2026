import { Router } from "express";
import { db } from "@workspace/db";
import {
  shipmentsTable,
  speditionenTable,
  palletMovementsTable,
  palletReconciliationsTable,
  settingsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    const today = new Date().toISOString().split("T")[0];
    const from = dateFrom || today;
    const to = dateTo || today;

    let shipments = await db.select().from(shipmentsTable);

    // Filter by date range
    shipments = shipments.filter(
      (s) =>
        (s.etaDate && s.etaDate >= from && s.etaDate <= to) ||
        (s.ataDate && s.ataDate >= from && s.ataDate <= to)
    );

    // Spedition users see only their own
    if (["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(role)) {
      shipments = shipments.filter((s) => s.speditionId === sessionSpeditionId);
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const totalShipments = shipments.length;
    const expectedShipments = shipments.filter((s) => s.status === "Erwartet" || s.status === "Angemeldet").length;
    const arrivedShipments = shipments.filter((s) => s.ataDate !== null).length;
    const openShipments = shipments.filter((s) => !["Abgefertigt", "Storniert"].includes(s.status)).length;

    // Late: etaDate is today or earlier, etaTime is past, not yet arrived
    const lateShipments = shipments.filter((s) => {
      if (s.ataDate) return false;
      if (!s.etaDate || !s.etaTime) return false;
      return s.etaDate < today || (s.etaDate === today && s.etaTime < currentTime);
    }).length;

    // By status
    const statusCounts: Record<string, number> = {};
    for (const s of shipments) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    }
    const byStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // By spedition
    const spedCounts: Record<number, number> = {};
    for (const s of shipments) {
      if (s.speditionId) spedCounts[s.speditionId] = (spedCounts[s.speditionId] || 0) + 1;
    }

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    const bySpedition = Object.entries(spedCounts).map(([speditionId, count]) => ({
      speditionId: Number(speditionId),
      speditionName: spedMap[Number(speditionId)] ?? "Unknown",
      count,
    }));

    // Pallet balances
    const movements = await db.select().from(palletMovementsTable);
    let filteredSpeds = speds.filter((s) => s.status === "aktiv");
    if (["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(role)) {
      filteredSpeds = filteredSpeds.filter((s) => s.id === sessionSpeditionId);
    }
    const palletBalances = filteredSpeds.map((s) => {
      const spedMvts = movements.filter((m) => m.speditionId === s.id);
      const balance = spedMvts.reduce((sum, m) => {
        if (m.movementType === "eingang") return sum + m.amount;
        if (m.movementType === "ausgang") return sum - m.amount;
        if (m.movementType === "korrektur") return sum + m.amount;
        return sum;
      }, 0);
      return {
        speditionId: s.id,
        speditionName: s.name,
        kuerzel: s.kuerzel,
        balance,
        lastMovementDate: null,
      };
    });

    // Open reconciliations count
    const recs = await db.select().from(palletReconciliationsTable);
    let filteredRecs = recs.filter((r) => r.status === "offen" || r.status === "in_pruefung");
    if (["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(role)) {
      filteredRecs = filteredRecs.filter((r) => r.speditionId === sessionSpeditionId);
    }

    return res.json({
      totalShipments,
      expectedShipments,
      arrivedShipments,
      openShipments,
      lateShipments,
      byStatus,
      bySpedition,
      palletBalances,
      openReconciliations: filteredRecs.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Live SLA alerts (Brennpunkt) ──────────────────────────────────────────────

router.get("/dashboard/live-alerts", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const isSpedUser = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(role);

    // Load configurable SLA thresholds from settings
    const settingsRows = await db.select().from(settingsTable);
    const sm = Object.fromEntries(settingsRows.map((r) => [r.key, r.value ?? ""]));
    const parseSla = (k: string, def: number) => {
      const v = parseInt(sm[k] ?? "", 10);
      return Number.isFinite(v) && v > 0 ? v : def;
    };
    const sla = {
      angekommen_warn_min:    parseSla("sla_angekommen_warn_min",    60),
      angekommen_danger_min:  parseSla("sla_angekommen_danger_min",  90),
      inverladung_warn_min:   parseSla("sla_inverladung_warn_min",  120),
      inverladung_danger_min: parseSla("sla_inverladung_danger_min",180),
      eta_warn_min:           parseSla("sla_eta_warn_min",           30),
      eta_danger_min:         parseSla("sla_eta_danger_min",         60),
    };

    let allShipments = await db.select().from(shipmentsTable);
    allShipments = allShipments.filter((s) =>
      ["Angekommen", "in Verladung", "Angemeldet", "Erwartet"].includes(s.status)
    );
    if (isSpedUser) allShipments = allShipments.filter((s) => s.speditionId === sessionSpeditionId);

    const speds = await db.select({ id: speditionenTable.id, name: speditionenTable.name }).from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    const nowMs = Date.now();

    type Alert = {
      id: number;
      bezeichnung: string | null;
      kennzeichen: string | null;
      status: string;
      tor: string | null;
      speditionName: string;
      level: "warn" | "danger";
      minutesWaiting: number;
      alertReason: "timeInStatus" | "etaOverdue";
    };

    const alerts: Alert[] = [];

    for (const s of allShipments) {
      let level: "warn" | "danger" | null = null;
      let minutesWaiting = 0;
      let alertReason: Alert["alertReason"] = "timeInStatus";

      const statusChangedAt = (s as any).statusChangedAt as Date | string | null;

      if ((s.status === "Angekommen" || s.status === "in Verladung") && statusChangedAt) {
        const minIn = (nowMs - new Date(statusChangedAt).getTime()) / 60_000;
        const warnMin   = s.status === "Angekommen" ? sla.angekommen_warn_min   : sla.inverladung_warn_min;
        const dangerMin = s.status === "Angekommen" ? sla.angekommen_danger_min : sla.inverladung_danger_min;
        if (minIn >= dangerMin)    { level = "danger"; minutesWaiting = Math.round(minIn); }
        else if (minIn >= warnMin) { level = "warn";   minutesWaiting = Math.round(minIn); }
        alertReason = "timeInStatus";
      } else if ((s.status === "Angemeldet" || s.status === "Erwartet") && s.etaDate && s.etaTime) {
        const eta = new Date(`${s.etaDate}T${s.etaTime.length === 5 ? s.etaTime : s.etaTime + ":00"}:00`);
        const minsLate = (nowMs - eta.getTime()) / 60_000;
        if (minsLate >= sla.eta_danger_min)    { level = "danger"; minutesWaiting = Math.round(minsLate); }
        else if (minsLate >= sla.eta_warn_min) { level = "warn";   minutesWaiting = Math.round(minsLate); }
        alertReason = "etaOverdue";
      }

      if (level) {
        alerts.push({
          id: s.id,
          bezeichnung: s.bezeichnung,
          kennzeichen: s.kennzeichen,
          status: s.status,
          tor: s.tor,
          speditionName: s.speditionId ? (spedMap[s.speditionId] ?? "–") : "–",
          level,
          minutesWaiting,
          alertReason,
        });
      }
    }

    // danger first, then by longest waiting
    alerts.sort((a, b) => {
      if (a.level !== b.level) return a.level === "danger" ? -1 : 1;
      return b.minutesWaiting - a.minutesWaiting;
    });

    return res.json({ alerts, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
