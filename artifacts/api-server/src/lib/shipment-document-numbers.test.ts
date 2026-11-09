import { test } from "node:test";
import assert from "node:assert/strict";
import { shipmentDocumentNumbers } from "./shipment-document-numbers";

test("keeps all document numbers, including leading zeroes, in one shipment row", () => {
  const result = shipmentDocumentNumbers([
    { shipmentId: 1, ladelistennummer: "00123", palettenscheinnummer: "00045" },
    { shipmentId: 1, ladelistennummer: "00124", palettenscheinnummer: "00046" },
    { shipmentId: 1, ladelistennummer: "00123", palettenscheinnummer: "00045" },
    { shipmentId: 2, ladelistennummer: "other", palettenscheinnummer: null },
    { shipmentId: null, ladelistennummer: "unassigned", palettenscheinnummer: "unassigned" },
  ]);
  assert.deepEqual(result.get(1), {
    ladelistennummer: "00123, 00124", palettenscheinnummer: "00045, 00046",
  });
  assert.deepEqual(result.get(2), { ladelistennummer: "other", palettenscheinnummer: null });
  assert.equal(result.size, 2);
});

test("missing and blank document numbers stay empty", () => {
  assert.equal(shipmentDocumentNumbers([]).size, 0);
  assert.deepEqual(shipmentDocumentNumbers([
    { shipmentId: 1, ladelistennummer: null, palettenscheinnummer: " " },
  ]).get(1), { ladelistennummer: null, palettenscheinnummer: null });
});
