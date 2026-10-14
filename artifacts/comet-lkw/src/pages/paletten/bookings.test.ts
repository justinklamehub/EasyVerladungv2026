import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePalletBookings, bookingsCsv } from "./bookings";
import type { PalletMovement, PalletPurchase } from "@workspace/api-client-react";

const movement: PalletMovement = { id: 7, speditionId: 1, movementType: "eingang", movementDate: "2026-10-01", amount: 10, createdAt: "2026-10-01T10:00:00Z" };
const purchase: PalletPurchase = { id: 7, purchaseDate: "2026-10-14", amount: 100, speditionName: "Freier Lieferant", reference: "Kaufbeleg-42", note: "", createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" };
const filters = { internal: true, speditionId: "__all__", dateFrom: "", dateTo: "", reference: "" };
test("purchases appear with normal bookings, newest first, without colliding IDs", () => {
  const movements = [movement], purchases = [purchase];
  const rows = mergePalletBookings(movements, purchases, filters);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "purchase-7");
  assert.equal(rows[0].movementType, "kauf");
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[1].id, 7);
  assert.deepEqual(movements, [movement]); assert.deepEqual(purchases, [purchase]);
});
test("purchases respect date and reference filters", () => {
  assert.equal(mergePalletBookings([], [purchase], { ...filters, dateFrom: "2026-10-14", dateTo: "2026-10-14", reference: " BELEG-42 " }).length, 1);
  assert.equal(mergePalletBookings([], [purchase], { ...filters, dateTo: "2026-10-13" }).length, 0);
  assert.equal(mergePalletBookings([], [purchase], { ...filters, reference: "unbekannt" }).length, 0);
});
test("purchase records do not become customer-account bookings or leak to external views", () => {
  assert.equal(mergePalletBookings([], [purchase], { ...filters, speditionId: "1" }).length, 0);
  assert.equal(mergePalletBookings([], [purchase], { ...filters, internal: false }).length, 0);
  assert.equal(mergePalletBookings([], [purchase], filters)[0].speditionId, null);
});
test("the shared CSV includes purchases and neutralizes spreadsheet formulas", () => {
  const csv = bookingsCsv(mergePalletBookings([movement], [{ ...purchase, speditionName: '=TEST("Lieferant")' }], filters));
  assert(csv.includes('"Kaufpaletten"'));
  assert(csv.includes('"purchase-7"'));
  assert(csv.includes('"Kaufbeleg-42"'));
  assert(csv.includes(`"'=TEST(""Lieferant"")"`));
});
