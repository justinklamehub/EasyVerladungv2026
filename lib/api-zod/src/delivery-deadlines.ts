import type { EinlagerungDeadlineThresholds } from "./generated/types";
type D = Record<string, any>;

export const DEFAULT_DEADLINE_THRESHOLDS: EinlagerungDeadlineThresholds = {
  criticalDays: 2, soonDays: 7, upcomingDays: 14,
};
export const DEADLINE_TIME_ZONE = "Europe/Berlin";
export type DeadlineStatus = "critical" | "soon" | "upcoming" | "safe" | "week" | "unknown";
export type DeadlineOrder = {
  order: D; status: DeadlineStatus; days: number | null; dateLabel: string; sortDay: number;
};
const DAY = 86_400_000;

/** Calendar-day arithmetic, not 24-hour intervals: unaffected by DST or browser timezone. */
export function todayOrdinal(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEADLINE_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY;
}

function ordinal(y: number, m: number, d: number): number | null {
  if (y < 1900 || y > 9999) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.getTime() / DAY : null;
}
function isoWeekStart(y: number, w: number) {
  const jan4 = new Date(Date.UTC(y, 0, 4));
  return (jan4.getTime() / DAY) - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7;
}

export function parseDeliveryTerm(value: unknown): { kind: "date" | "week" | "unknown"; day: number | null; label: string } {
  const text = String(value ?? "").trim();
  const de = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (de || iso) {
    const y = Number(de?.[3] ?? iso?.[1]), m = Number(de?.[2] ?? iso?.[2]), d = Number(de?.[1] ?? iso?.[3]);
    const day = ordinal(y, m, d);
    if (day != null) return { kind: "date", day, label: `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}` };
  }
  const kw = text.match(/^(?:KW\s*)?(\d{1,2})[./-](\d{4})$/i);
  if (kw) {
    const w = Number(kw[1]), y = Number(kw[2]);
    if (y >= 1900 && y < 9999 && w >= 1 && w <= 53 &&
      isoWeekStart(y, w) < isoWeekStart(y + 1, 1)) {
      return { kind: "week", day: isoWeekStart(y, w), label: `KW ${w}.${y}` };
    }
  }
  return { kind: "unknown", day: null, label: text || "Termin fehlt" };
}

export function validDeadlineThresholds(d: EinlagerungDeadlineThresholds) {
  return Object.values(d).every((n) => Number.isInteger(n) && n >= 0 && n <= 3650) &&
    d.criticalDays < d.soonDays && d.soonDays < d.upcomingDays;
}

export function classifyDeliveryOrders(orders: D[], thresholds: EinlagerungDeadlineThresholds, now = new Date()): DeadlineOrder[] {
  const today = todayOrdinal(now);
  return orders.map((order): DeadlineOrder => {
    const term = parseDeliveryTerm(order.termin);
    const days = term.day != null ? term.day - today : null;
    const status: DeadlineStatus = days == null ? (term.kind === "week" ? "week" : "unknown") :
      days <= thresholds.criticalDays ? "critical" : days <= thresholds.soonDays ? "soon" :
        days <= thresholds.upcomingDays ? "upcoming" : "safe";
    return { order, status, days, dateLabel: term.label, sortDay: term.day ?? Number.POSITIVE_INFINITY };
  }).sort((a, b) => {
    const band = (s: DeadlineStatus) => s === "unknown" ? 2 : s === "week" ? 1 : 0;
    return band(a.status) - band(b.status) || a.sortDay - b.sortDay ||
      String(a.order.shelf).localeCompare(String(b.order.shelf), "de", { numeric: true });
  });
}

export function deadlineSummary(rows: DeadlineOrder[]) {
  const totals: Record<DeadlineStatus, { orders: number; pallets: number }> = {
    critical: { orders: 0, pallets: 0 }, soon: { orders: 0, pallets: 0 },
    upcoming: { orders: 0, pallets: 0 }, safe: { orders: 0, pallets: 0 },
    week: { orders: 0, pallets: 0 }, unknown: { orders: 0, pallets: 0 },
  };
  for (const row of rows) {
    totals[row.status].orders++;
    totals[row.status].pallets += Number(row.order.paletten) || 0;
  }
  return totals;
}
