import assert from "node:assert/strict";
import test from "node:test";
import { SearchEinlagerungResponse } from "@workspace/api-zod";
import { search } from "./search";
import type { Client } from "./model";

test("Sammelansicht enthält korrekte Aufträge und Retouren ohne Quelldatenänderung", async () => {
  const make = (id: number, kind: string, data: Record<string, unknown>) =>
    ({ id, kind, data, updated_at: "2026-10-06T00:00:00Z" });
  const records = [make(1, "hall", { name: "Halle", active: true }),
    make(2, "aisle", { name: "01", hallId: 1, active: true }),
    make(3, "shelf", { name: "01-01", aisleId: 2, active: true }),
    make(4, "shelf", { name: "01-02", aisleId: 2, active: true }),
    make(5, "shelf", { name: "01-03", aisleId: 2, active: false })];
  const order = { platz: "01-01", handling_unit: "HU1", spediteur_name1: "Alte Spedition", relation: "FRA", lfdat: "47.2028", plus_kw: "02" };
  const datasets = [
    { type: "auftraege", rows: [order, { ...order }, { ...order, platz: "01-03" }] },
    { type: "retouren", rows: [{ platz: "01-02", hu: "R1", parcours: "Kunde 001" }] },
  ];
  const before = JSON.stringify({ records, datasets });
  const queries: string[] = [];
  const client = { query: async (sql: string) => {
    queries.push(sql);
    return { rows: sql.includes("einlagerung_records") ? records : sql.includes("einlagerung_datasets") ? datasets : [] };
  } } as unknown as Client;
  const result = SearchEinlagerungResponse.parse(await search(client, { mode: "lagerplan" }));
  assert.deepEqual(result.locations.map((l) => l.shelf.id), [3, 4]);
  assert.equal(result.locations[0].orders[0].paletten, 1, "HU-Dubletten werden nicht doppelt gezählt");
  assert.equal(result.locations[0].orders[0].spedition, "Alte Spedition", "Unzugeordnete Altnamen bleiben sichtbar");
  assert.equal(result.locations[1].retouren[0].kunde, "Kunde 001");
  assert.equal(result.locations[1].orders.length, 0);
  assert.equal(JSON.stringify({ records, datasets }), before);
  assert.equal(queries.length, 3, "Eine Sammelabfrage, keine Abfrage je Regal");
  assert.ok(queries.every((s) => s.startsWith("SELECT")), "Die Matrix liest ausschließlich");
});
