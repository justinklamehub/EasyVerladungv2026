import test from "node:test";
import assert from "node:assert/strict";
import { resolvePreset, validateRange } from "./range";

test("Sunday belongs to the week that started last Monday", () => {
  assert.deepEqual(resolvePreset("week", new Date(2026, 9, 11, 12)), { from: "2026-10-05", to: "2026-10-11" });
});
test("rolling ranges include today and handle the year boundary", () => {
  assert.deepEqual(resolvePreset("last7", new Date(2026, 0, 2, 12)), { from: "2025-12-27", to: "2026-01-02" });
  assert.deepEqual(resolvePreset("tomorrow", new Date(2026, 11, 31, 12)), { from: "2027-01-01", to: "2027-01-01" });
});
test("custom range validates true calendar dates, ordering and inclusive maximum", () => {
  assert.equal(validateRange("2024-01-01", "2024-12-31"), null);
  for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-10-09", "2026-10-08"], ["2025-01-01", "2026-01-02"], ["", "2026-10-08"]]) {
    assert.ok(validateRange(from, to));
  }
});
