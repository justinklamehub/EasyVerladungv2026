import { test } from "node:test";
import assert from "node:assert/strict";
import { berlinInstant, calculate, DEFAULT_SETTINGS, localDay, nextDay } from "./calculation";

const date = (time: string) => new Date(`2026-10-14T${time}:00+02:00`);
const uncapped = { ...DEFAULT_SETTINGS, earliestStart: null, latestEnd: null };
test("early and late scans are preserved while booked times use legacy limits", () => {
  const start = date("06:00"), end = date("16:30");
  const result = calculate(start, end, DEFAULT_SETTINGS);
  assert.equal(result.bookedStart, date("06:45").toISOString());
  assert.equal(result.bookedEnd, date("16:00").toISOString());
  assert.equal(result.grossMinutes, 555);
  assert.equal(result.pauseMinutes, 45);
  assert.equal(result.netMinutes, 510);
  assert.equal(start.toISOString(), date("06:00").toISOString());
  assert.equal(end.toISOString(), date("16:30").toISOString());
});
for (const [minutes, pause] of [[0, 0], [14, 14], [15, 15], [400, 15], [401, 30], [509, 30], [510, 45]] as const) {
  test(`legacy pause at ${minutes} minutes = ${pause}`, () => {
    const start = date("07:00");
    const end = new Date(start.getTime() + minutes * 60000);
    const result = calculate(start, end, uncapped);
    assert.equal(result.pauseMinutes, pause);
    assert.equal(result.netMinutes, minutes - pause);
  });
}
test("zero pause override is respected and oversized deductions never create negative work", () => {
  assert.equal(calculate(date("07:00"), date("15:00"), uncapped, 0).netMinutes, 480);
  assert.equal(calculate(date("07:00"), date("07:10"), uncapped, 45).netMinutes, 0);
});
test("open shifts have no fabricated work or pause totals", () => {
  assert.deepEqual(calculate(date("06:00"), null, DEFAULT_SETTINGS), {
    bookedStart: date("06:45").toISOString(), bookedEnd: null, grossMinutes: null, pauseMinutes: null, netMinutes: null,
  });
});
test("night shift end is not capped to the previous afternoon", () => {
  const end = new Date("2026-10-15T06:00:00+02:00");
  const result = calculate(date("22:00"), end, DEFAULT_SETTINGS);
  assert.equal(result.bookedEnd, end.toISOString());
  assert.equal(result.grossMinutes, 480);
});
test("a scan entirely before earliest start has zero duration", () => {
  const result = calculate(date("06:00"), date("06:10"), DEFAULT_SETTINGS);
  assert.equal(result.grossMinutes, 0);
  assert.equal(result.netMinutes, 0);
});
test("Berlin conversion handles standard and daylight time independently of machine timezone", () => {
  assert.equal(berlinInstant("2026-01-10", "06:45").toISOString(), "2026-01-10T05:45:00.000Z");
  assert.equal(berlinInstant("2026-07-10", "06:45").toISOString(), "2026-07-10T04:45:00.000Z");
  assert.equal(localDay(new Date("2026-07-10T23:00:00Z")), "2026-07-11");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
});
test("nonexistent and ambiguous local times are rejected", () => {
  assert.throws(() => berlinInstant("2026-03-29", "02:30"), /Ortszeit/);
  assert.throws(() => berlinInstant("2026-10-25", "02:30"), /Ortszeit/);
  assert.throws(() => berlinInstant("2026-02-30", "06:45"), /Ortszeit/);
});
test("DST shift duration follows elapsed real time, not wall-clock subtraction", () => {
  const start = new Date("2026-10-24T22:00:00+02:00");
  const end = new Date("2026-10-25T06:00:00+01:00");
  assert.equal(calculate(start, end, uncapped).grossMinutes, 540);
});
