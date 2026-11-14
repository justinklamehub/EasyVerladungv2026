import assert from "node:assert/strict";
import test from "node:test";
import { changeShipmentDate } from "./date-filter";

test("choosing a date filters exactly that day", () => {
  assert.deepEqual(changeShipmentDate("2026-11-20", { from: "2026-11-14", to: "2026-11-14" }),
    { from: "2026-11-20", to: "2026-11-20" });
  assert.deepEqual(changeShipmentDate("2026-11-10", { from: "", to: "" }),
    { from: "2026-11-10", to: "2026-11-10" });
});

test("a range remains usable and cannot end before the new start", () => {
  assert.deepEqual(changeShipmentDate("2026-11-12", { from: "2026-11-10", to: "2026-11-20" }),
    { from: "2026-11-12", to: "2026-11-20" });
  assert.deepEqual(changeShipmentDate("2026-11-25", { from: "2026-11-10", to: "2026-11-20" }),
    { from: "2026-11-25", to: "2026-11-25" });
});

test("clearing a single day clears both bounds", () => {
  assert.deepEqual(changeShipmentDate("", { from: "2026-11-14", to: "2026-11-14" }),
    { from: "", to: "" });
});
