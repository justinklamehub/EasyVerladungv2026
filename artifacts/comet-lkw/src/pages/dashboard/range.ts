import { addDays, endOfWeek, format, startOfWeek, differenceInCalendarDays, parse, isValid } from "date-fns";

export type Preset = "today" | "tomorrow" | "week" | "last7" | "last30" | "custom";
export const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Heute" }, { id: "tomorrow", label: "Morgen" }, { id: "week", label: "Diese Woche" },
  { id: "last7", label: "Letzte 7 Tage" }, { id: "last30", label: "Letzte 30 Tage" }, { id: "custom", label: "Benutzerdefiniert" },
];
const f = (d: Date) => format(d, "yyyy-MM-dd");

export function resolvePreset(p: Exclude<Preset, "custom">, now = new Date()) {
  switch (p) {
    case "tomorrow": return { from: f(addDays(now, 1)), to: f(addDays(now, 1)) };
    case "week": return { from: f(startOfWeek(now, { weekStartsOn: 1 })), to: f(endOfWeek(now, { weekStartsOn: 1 })) };
    case "last7": return { from: f(addDays(now, -6)), to: f(now) };
    case "last30": return { from: f(addDays(now, -29)), to: f(now) };
    default: return { from: f(now), to: f(now) };
  }
}
const real = (s: string) => {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) && f(d) === s ? d : null;
};
export function validateRange(from: string, to: string): string | null {
  const a = real(from), b = real(to);
  if (!a || !b) return "Bitte zwei gültige Kalenderdaten angeben.";
  if (a > b) return "Das Startdatum darf nicht nach dem Enddatum liegen.";
  if (differenceInCalendarDays(b, a) + 1 > 366) return "Der Zeitraum darf höchstens 366 Tage umfassen.";
  return null;
}
export const fmtDay = (s: string) => { const d = real(s); return d ? format(d, "dd.MM.yyyy") : s; };
export const fmtRange = (a: string, b: string) => (a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);
