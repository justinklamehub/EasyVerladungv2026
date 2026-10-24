import type { ClockEntry } from "@workspace/api-client-react";

export const NO_SHIFT = "none";
export const shiftFilterValue = (name: string) => `shift:${name.trim()}`;
type ShiftEntry = Pick<ClockEntry, "shiftName">;
type FilterEntry = Pick<ClockEntry, "shiftName" | "endedAt" | "firstName" | "lastName" | "cardNumber" | "provider" | "activity">;

export function attendanceShiftOptions(entries: readonly ShiftEntry[], selected = "", configuredShifts: readonly { name: string }[] = []) {
  const names = new Set([
    ...configuredShifts.map((shift) => shift.name.trim()),
    ...entries.map((entry) => entry.shiftName?.trim() ?? ""),
  ].filter(Boolean));
  // Preserve an explicit selection when another filter/date range has no matches.
  if (selected.startsWith("shift:")) names.add(selected.slice(6));
  return [...names].sort((a, b) => a.localeCompare(b, "de")).map((name) => ({
    value: shiftFilterValue(name), label: name,
  }));
}

export function filterAttendance<T extends FilterEntry>(entries: readonly T[], filters: { search: string; status: string; shift: string }): T[] {
  const q = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    const name = entry.shiftName?.trim() ?? "";
    const matchesShift = !filters.shift || (filters.shift === NO_SHIFT ? !name : !!name && shiftFilterValue(name) === filters.shift);
    return matchesShift &&
      (filters.status === "all" || (filters.status === "open") === (entry.endedAt === null)) &&
      (!q || `${entry.firstName} ${entry.lastName} ${entry.cardNumber} ${entry.provider} ${entry.activity}`.toLowerCase().includes(q));
  });
}
