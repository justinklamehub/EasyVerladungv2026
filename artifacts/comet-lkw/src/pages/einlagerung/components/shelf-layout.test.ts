import assert from "node:assert/strict";
import test from "node:test";
import type { Rec } from "../lib";
import { buildShelfMatrix, compareShelvesDescending } from "./shelf-layout";

const rec = (id: number, kind: string, d: Rec["d"]): Rec => ({ id, kind, d, updatedAt: "" });

test("Regale werden immer von der höchsten zur niedrigsten Position sortiert", () => {
  const shelves = [rec(1, "shelf", { name: "01-01", position: 1, sort: 100 }),
    rec(2, "shelf", { name: "01-09", position: 9, sort: 0 }),
    rec(3, "shelf", { name: "01-45", position: 45, sort: 1 })];
  assert.deepEqual([...shelves].sort(compareShelvesDescending).map((s) => s.d.name), ["01-45", "01-09", "01-01"]);
  assert.equal(shelves[0].d.name, "01-01", "Quelldaten bleiben unverändert");
});

test("Matrix ordnet dynamische Hallen und Gänge entlang derselben absteigenden Regalpositionen an", () => {
  const h1 = rec(10, "hall", { name: "Halle 1", sort: 1 }), h2 = rec(20, "hall", { name: "Halle 2", sort: 2 });
  const matrix = buildShelfMatrix([
    { hall: h2, aisle: rec(21, "aisle", { name: "07" }), shelves: [rec(22, "shelf", { name: "07-46", position: 46 })] },
    { hall: h1, aisle: rec(11, "aisle", { name: "01" }), shelves: [rec(12, "shelf", { name: "01-45", position: 45 }), rec(13, "shelf", { name: "01-01", position: 1 })] },
    { hall: h1, aisle: rec(14, "aisle", { name: "02" }), shelves: [rec(15, "shelf", { name: "02-45", position: 45 })] },
  ]);
  assert.deepEqual(matrix.positions, [46, 45, 1]);
  assert.deepEqual(matrix.halls.map((h) => h.hall?.d.name), ["Halle 1", "Halle 2"]);
  assert.deepEqual(matrix.halls[0].columns.map((c) => c.aisle.d.name), ["01", "02"]);
  assert.equal(matrix.halls[0].columns[1].shelvesByPosition.has(1), false, "Keine erfundenen Regale in leeren Matrixzellen");
});

test("Sonderplätze und mehrere Regale derselben Position gehen nicht verloren", () => {
  const matrix = buildShelfMatrix([{ aisle: rec(1, "aisle", { name: "Zusatzplätze" }), shelves: [
    rec(2, "shelf", { name: "K", position: 0 }), rec(3, "shelf", { name: "K2", position: 0 }),
  ] }]);
  assert.deepEqual(matrix.positions, [0]);
  assert.equal(matrix.halls[0].columns[0].shelvesByPosition.get(0)?.length, 2);
});
