import assert from "node:assert/strict";
import test from "node:test";
import { SearchEinlagerungResponse } from "@workspace/api-zod";
import { search } from "./search";
import type { Client } from "./model";

const make = (id: number, kind: string, data: Record<string, unknown>) =>
  ({ id, kind, data, updated_at: "2026-10-06T00:00:00Z" });
const records = [
  make(1, "hall", { name: "Halle", active: true }),
  make(2, "aisle", { name: "Gang", hallId: 1, active: true }),
  make(3, "shelf", { name: "A-01", aisleId: 2, active: true }),
  make(4, "shelf", { name: "B-02", aisleId: 2, active: true }),
  make(99, "carrier", { name: "Alpha", active: true }),
  make(100, "carrier", { name: "Beta", active: true }),
  // Legacy reservations can reference the module carrier without a speditionId.
  make(901, "reservation", { shelfId: 3, carrierId: 100, relation: "Nord",
    termin: "47.2028", plusKw: "02", note: "Abholung Tor Sieben", status: "offen" }),
  make(902, "reservation", { shelfId: 4, speditionName: "Gamma", relation: "Süd",
    termin: "18.11.2028", plusKw: "", note: "Bereits abgeholt", status: "erledigt" }),
];
async function find(params: Record<string, unknown>) {
  const before = JSON.stringify(records);
  const client = { query: async (sql: string) => {
    assert.ok(sql.startsWith("SELECT"), "Vormerkungssuche darf keine Daten ändern");
    return { rows: sql.includes("einlagerung_records") ? records : [] };
  } } as unknown as Client;
  const result = SearchEinlagerungResponse.parse(await search(client, { mode: "auftraege", ...params }));
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(result.orders, [], "Vormerkungen funktionieren auch ohne Auftragsimport");
  return result.reservations.map((r) => r.id);
}

test("Vormerkungen per Hinweis, ID, Regal, Relation, Spedition und Status finden", async () => {
  for (const q of ["tor sieben", "901", "a-01", "nord", "beta", "offen"])
    assert.deepEqual(await find({ q }), [901], q);
  for (const q of ["902", "bereits abgeholt", "gamma", "erledigt"])
    assert.deepEqual(await find({ q }), [902], q);
  assert.deepEqual(await find({ q: "nicht vorhanden" }), []);
});

test("Vormerkungsfilter kombinieren und Datums-/KW-Filter beibehalten", async () => {
  assert.deepEqual(await find({ shelfId: 3, spedition: "Beta", relation: "Nord", termin: "KW 47.2028" }), [901]);
  assert.deepEqual(await find({ shelfId: 4, q: "tor sieben" }), []);
  assert.deepEqual(await find({ termin: "2028-11-18" }), [902]);
  assert.deepEqual(await find({}), [901, 902], "Erledigte Vormerkungen bleiben über den Statusfilter auffindbar");
});
