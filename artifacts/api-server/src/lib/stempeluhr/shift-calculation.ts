import type { ClockShift, ClockShiftAssignment, ClockShiftException, ClockShiftDay } from "@workspace/api-zod";
import { berlinInstant, localDay, type Settings } from "./calculation";

export interface ShiftData {
  shifts: ClockShift[];
  assignments: ClockShiftAssignment[];
  exceptions: ClockShiftException[];
}
export function addDays(day: string, count: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function weekday(day: string) {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 + 1;
}
export const monday = (day: string) => addDays(day, 1 - weekday(day));
export function cycleIndex(day: string, anchorMonday: string, length: number) {
  const weeks = Math.round((Date.parse(`${monday(day)}T00:00:00Z`) - Date.parse(`${anchorMonday}T00:00:00Z`)) / (7 * 86400000));
  return ((weeks % length) + length) % length;
}
function applies(p: { employeeId: number; startsOn: string; endsOn: string | null }, employeeId: number, day: string) {
  return p.employeeId === employeeId && p.startsOn <= day && (p.endsOn == null || p.endsOn >= day);
}
export function plannedDay(data: ShiftData, employeeId: number, day: string): ClockShiftDay {
  const base: ClockShiftDay = { employeeId, day, shiftId: null, shiftName: null, startsAt: null, endsAt: null, plannedMinutes: 0, source: "none" };
  const exception = data.exceptions.find((p) => applies(p, employeeId, day) && p.weekdays.includes(weekday(day)));
  const assignment = data.assignments.find((p) => applies(p, employeeId, day));
  let shiftId: number | null;
  if (exception) {
    base.source = "exception";
    shiftId = exception.shiftId;
  } else if (assignment) {
    base.source = "assignment";
    shiftId = assignment.weekdays.includes(weekday(day))
      ? assignment.shiftIds[cycleIndex(day, assignment.anchorMonday, assignment.shiftIds.length)] : null;
  } else return base;
  if (shiftId == null) return { ...base, shiftName: "Frei" };
  const shift = data.shifts.find((s) => s.id === shiftId);
  if (!shift) throw new Error("Eine zugeordnete Schichtvorlage fehlt.");
  const start = berlinInstant(day, shift.startTime);
  const end = berlinInstant(shift.endTime < shift.startTime ? addDays(day, 1) : day, shift.endTime);
  const gross = Math.round((end.getTime() - start.getTime()) / 60000);
  return { ...base, shiftId, shiftName: shift.name, startsAt: start.toISOString(), endsAt: end.toISOString(), plannedMinutes: Math.max(0, gross - shift.pauseMinutes) };
}
/** Resolve late arrival after midnight against the preceding workday, not the next rotation week. */
export function rulesForShift(data: ShiftData, employeeId: number, start: Date, settings: Settings): Settings {
  const today = localDay(start);
  const previous = plannedDay(data, employeeId, addDays(today, -1));
  const previousContains = previous.startsAt && previous.endsAt &&
    localDay(new Date(previous.endsAt)) === today &&
    start.getTime() >= Date.parse(previous.startsAt) && start.getTime() < Date.parse(previous.endsAt);
  const day = previousContains ? previous : plannedDay(data, employeeId, today);
  if (day.source === "none") return settings;
  const shift = data.shifts.find((s) => s.id === day.shiftId);
  const boundary = berlinInstant(day.day).toISOString();
  return {
    ...settings, earliestStart: null, latestEnd: null,
    breakRules: [{ fromMinutes: 0, deductionMinutes: shift?.pauseMinutes ?? 0 }],
    shiftWindow: { day: day.day, name: day.shiftName!, shiftId: day.shiftId, start: day.startsAt ?? boundary, end: day.endsAt ?? boundary },
  };
}
