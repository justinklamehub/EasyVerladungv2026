import assert from "node:assert/strict";
import test from "node:test";
import { clampZoom, filtersActive, matrixCounts, nextTarget, orderedShelves, shelfMatches, shelfStatus, type Art, type MatrixFilters, type Occ } from "./matrix-model";
import { buildShelfMatrix } from "./shelf-layout";
import type { Rec } from "../lib";

const rec = (id: number, name: string, position = 1, full = false): Rec => ({
  id, kind: "shelf", updatedAt: "", d: { name, position, full, active: true },
});
const filters: MatrixFilters = { status: "", orders: false, returns: false, hideFull: false, q: "" };
const occupied: Occ = { shelf: "01-01", ist: 12, retouren: 3, auftraege: 4 };
const article: Art = { id: 1, number: "123456", name: "Schrauben", priority: 1, color: "#ff0000", group: "Metall" };

test("Statusfilter stimmen mit den exklusiven Kennzahlen überein", () => {
  const empty = rec(1, "01-01"), used = rec(2, "01-02"), full = rec(3, "01-03", 1, true);
  assert.equal(shelfStatus(empty), "free");
  assert.equal(shelfStatus(used, occupied), "occupied");
  assert.equal(shelfStatus(full, occupied), "full");
  assert.equal(shelfMatches(full, occupied, [], { ...filters, status: "occupied" }), false);
  assert.equal(shelfMatches(full, undefined, [], { ...filters, status: "full" }), true);
  assert.equal(shelfMatches(full, undefined, [], { ...filters, status: "free" }), false);
  const counts = matrixCounts([empty, used, full], new Map([
    ["01-02", occupied], ["01-03", occupied],
  ]), new Map([[used.id, [article]]]));
  assert.deepEqual(counts, { total: 3, free: 1, occupied: 1, full: 1, orders: 2, returns: 2, unplanned: 2 });
});

test("Auftrags- und Retourenfilter kombinieren sich und behandeln fehlende Daten sicher", () => {
  const shelf = rec(1, "01-01");
  assert.equal(shelfMatches(shelf, occupied, [], { ...filters, orders: true, returns: true }), true);
  assert.equal(shelfMatches(shelf, { ...occupied, retouren: 0 }, [], { ...filters, orders: true, returns: true }), false);
  assert.equal(shelfMatches(shelf, undefined, [], { ...filters, orders: true }), false);
  assert.equal(shelfMatches(shelf, occupied, [], { ...filters, status: "free" }), false);
  assert.equal(shelfMatches(rec(2, "02", 1, true), occupied, [], { ...filters, hideFull: true }), false);
});

test("Suche findet Regal, Artikelnummer und Artikelname unabhängig von Schreibweise und Leerzeichen", () => {
  const shelf = rec(1, "01-45");
  for (const q of [" 01-45 ", "123456", " SCHRAUBEN "]) {
    assert.equal(shelfMatches(shelf, undefined, [article], { ...filters, q }), true);
  }
  assert.equal(shelfMatches(shelf, undefined, [article], { ...filters, q: "unbekannt" }), false);
  assert.equal(filtersActive({ ...filters, q: "  " }), false);
  assert.equal(filtersActive({ ...filters, returns: true }), true);
});

test("Treffernavigation läuft vorwärts und rückwärts, auch bei verschwundenem Ziel", () => {
  assert.equal(nextTarget([], 1, 1), null);
  assert.equal(nextTarget([10, 20, 30], null, 1), 10);
  assert.equal(nextTarget([10, 20, 30], null, -1), 30);
  assert.equal(nextTarget([10, 20, 30], 30, 1), 10);
  assert.equal(nextTarget([10, 20, 30], 10, -1), 30);
  assert.equal(nextTarget([10, 30], 20, 1), 10);
  assert.equal(nextTarget([10], 10, -1), 10);
});

test("Suche verändert weder Matrixpositionen noch Quelldaten", () => {
  const shelves = [rec(1, "01-01", 1), rec(2, "01-45", 45), rec(3, "K", 0)];
  shelves.forEach((s) => { Object.freeze(s.d); Object.freeze(s); });
  Object.freeze(shelves);
  const groups = [{ aisle: rec(4, "01"), hall: rec(5, "Halle 1"), shelves }];
  const before = JSON.stringify(groups);
  const ordered = orderedShelves(groups);
  assert.deepEqual(ordered.map((s) => s.id), [2, 1, 3]);
  assert.deepEqual(ordered.filter((s) => shelfMatches(s, undefined, [], { ...filters, q: "01-01" })).map((s) => s.id), [1]);
  assert.deepEqual(buildShelfMatrix(groups).positions, [45, 1, 0]);
  assert.equal(JSON.stringify(groups), before);
});

test("Zoom wird auf sichere Grenzen begrenzt", () => {
  assert.equal(clampZoom(30), 60);
  assert.equal(clampZoom(170), 160);
  assert.equal(clampZoom(120), 120);
  assert.equal(clampZoom(Number.NaN), 100);
});
