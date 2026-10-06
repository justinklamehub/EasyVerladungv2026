import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShelfLoadContent, loadSearchText, type LoadView } from "./shelf-load-content";
import { shelfMatches } from "./matrix-model";

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
