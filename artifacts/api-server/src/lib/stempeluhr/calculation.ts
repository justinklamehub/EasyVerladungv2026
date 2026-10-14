export interface TimeRules {
  earliestStart: string | null;
  latestEnd: string | null;
  breakRules: { fromMinutes: number; deductionMinutes: number }[];
}
export interface Settings extends TimeRules {
  terminalHours: number;
  debounceSeconds: number;
  updatedAt: string;
}
export const DEFAULT_SETTINGS: Settings = {
  earliestStart: "06:45", latestEnd: "16:00",
  breakRules: [
    { fromMinutes: 0, deductionMinutes: 15 },
    { fromMinutes: 401, deductionMinutes: 30 },
    { fromMinutes: 510, deductionMinutes: 45 },
  ],
  terminalHours: 12, debounceSeconds: 10, updatedAt: "",
};
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function localParts(date: Date) {
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}
export function localDay(date: Date) {
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
/** Reject missing or ambiguous local times instead of silently moving a DST scan. */
export function berlinInstant(day: string, time = "00:00"): Date {
  const [year, month, d] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const nominal = Date.UTC(year, month - 1, d, hour, minute);
  const candidates = [1, 2].map((offset) => new Date(nominal - offset * 3600000)).filter((date) => {
    const p = localParts(date);
    return localDay(date) === day && Number(p.hour) === hour && Number(p.minute) === minute;
  });
  if (candidates.length !== 1) throw new Error("Ungültige oder mehrdeutige Ortszeit (Europe/Berlin).");
  return candidates[0];
}
export function nextDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function calculate(start: Date, end: Date | null, rules: TimeRules, pauseOverride: number | null = null) {
  let bookedStart = start;
  if (rules.earliestStart) {
    const boundary = berlinInstant(localDay(start), rules.earliestStart);
    if (start < boundary) bookedStart = boundary;
  }
  if (!end) return { bookedStart: bookedStart.toISOString(), bookedEnd: null, grossMinutes: null, pauseMinutes: null, netMinutes: null };
  let bookedEnd = end;
  // A same-day end cap must not truncate night shifts to the previous afternoon.
  if (rules.latestEnd && localDay(start) === localDay(end)) {
    const boundary = berlinInstant(localDay(end), rules.latestEnd);
    if (end > boundary) bookedEnd = boundary;
  }
  // A short scan wholly before the configured start counts as zero, never negative.
  if (bookedEnd < bookedStart) bookedEnd = bookedStart;
  const grossMinutes = Math.max(0, Math.floor((bookedEnd.getTime() - bookedStart.getTime()) / 60000));
  const rule = [...rules.breakRules].sort((a, b) => b.fromMinutes - a.fromMinutes).find((r) => grossMinutes >= r.fromMinutes);
  const pauseMinutes = Math.min(grossMinutes, pauseOverride ?? rule?.deductionMinutes ?? 0);
  return { bookedStart: bookedStart.toISOString(), bookedEnd: bookedEnd.toISOString(), grossMinutes, pauseMinutes, netMinutes: grossMinutes - pauseMinutes };
}
