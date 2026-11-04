import assert from "node:assert/strict";
import { test } from "node:test";
import { shipmentArrivalFields } from "./shipment-arrival";

test("ATA uses German winter time and the correct local calendar day around midnight", () => {
  assert.deepEqual(shipmentArrivalFields(new Date("2026-11-04T23:15:00Z")), { ataDate: "2026-11-05", ataTime: "00:15" });
  assert.deepEqual(shipmentArrivalFields(new Date("2026-11-04T11:42:00Z")), { ataDate: "2026-11-04", ataTime: "12:42" });
});

test("ATA uses German summer time independently of the server timezone", () => {
  assert.deepEqual(shipmentArrivalFields(new Date("2026-07-15T22:05:00Z")), { ataDate: "2026-07-16", ataTime: "00:05" });
});

test("ATA follows the daylight saving change without generating nonexistent local hours", () => {
  assert.deepEqual(shipmentArrivalFields(new Date("2026-03-29T00:59:00Z")), { ataDate: "2026-03-29", ataTime: "01:59" });
  assert.deepEqual(shipmentArrivalFields(new Date("2026-03-29T01:00:00Z")), { ataDate: "2026-03-29", ataTime: "03:00" });
});
