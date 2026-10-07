import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyOrderFilters, matchesOrderFilters, orderFacetOptions, summarizeOrders, type FilterRow } from "./orders-filters";

const rows: FilterRow[] = [
  { shelf: "A1", spedition: "Altspediteur", relation: "1", termin: "07.10.2026" },
  { shelf: "A2", spedition: "Altspediteur", relation: "10", termin: "2026-10-08" },
  { shelf: "B1", spedition: "Neue Spedition", relation: "Nord", termin: "42.2026" },
];
test("Mehrfachwerte sind ODER; unterschiedliche Filter sind UND", () => {
  const filters = { ...emptyOrderFilters(), shelf: ["A1", "B1"], spedition: ["Altspediteur"] };
  assert.deepEqual(rows.filter((r) => matchesOrderFilters(r, filters)), [rows[0]]);
  assert.equal(rows.filter((r) => matchesOrderFilters(r, emptyOrderFilters())).length, 3);
});
test("Relationen werden exakt gewählt oder als ausdrückliche Textsuche eingegeben", () => {
  assert.equal(matchesOrderFilters(rows[1], { ...emptyOrderFilters(), relation: ["1"] }), false);
  assert.equal(matchesOrderFilters(rows[1], { ...emptyOrderFilters(), relation: ["__text__:1"] }), true);
  assert.equal(matchesOrderFilters(rows[2], { ...emptyOrderFilters(), relation: ["__text__:NOR"] }), true);
});
test("Filteroptionen stammen aus Daten und reagieren auf die jeweils anderen Filter", () => {
  const filters = { ...emptyOrderFilters(), shelf: ["A1"], spedition: ["Neue Spedition"] };
  const options = orderFacetOptions(rows, filters, "spedition");
  assert.deepEqual(options, [
    { value: "Altspediteur", label: "Altspediteur", count: 1 },
    { value: "Neue Spedition", label: "Neue Spedition", count: 0 },
  ]);
  assert.deepEqual(orderFacetOptions([], emptyOrderFilters(), "relation"), []);
});
test("Datum, KW, freie Termintexte und ISO-Jahreswechsel werden unterstützt", () => {
  assert.equal(matchesOrderFilters(rows[0], { ...emptyOrderFilters(), termin: ["2026-10-07"] }), true);
  assert.equal(matchesOrderFilters(rows[1], { ...emptyOrderFilters(), termin: ["KW 41.2026"] }), true);
  assert.equal(matchesOrderFilters(rows[2], { ...emptyOrderFilters(), termin: ["KW 42.2026"] }), true);
  assert.equal(matchesOrderFilters({ ...rows[0], termin: "01.01.2027" }, { ...emptyOrderFilters(), termin: ["KW 53.2026"] }), true);
  assert.equal(matchesOrderFilters(rows[0], { ...emptyOrderFilters(), termin: ["__text__:07.10."] }), true);
  assert.equal(matchesOrderFilters(rows[0], { ...emptyOrderFilters(), termin: ["KW 54.2026"] }), false);
});
test("Anzahlen zählen Lieferungen und HUs über mehrere Regale nur einmal", () => {
  const summary = summarizeOrders([
    { deliveryNumber: "80001", shelf: "A1", spedition: "Alt", hus: ["HU1", "HU2"], paletten: 2 },
    { deliveryNumber: "80001", shelf: "A2", spedition: "Alt", hus: ["HU2", "HU3"], paletten: 2 },
    { deliveryNumber: "80002", shelf: "A2", spedition: "Neu", hus: ["HU4"], paletten: 1 },
    { shelf: "A2", spedition: "Neu", hus: [], paletten: 2 },
  ]);
  assert.deepEqual(summary, { orders: 3, positions: 4, unidentified: 1, pallets: 6, shelves: 2, carriers: 2 });
  assert.deepEqual(summarizeOrders([]), { orders: 0, positions: 0, unidentified: 0, pallets: 0, shelves: 0, carriers: 0 });
});
