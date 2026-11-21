import assert from "node:assert/strict";
import { test } from "node:test";
import { stableShipmentComparison, midnightEtaComparison } from "./stable-sort";

test("equal sort values retain the same row order after print-status updates reorder DB results", () => {
  const before = [{ id: 1, key: "06:00" }, { id: 2, key: "06:00" }, { id: 3, key: "07:00" }];
  const after = [before[1], before[2], before[0]];
  for (const direction of ["asc", "desc"] as const) {
    const sort = (rows: typeof before) => [...rows].sort((a, b) => stableShipmentComparison(a.key.localeCompare(b.key), a.id, b.id, direction)).map((row) => row.id);
    assert.deepEqual(sort(before), sort(after));
    assert.deepEqual(sort(before), direction === "asc" ? [1, 2, 3] : [3, 1, 2]);
  }
});

test("midnight ETAs stay last in either sort direction, including rows with ATA", () => {
  const rows = [
    { id: 1, etaTime: "00:00", ataDate: "2026-11-01" },
    { id: 2, etaTime: "08:00" },
    { id: 3, etaTime: "00:00:00" },
    { id: 4, etaTime: "12:00" },
    { id: 5, etaTime: null },
  ];
  for (const direction of ["asc", "desc"] as const) {
    const sorted = [...rows].sort((a, b) =>
      midnightEtaComparison(a, b) || stableShipmentComparison(a.id - b.id, a.id, b.id, direction));
    assert.deepEqual(new Set(sorted.slice(-2).map(row => row.id)), new Set([1, 3]));
    assert.ok(sorted.slice(0, -2).every(row => row.id !== 1 && row.id !== 3));
  }
  assert.equal(midnightEtaComparison({ etaTime: "00:00:00.000" }, { etaTime: "09:00" }), 1);
  assert.equal(midnightEtaComparison({ etaTime: "00:01" }, { etaTime: "09:00" }), 0);
  assert.equal(midnightEtaComparison({ etaTime: "" }, { etaTime: null }), 0);
});
