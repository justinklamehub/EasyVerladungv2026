import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkViewDates, shipmentWorkViewsSchema, sameWorkViewFilters, type ShipmentWorkViewFilters } from "../src/shipment-work-views";

const filters: ShipmentWorkViewFilters = {
  search: "", status: "Angekommen", speditionId: "__all__", lkwArt: "__all__", tor: "__all__",
  date: { mode: "today" }, sortField: "etaDate", sortDir: "asc",
  showAbgefertigt: false, showStorniert: false,
};
const view = { id: "550e8400-e29b-41d4-a716-446655440000", name: "Heute angekommen", filters };
const value = { version: 1, revision: 0, views: [view] };

test("Arbeitsansichten: vollständige Filter und eindeutige Namen", () => {
  assert.equal(shipmentWorkViewsSchema.safeParse(value).success, true);
  for (const bad of [
    { ...value, userId: 2 }, { ...value, revision: -1 },
    { ...value, views: [{ ...view, name: " " }] },
    { ...value, views: [{ ...view, name: "x".repeat(61) }] },
    { ...value, views: [view, { ...view, id: "550e8400-e29b-41d4-a716-446655440001", name: " HEUTE ANGEKOMMEN " }] },
    { ...value, views: Array.from({ length: 31 }, () => view) },
    { ...value, views: [{ ...view, filters: { ...filters, sortDir: "bad" } }] },
    { ...value, views: [{ ...view, filters: { ...filters, date: { mode: "custom", from: "2026-02-30", to: "" } } }] },
    { ...value, views: [{ ...view, filters: { ...filters, date: { mode: "custom", from: "2026-10-09", to: "2026-10-08" } } }] },
  ]) assert.equal(shipmentWorkViewsSchema.safeParse(bad).success, false);
});

test("Relative Datumsbereiche bleiben dynamisch, Montag bis Sonntag, auch über Jahreswechsel", () => {
  const first = new Date(2026, 9, 8, 23, 30);
  const next = new Date(2026, 9, 9, 0, 30);
  assert.deepEqual(resolveWorkViewDates({ mode: "today" }, first), { from: "2026-10-08", to: "2026-10-08" });
  assert.deepEqual(resolveWorkViewDates({ mode: "today" }, next), { from: "2026-10-09", to: "2026-10-09" });
  assert.deepEqual(resolveWorkViewDates({ mode: "tomorrow" }, new Date(2026, 11, 31)), { from: "2027-01-01", to: "2027-01-01" });
  assert.deepEqual(resolveWorkViewDates({ mode: "thisWeek" }, new Date(2027, 0, 3)), { from: "2026-12-28", to: "2027-01-03" });
  assert.deepEqual(resolveWorkViewDates({ mode: "all" }), { from: "", to: "" });
  assert.deepEqual(resolveWorkViewDates({ mode: "custom", from: "2026-01-01", to: "" }, next), { from: "2026-01-01", to: "" });
  assert.equal(sameWorkViewFilters(filters, { ...filters, date: { mode: "today" } }), true);
  assert.equal(sameWorkViewFilters(filters, { ...filters, search: "ABC" }), false);
});

test("Lokaler Kalendertag statt UTC-Datum, einschließlich Zeitumstellung", () => {
  const old = process.env.TZ;
  process.env.TZ = "Europe/Warsaw";
  try {
    assert.deepEqual(resolveWorkViewDates({ mode: "today" }, new Date("2026-10-24T22:30:00Z")), { from: "2026-10-25", to: "2026-10-25" });
    assert.deepEqual(resolveWorkViewDates({ mode: "thisWeek" }, new Date("2026-10-25T12:00:00Z")), { from: "2026-10-19", to: "2026-10-25" });
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
