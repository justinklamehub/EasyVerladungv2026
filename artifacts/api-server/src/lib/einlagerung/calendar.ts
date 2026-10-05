// ISO week-year, not Gregorian year around New Year's Eve.
export function calendarWeek(value: unknown): string {
  const s = String(value ?? "").trim();
  const week = s.match(/^(?:KW\s*)?(\d{1,2})[./-](\d{4})$/i);
  if (week && Number(week[1]) >= 1 && Number(week[1]) <= Number(calendarWeek(`${week[2]}-12-28`).split(".")[0]))
    return `${Number(week[1])}.${week[2]}`;
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!de && !iso) return "";
  const y = Number(de?.[3] ?? iso?.[1]), m = Number(de?.[2] ?? iso?.[2]), d = Number(de?.[1] ?? iso?.[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const n = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${n}.${year}`;
}
export function matchesTerm(value: unknown, plus: unknown, query: unknown): boolean {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  const raw = `${value ?? ""} + ${plus ?? ""}`.toLowerCase();
  const normalized = calendarWeek(q);
  if (normalized && !/^\d{4}-|^\d{1,2}\.\d{1,2}\.\d{4}$/.test(q))
    return calendarWeek(value) === normalized;
  if (raw.includes(q)) return true;
  const iso = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const de = String(value ?? "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return !!(iso && `${iso[3]}.${iso[2]}.${iso[1]}` === q) ||
    !!(de && `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}` === q);
}
