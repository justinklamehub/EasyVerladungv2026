import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, DEFAULT_SETTINGS, berlinInstant } from "./calculation";
import { cycleIndex, monday, plannedDay, rulesForShift, type ShiftData } from "./shift-calculation";

const data: ShiftData = {
  shifts: [
    { id: 1, name: "Früh", startTime: "06:00", endTime: "14:00", pauseMinutes: 30, updatedAt: "" },
    { id: 2, name: "Spät", startTime: "14:00", endTime: "22:00", pauseMinutes: 30, updatedAt: "" },
    { id: 3, name: "Nacht", startTime: "22:00", endTime: "06:00", pauseMinutes: 30, updatedAt: "" },
  ],
  assignments: [{ id: 1, employeeId: 1, startsOn: "2026-10-19", endsOn: null, anchorMonday: "2026-10-19", weekdays: [1, 2, 3, 4, 5], shiftIds: [1, 2], updatedAt: "" }],
  exceptions: [],
};
const instant = (day: string, time: string) => berlinInstant(day, time);
test("Monday-anchored rotation alternates weeks and does not reset at ISO week 53 or New Year", () => {
  assert.equal(monday("2027-01-01"), "2026-12-28");
  for (const [day, shift] of [["2026-10-19", 1], ["2026-10-23", 1], ["2026-10-26", 2], ["2026-11-02", 1]] as const)
    assert.equal(plannedDay(data, 1, day).shiftId, shift);
  assert.equal(cycleIndex("2026-12-28", "2026-12-21", 2), 1);
  assert.equal(cycleIndex("2027-01-04", "2026-12-21", 2), 0);
});
test("midweek effective dates, end dates, free weekdays and other employees stay distinct", () => {
  const d = structuredClone(data);
  d.assignments[0].startsOn = "2026-10-21"; d.assignments[0].endsOn = "2026-11-03";
  assert.equal(plannedDay(d, 1, "2026-10-20").source, "none");
  assert.equal(plannedDay(d, 1, "2026-10-21").shiftId, 1);
  assert.equal(plannedDay(d, 1, "2026-10-26").shiftId, 2);
  assert.equal(plannedDay(d, 1, "2026-11-04").source, "none");
  assert.equal(plannedDay(d, 1, "2026-10-24").shiftName, "Frei");
  assert.equal(plannedDay(d, 2, "2026-10-21").source, "none");
  assert.equal(plannedDay(d, 1, "2026-10-21").plannedMinutes, 450);
});
test("fixed shifts and duplicate positions support one-week and multiweek patterns", () => {
  const d = structuredClone(data);
  d.assignments[0].shiftIds = [2];
  assert.equal(plannedDay(d, 1, "2026-12-28").shiftId, 2);
  d.assignments[0].shiftIds = [1, 1, 2];
  assert.deepEqual(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((day) => plannedDay(d, 1, day).shiftId), [1, 1, 2, 1]);
});
test("single-day and week exceptions override the cycle without shifting following weeks", () => {
  const d = structuredClone(data);
  d.exceptions.push({ id: 1, employeeId: 1, startsOn: "2026-10-19", endsOn: "2026-10-25", weekdays: [1, 2, 3, 4, 5], shiftId: 2, note: "", updatedAt: "" });
  assert.equal(plannedDay(d, 1, "2026-10-21").source, "exception");
  assert.equal(plannedDay(d, 1, "2026-10-21").shiftId, 2);
  assert.equal(plannedDay(d, 1, "2026-10-24").shiftName, "Frei");
  assert.equal(plannedDay(d, 1, "2026-10-26").shiftId, 2);
  d.exceptions[0].shiftId = null;
  assert.equal(plannedDay(d, 1, "2026-10-21").plannedMinutes, 0);
});
test("actual stamps are clipped to both shift limits; late arrival is not credited as attendance", () => {
  const day = "2026-10-19";
  const rules = rulesForShift(data, 1, instant(day, "05:30"), DEFAULT_SETTINGS);
  const full = calculate(instant(day, "05:30"), instant(day, "15:00"), rules);
  assert.deepEqual([full.grossMinutes, full.pauseMinutes, full.netMinutes], [480, 30, 450]);
  assert.equal(full.bookedStart, instant(day, "06:00").toISOString());
  assert.equal(full.bookedEnd, instant(day, "14:00").toISOString());
  assert.equal(calculate(instant(day, "08:00"), instant(day, "14:30"), rules).netMinutes, 330);
  assert.equal(calculate(instant(day, "04:00"), instant(day, "05:00"), rules).netMinutes, 0);
  assert.equal(calculate(instant(day, "15:00"), instant(day, "16:00"), rules).netMinutes, 0);
  assert.equal(calculate(instant(day, "08:00"), null, rules).netMinutes, null);
  assert.equal(calculate(instant(day, "08:00"), instant(day, "14:00"), rules, 0).netMinutes, 360);
});
test("free days count zero and unassigned staff keep existing global rules", () => {
  const day = "2026-10-24";
  const free = rulesForShift(data, 1, instant(day, "07:00"), DEFAULT_SETTINGS);
  assert.equal(calculate(instant(day, "07:00"), instant(day, "15:00"), free).netMinutes, 0);
  assert.equal(rulesForShift(data, 99, instant(day, "07:00"), DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});
test("Sunday night belongs to its start day even after the Monday cycle change", () => {
  const d = structuredClone(data);
  d.assignments[0].weekdays = [1, 2, 3, 4, 5, 6, 7]; d.assignments[0].shiftIds = [3, 1];
  const rules = rulesForShift(d, 1, instant("2026-10-26", "01:00"), DEFAULT_SETTINGS);
  assert.equal(rules.shiftWindow?.name, "Nacht");
  assert.equal(rules.shiftWindow?.day, "2026-10-25");
  assert.equal(calculate(instant("2026-10-26", "01:00"), instant("2026-10-26", "07:00"), rules).netMinutes, 270);
});
test("night shifts across both DST changes use elapsed time and retain booked snapshots", () => {
  const d = structuredClone(data);
  d.assignments[0] = { ...d.assignments[0], startsOn: "2026-01-01", anchorMonday: "2025-12-29", shiftIds: [3], weekdays: [1, 2, 3, 4, 5, 6, 7] };
  assert.equal(plannedDay(d, 1, "2026-03-28").plannedMinutes, 390);
  assert.equal(plannedDay(d, 1, "2026-10-24").plannedMinutes, 510);
  const start = instant("2026-10-24", "21:30"), end = instant("2026-10-25", "06:30");
  const snapshot = rulesForShift(d, 1, start, DEFAULT_SETTINGS);
  d.shifts[2].endTime = "08:00";
  assert.equal(calculate(start, end, snapshot).netMinutes, 510);
  assert.equal(snapshot.shiftWindow?.end, instant("2026-10-25", "06:00").toISOString());
});
