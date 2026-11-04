import assert from "node:assert/strict";
import { test } from "node:test";
import { stableShipmentComparison } from "./stable-sort";

test("equal sort values retain the same row order after print-status updates reorder DB results", () => {
  const before = [{ id: 1, key: "06:00" }, { id: 2, key: "06:00" }, { id: 3, key: "07:00" }];
  const after = [before[1], before[2], before[0]];
  for (const direction of ["asc", "desc"] as const) {
    const sort = (rows: typeof before) => [...rows].sort((a, b) => stableShipmentComparison(a.key.localeCompare(b.key), a.id, b.id, direction)).map((row) => row.id);
    assert.deepEqual(sort(before), sort(after));
    assert.deepEqual(sort(before), direction === "asc" ? [1, 2, 3] : [3, 1, 2]);
  }
});
