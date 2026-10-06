import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShelfMatrix } from "./shelf-matrix";
import { ShelfTiles } from "./shelf-tiles";
import type { LoadView } from "./shelf-load-content";
import { openReservationsByShelf } from "./shelf-reservations";
import { matrixCounts } from "./matrix-model";
import { todayOrdinal } from "./delivery-deadlines";

// Direct tsx uses classic JSX for these Vite components.
Object.assign(globalThis, { React });

const shelf = { id: 3, kind: "shelf", updatedAt: "", d: { name: "A-01", position: 1, aisleId: 2 } };
const groups = [{ hall: { id: 1, kind: "hall", updatedAt: "", d: { name: "Halle A" } },
  aisle: { id: 2, kind: "aisle", updatedAt: "", d: { name: "A", hallId: 1 } }, shelves: [shelf] }];
const occ = new Map([["A-01", { shelf: "A-01", ist: 4, retouren: 2, auftraege: 7 }]]);
const assigned = new Map([[3, [{ id: 5, number: "12345", name: "Geplanter Artikel", priority: 1, color: "#000000", group: "" }]]]);
const reservations = openReservationsByShelf([
  { id: 10, kind: "reservation", updatedAt: "", d: { status: "offen", shelfId: 3, speditionName: "Alte Spedition", relation: "Berlin", termin: "42.2026" } },
  { id: 11, kind: "reservation", updatedAt: "", d: { status: "erledigt", shelfId: 3, speditionName: "Fertig" } },
], [], () => "");
const loadView: LoadView = { mode: "reservations", byShelf: new Map(), reservations, carriers: [],
  imported: false, loading: false, error: false };
const props = { groups, occ, assigned, colors: { free: "#ffffff", occupied: "#cccccc", full: "#ff0000" },
  matchIds: new Set<number>(), targetId: null, has: () => false, onSelect: () => {}, onAction: () => {}, loadView };

test("Matrix und Kacheln zeigen nur Vormerkungen; tatsächliche Belegung und Artikelzuordnungen bleiben unverändert", () => {
  const before = matrixCounts([shelf], occ, assigned);
  for (const element of [
    React.createElement(ShelfMatrix, { ...props, istImported: true }),
    React.createElement(ShelfTiles, { ...props, imported: { ist: true, ret: true, auf: true } }),
  ]) {
    const output = renderToStaticMarkup(element);
    for (const text of ["Alte Spedition", "Berlin", "42.2026", "Vorgemerkt", "opacity-30"]) assert.ok(output.includes(text), text);
    assert.ok(!output.includes(">Fertig<"));
    assert.ok(!output.includes("Geplanter Artikel"));
    assert.ok(!output.includes("menu-full-3"));
    assert.ok(!output.includes("menu-release-3"));
  }
  assert.deepEqual(matrixCounts([shelf], occ, assigned), before);
  assert.equal(occ.get("A-01")?.ist, 4);
  assert.equal(assigned.get(3)?.[0].number, "12345");
});

test("Beide Darstellungen erklären Regale ohne offene Reservierung", () => {
  const emptyProps = { ...props, loadView: { ...loadView, reservations: new Map() } };
  for (const element of [
    React.createElement(ShelfMatrix, { ...emptyProps, istImported: false }),
    React.createElement(ShelfTiles, { ...emptyProps, imported: { ist: false, ret: false, auf: false } }),
  ]) assert.ok(renderToStaticMarkup(element).includes("Keine offenen Reservierungen"));
});

test("Matrix und Kacheln warnen lesbar bei offenen überfälligen Vormerkungen; Alttermine bleiben unklar", () => {
  const data = [
    { id: 31, kind: "reservation", updatedAt: "", d: { status: "offen", shelfId: 3, speditionName: "Überfälliger Termin", termin: "40.2026", plusKw: "0" } },
    { id: 32, kind: "reservation", updatedAt: "", d: { status: "offen", shelfId: 3, speditionName: "Verlängerter Termin", termin: "40.2026", plusKw: "2" } },
    { id: 33, kind: "reservation", updatedAt: "", d: { status: "offen", shelfId: 3, speditionName: "Alttermin", termin: "KW 40", plusKw: "" } },
    { id: 34, kind: "reservation", updatedAt: "", d: { status: "erledigt", shelfId: 3, speditionName: "Erledigt", termin: "1.2020" } },
    { id: 35, kind: "reservation", updatedAt: "", d: { status: "storniert", shelfId: 3, speditionName: "Storniert", termin: "1.2020" } },
  ];
  const before = JSON.stringify({ data, occupancy: [...occ], assigned: [...assigned] });
  const reservations = openReservationsByShelf(data, [], () => "", todayOrdinal(new Date("2026-10-06T12:00:00Z")));
  const warningProps = { ...props, loadView: { ...loadView, reservations } };
  for (const element of [
    React.createElement(ShelfMatrix, { ...warningProps, istImported: true }),
    React.createElement(ShelfTiles, { ...warningProps, imported: { ist: true, ret: true, auf: true } }),
  ]) {
    const output = renderToStaticMarkup(element);
    assert.equal((output.match(/data-testid="reservation-overdue"/g) ?? []).length, 1);
    assert.equal((output.match(/data-testid="reservation-unknown"/g) ?? []).length, 1);
    for (const text of ["Überfällig", "Termin unklar", "KW-Ende", "18.10.2026", "+2 KW"]) assert.ok(output.includes(text), text);
    for (const text of [">Erledigt<", ">Storniert<"]) assert.ok(!output.includes(text), text);
  }
  assert.equal(JSON.stringify({ data, occupancy: [...occ], assigned: [...assigned] }), before);
});
