import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardAnalytics, dashboardRange } from "./dashboard-analytics";

const base = { etaDate: "2026-10-08", etaTime: "10:00", ataDate: "2026-10-08", ataTime: "10:00", status: "Angekommen", lkwArt: "Container" };

test("inclusive date range validates real dates, order and 366-day limit", () => {
  assert.deepEqual(dashboardRange(undefined, undefined, "2026-10-08"), { from: "2026-10-08", to: "2026-10-08" });
  for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-10-09", "2026-10-08"], ["2025-01-01", "2026-01-02"]]) {
    assert.throws(() => dashboardRange(from, to, "2026-10-08"), RangeError);
  }
  assert.throws(() => dashboardRange(["2026-10-08"], undefined, "2026-10-08"), RangeError);
  assert.deepEqual(dashboardRange("2024-01-01", "2024-12-31", ""), { from: "2024-01-01", to: "2024-12-31" });
});
test("single day uses 24 hourly buckets and explicitly counts missing clocks", () => {
  const result = buildDashboardAnalytics([base, { ...base, etaTime: null, ataTime: "24:00" }], "2026-10-08", "2026-10-08");
  assert.equal(result.grain, "hour");
  assert.equal(result.activity.length, 24);
  assert.deepEqual(result.activity[10], { label: "10:00", eta: 1, ata: 1 });
  assert.equal(result.unplacedEta, 1);
  assert.equal(result.unplacedAta, 1);
  assert.deepEqual(result.punctuality, { onTime: 1, delayed: 0, unknown: 1, onTimePercent: 100 });
});
test("ETA and ATA use their own date, zero days are retained, trucks are not double counted", () => {
  const result = buildDashboardAnalytics([{ ...base, ataDate: "2026-10-10" }, { ...base, etaDate: "2026-09-30", ataDate: "2026-10-09" }], "2026-10-08", "2026-10-09");
  assert.deepEqual(result.activity, [{ label: "2026-10-08", eta: 1, ata: 0 }, { label: "2026-10-09", eta: 0, ata: 1 }]);
  assert.equal(result.byLkwArt[0].count, 2);
  assert.equal(result.punctuality.delayed, 1);
  assert.equal(result.punctuality.onTime, 0);
});
test("punctuality includes early/equal arrival, excludes cancelled and out-of-period ATA", () => {
  const result = buildDashboardAnalytics([base, { ...base, ataTime: "09:00" }, { ...base, ataTime: "10:01" }, { ...base, status: "Storniert", ataTime: "11:00" }, { ...base, ataDate: "2026-10-09" }, { ...base, etaDate: null, lkwArt: null }], "2026-10-08", "2026-10-08");
  assert.deepEqual(result.punctuality, { onTime: 2, delayed: 1, unknown: 1, onTimePercent: 2 / 3 * 100 });
  assert.equal(result.byLkwArt.find(x => x.name === "Nicht angegeben")?.count, 1);
});
test("empty sample is unknown, not zero-percent punctuality", () => {
  const result = buildDashboardAnalytics([], "2026-10-08", "2026-10-08");
  assert.equal(result.punctuality.onTimePercent, null);
  assert.deepEqual(result.byLkwArt, []);
  assert.equal(result.activity.reduce((n, point) => n + point.eta + point.ata, 0), 0);
});
