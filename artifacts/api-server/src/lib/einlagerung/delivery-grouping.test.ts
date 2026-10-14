import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pool } from "@workspace/db";
import { SearchEinlagerungResponse } from "@workspace/api-zod";
import { aggregateStock } from "./model";

after(async () => { await pool.end(); });

test("Liefertermine trennen Lieferungen mit gleichem Regal/Termin und zählen deren HUs", () => {
  const base = { platz: "01-02", spediteur: "1", relation: "Nord", lfdat: "06.10.2026", verkaufsbeleg: "123456" };
  const rows = [
    { ...base, beleg: "80000001", handling_unit: "HU1" },
    { ...base, beleg: "80000001", handling_unit: "HU1" },
    { ...base, beleg: "80000001", handling_unit: "HU2" },
    { ...base, beleg: "80000002", handling_unit: "HU3" },
    { ...base, beleg: "", handling_unit: "HU4" },
  ];
  assert.equal(aggregateStock(rows, "auftraege", []).length, 1, "Andere Ansichten bleiben unverändert");
  const orders = aggregateStock(rows, "auftraege", [], true);
  assert.deepEqual(orders.map((r) => [r.deliveryNumber, r.paletten]), [
    ["80000001", 2], ["80000002", 1], ["", 1],
  ]);
  const response = SearchEinlagerungResponse.parse({ message: "", locations: [], orders, reservations: [] });
  assert.equal(response.orders?.[0]?.deliveryNumber, "80000001", "API erhält das neue Feld");
  const fallback = aggregateStock([{ ...base, beleg: "123", verkaufsbeleg: "80000003", handling_unit: "HU5" }], "auftraege", [], true);
  assert.equal(fallback[0].deliveryNumber, "80000003");
});

test("Debitorennummer und optionaler Name bleiben je Lieferung und im API-Ergebnis erhalten", () => {
  const base = { platz: "A1", spediteur: "1", lfdat: "06.10.2026", beleg: "80000001" };
  const orders = aggregateStock([
    { ...base, debitor: "001234", kunde_name1: "Muster GmbH", handling_unit: "HU1" },
    { ...base, debitor: "001234", kunde_name1: "Muster GmbH", handling_unit: "HU2" },
    { ...base, beleg: "80000002", debitor: "005678", kunde_name1: "", handling_unit: "HU3" },
  ], "auftraege", [], true);
  const response = SearchEinlagerungResponse.parse({ message: "", locations: [], orders, reservations: [] });
  assert.deepEqual(response.orders?.map((r) => [r.deliveryNumber, r.debitor, r.debitorName, r.paletten]), [
    ["80000001", "001234", "Muster GmbH", 2],
    ["80000002", "005678", "", 1],
  ]);
});

test("Zusammengefasste Aufträge verlieren keine Debitoren und zählen HUs weiterhin nur einmal", () => {
  const base = { platz: "A1", lfdat: "06.10.2026", handling_unit: "HU1" };
  const orders = aggregateStock([
    { ...base, debitor: "001234", kunde_name1: "Alpha" },
    { ...base, debitor: "005678", kunde_name1: "Beta" },
    { ...base, debitor: "001234", kunde_name1: "Alpha" },
  ], "auftraege", []);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].debitor, "001234, 005678");
  assert.equal(orders[0].debitorName, "Alpha, Beta");
  assert.equal(orders[0].paletten, 1);
});
