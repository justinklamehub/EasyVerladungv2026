import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShelfLoadContent, loadSearchText, type LoadView } from "./shelf-load-content";
import { shelfMatches } from "./matrix-model";
import { openReservationsByShelf } from "./shelf-reservations";

const view: LoadView = { mode: "orders", byShelf: new Map([[1, {
  orders: [{ spedition: "DHL Freight GmbH", relation: "AGB", termin: "47.2028", plusKw: "03", paletten: 22 }],
  retouren: [{ kunde: "Kunde 001", paletten: 3 }],
}]]), carriers: [], imported: true, loading: false, error: false };
const html = (v: LoadView, shelfId = 1) => renderToStaticMarkup(createElement(ShelfLoadContent, { shelfId, view: v }));

test("Aufträge zeigen Spedition, Relation, Kalenderwoche und echte Palettenzahl", () => {
  const output = html(view);
  for (const text of ["DHL Freight GmbH", "AGB", "47.2028", "+03 KW", "22 Paletten"]) assert.ok(output.includes(text));
  assert.ok(!output.includes("Kunde 001"));
});
test("Retouren zeigen Kundendaten getrennt von Aufträgen", () => {
  const output = html({ ...view, mode: "returns" });
  assert.ok(output.includes("Kunde 001"));
  assert.ok(output.includes("3 Paletten"));
  assert.ok(!output.includes("DHL Freight GmbH"));
});
test("Leer, fehlender Import, Laden und Fehler sind unterschiedliche Zustände", () => {
  assert.ok(html(view, 2).includes("Leer"));
  for (const [change, label] of [
    [{ imported: false }, "Nicht importiert"], [{ loading: true }, "Wird geladen"], [{ error: true }, "Daten nicht verfügbar"],
  ] as const) {
    const output = html({ ...view, ...change }, 2);
    assert.ok(output.includes(label));
    assert.ok(!output.includes(">Leer<"));
  }
});
test("Suche findet Spedition und Relation im angezeigten Inhalt", () => {
  const shelf = { id: 1, kind: "shelf", updatedAt: "", d: { name: "18-05" } };
  for (const q of ["DHL", "agb", "47.2028"]) {
    assert.equal(shelfMatches(shelf, undefined, [], { status: "", orders: false, returns: false, hideFull: false, q },
      loadSearchText(view.byShelf.get(1)!.orders)), true);
  }
});

const carriers = [{ id: 11, kind: "carrier", updatedAt: "", d: { name: "Aktuelle Spedition", speditionId: 7, color: "#123456", textColor: "#ffffff" } }];
const reservations = [
  { id: 21, kind: "reservation", updatedAt: "", d: { shelfId: 1, carrierId: 11, speditionName: "Historischer Name", relation: "Nord", termin: "47.2028", plusKw: "03", status: "offen" } },
  { id: 22, kind: "reservation", updatedAt: "", d: { shelfId: 1, speditionName: "Erledigte Spedition", status: "erledigt" } },
  { id: 23, kind: "reservation", updatedAt: "", d: { shelfId: 2, speditionName: "Stornierte Spedition", status: "storniert" } },
  { id: 24, kind: "reservation", updatedAt: "", d: { shelfId: 1, speditionName: "Unbekannter Altname", relation: "Süd", termin: "2028-11-20", status: "offen" } },
  { id: 25, kind: "reservation", updatedAt: "", d: { shelfId: 3, speditionId: 8, status: "offen" } },
];
const reservedView: LoadView = { ...view, mode: "reservations", carriers,
  reservations: openReservationsByShelf(reservations, carriers, (id) => id === 8 ? "COMET-Spedition" : "") };

test("Nur offene Reservierungen je Regal, ohne Quelldaten oder importierte Aufträge zu ändern", () => {
  const before = JSON.stringify({ reservations, carriers, loads: [...view.byShelf] });
  const projected = openReservationsByShelf(reservations, carriers, () => "");
  assert.deepEqual(projected.get(1)?.map((r) => r.id), [21, 24]);
  assert.equal(projected.has(2), false);
  assert.equal(JSON.stringify({ reservations, carriers, loads: [...view.byShelf] }), before);
});
test("Vormerkungen erhalten Altnamen, Speditionsfarben, Relation und Termin, aber keine Palettenzahlen", () => {
  const output = html(reservedView);
  for (const text of ["Historischer Name", "Unbekannter Altname", "#123456", "#ffffff", "Nord", "47.2028", "+03 KW", "Vorgemerkt"]) assert.ok(output.includes(text), text);
  for (const text of ["Erledigte Spedition", "Stornierte Spedition", "DHL Freight", "Paletten"]) assert.ok(!output.includes(text), text);
  assert.ok(html(reservedView, 3).includes("COMET-Spedition"));
});
test("Reservierungen funktionieren ohne Import und unabhängig von dessen Ladefehlern", () => {
  const output = html({ ...reservedView, imported: false, loading: true, error: true });
  assert.ok(output.includes("Vorgemerkt"));
  assert.ok(html({ ...reservedView, imported: false }, 2).includes("Keine offenen Reservierungen"));
});
test("Reservierungssuche findet auch unbekannte Speditionen, Relation und Termin", () => {
  const shelf = { id: 1, kind: "shelf", updatedAt: "", d: { name: "18-05" } };
  for (const q of ["historischer", "Unbekannter Altname", "nord", "47.2028", "2028-11-20"]) {
    assert.equal(shelfMatches(shelf, undefined, [], { status: "", orders: false, returns: false, hideFull: false, q },
      loadSearchText(reservedView.reservations!.get(1)!)), true, q);
  }
});
