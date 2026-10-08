import type { DashboardAnalytics } from "@workspace/api-zod";

type AnalyticsShipment = {
  etaDate: string | null;
  etaTime: string | null;
  ataDate: string | null;
  ataTime: string | null;
  status: string;
  lkwArt: string | null;
};

const DAY = 86_400_000;

function dateEpoch(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
  const epoch = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value ? epoch : null;
}

function clockMinutes(value: string | null): number | null {
  if (!value || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const [hours, minutes, seconds = 0] = value.split(":").map(Number);
  return hours < 24 && minutes < 60 && seconds < 60 ? hours * 60 + minutes + seconds / 60 : null;
}

export function dashboardRange(fromInput: unknown, toInput: unknown, today: string) {
  const from = fromInput == null || fromInput === "" ? today : fromInput;
  const to = toInput == null || toInput === "" ? today : toInput;
  const start = dateEpoch(from);
  const end = dateEpoch(to);
  if (start === null || end === null || start > end || (end - start) / DAY + 1 > 366) {
    throw new RangeError("Bitte einen gültigen Zeitraum von höchstens 366 Tagen wählen.");
  }
  return { from: from as string, to: to as string };
}

/** Cohort is selected by ETA OR ATA. Event counts use each event's own date. */
export function buildDashboardAnalytics(
  shipments: readonly AnalyticsShipment[], from: string, to: string,
): DashboardAnalytics {
  const { from: checkedFrom, to: checkedTo } = dashboardRange(from, to, from);
  const start = dateEpoch(checkedFrom)!;
  const end = dateEpoch(checkedTo)!;
  const grain = from === to ? "hour" : "day";
  const activity = Array.from({ length: grain === "hour" ? 24 : (end - start) / DAY + 1 }, (_, i) => ({
    label: grain === "hour" ? `${String(i).padStart(2, "0")}:00` : new Date(start + i * DAY).toISOString().slice(0, 10),
    eta: 0, ata: 0,
  }));
  let unplacedEta = 0, unplacedAta = 0, onTime = 0, delayed = 0, unknown = 0;
  const byKind = new Map<string, number>();
  const inRange = (date: string | null) => date !== null && dateEpoch(date) !== null && date >= from && date <= to;
  for (const shipment of shipments) {
    // Keep this helper safe even if a caller passes an unfiltered collection.
    if (!inRange(shipment.etaDate) && !inRange(shipment.ataDate)) continue;
    const kind = shipment.lkwArt?.trim() || "Nicht angegeben";
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    for (const event of ["eta", "ata"] as const) {
      const date = event === "eta" ? shipment.etaDate : shipment.ataDate;
      const time = clockMinutes(event === "eta" ? shipment.etaTime : shipment.ataTime);
      if (!inRange(date)) continue;
      if (grain === "hour" && time === null) {
        if (event === "eta") unplacedEta++; else unplacedAta++;
        continue;
      }
      const index = grain === "hour" ? Math.floor(time! / 60) : (dateEpoch(date)! - start) / DAY;
      activity[index][event]++;
    }
    // Punctuality refers to non-cancelled arrivals IN the selected period.
    if (!inRange(shipment.ataDate) || shipment.status === "Storniert") continue;
    const etaDay = dateEpoch(shipment.etaDate);
    const etaTime = clockMinutes(shipment.etaTime);
    const ataTime = clockMinutes(shipment.ataTime);
    if (etaDay === null || etaTime === null || ataTime === null) {
      unknown++;
    } else {
      // Compare recorded civil date/times; do not claim an elapsed-time duration.
      const planned = etaDay / DAY * 1440 + etaTime;
      const actual = dateEpoch(shipment.ataDate)! / DAY * 1440 + ataTime;
      if (actual <= planned) onTime++; else delayed++;
    }
  }
  return {
    dateFrom: from, dateTo: to, grain, activity, unplacedEta, unplacedAta,
    byLkwArt: [...byKind.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de")),
    punctuality: { onTime, delayed, unknown, onTimePercent: onTime + delayed ? onTime / (onTime + delayed) * 100 : null },
  };
}
