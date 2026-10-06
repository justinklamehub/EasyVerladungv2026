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
