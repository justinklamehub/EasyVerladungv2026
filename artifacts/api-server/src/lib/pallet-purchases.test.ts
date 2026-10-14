import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseInput, calculateOwnedStock, berlinToday } from "./pallet-purchases";

const input = { purchaseDate: "2026-01-01", amount: 50, speditionName: " Freier Testspediteur ", reference: "", note: "" };
test("purchase increases plant stock and property by the same amount without a customer account", () => {
  assert.deepEqual(calculateOwnedStock(100, 20, 50, 30), { plantStock: 170, ownedStock: 140 });
  assert.deepEqual(calculateOwnedStock(100, 20, 0, 30), { plantStock: 120, ownedStock: 90 });
});
test("an unknown stock is not fabricated when an inventory is missing", () => {
  assert.deepEqual(calculateOwnedStock(null, 0, 50, 30), { plantStock: null, ownedStock: null });
});
test("free vendor names need no account ID; clearing optional values is preserved", () => {
  assert.equal(purchaseInput(input).speditionName, "Freier Testspediteur");
  assert.equal(purchaseInput(input).reference, "");
  assert.equal("speditionId" in purchaseInput({ ...input, speditionId: 123 }), false);
});
test("non-integer, zero, negative, infinite and oversized quantities are rejected", () => {
  for (const amount of [0, -1, 1.5, Infinity, 2147483648]) assert.throws(() => purchaseInput({ ...input, amount }));
});
test("blank vendor, impossible dates and future dates are rejected", () => {
  assert.throws(() => purchaseInput({ ...input, speditionName: "  " }));
  for (const purchaseDate of ["2026-02-30", "2026-13-01", "not-a-date", "9999-12-31"]) assert.throws(() => purchaseInput({ ...input, purchaseDate }));
  assert.equal(purchaseInput({ ...input, purchaseDate: berlinToday() }).purchaseDate, berlinToday());
});
