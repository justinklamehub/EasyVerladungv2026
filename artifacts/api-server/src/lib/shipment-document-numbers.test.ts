import { test } from "node:test";
import assert from "node:assert/strict";
import { shipmentDocumentNumbers, shipmentLoadedEuroPallets } from "./shipment-document-numbers";

test("sums outgoing Euro pallets per shipment, keeping zero distinct from no receipt", () => {
  const rows = [
    { shipmentId: 1, vonCometEuropaletten: 33, vonCometLadungssicherung: 4, anCometEuropaletten: 33, vonDefektePaletten: 2 },
    { shipmentId: 1, vonCometEuropaletten: 12, vonCometLadungssicherung: 1, anCometEuropaletten: 0, vonDefektePaletten: 0 },
    { shipmentId: 2, vonCometEuropaletten: 0 },
    { shipmentId: 3, vonCometEuropaletten: null },
    { shipmentId: null, vonCometEuropaletten: 99 },
  ];
  const totals = shipmentLoadedEuroPallets(rows);
  assert.equal(totals.get(1), 45);
  assert.equal(totals.get(2), 0);
  assert.equal(totals.get(3), 0);
  assert.equal(totals.has(4), false);
  assert.equal(totals.size, 3);
  assert.equal(shipmentLoadedEuroPallets([]).size, 0);
});

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
