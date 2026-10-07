import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScannerIstDetails } from "./scanner-ist-details";

test("IST-Details zeigen getrennte Artikel-/Palettenzeilen direkt und korrekte Summen", () => {
  const html = renderToStaticMarkup(createElement(ScannerIstDetails, {
    rows: [{ material: "000123", paletten: 2 }, { material: "1351800", paletten: "3" }],
    testId: "scanner-ist-123",
  }));
  assert.match(html, /aria-label="IST-Bestand"/);
  assert.match(html, /2 Positionen/);
  assert.match(html, /5 Pal\./);
  assert.match(html, /000123/);
  assert.match(html, /1351800/);
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.equal((html.match(/<dt[^>]*>Artikelnummer<\/dt>/g) || []).length, 2);
  assert.equal((html.match(/<dt[^>]*>Paletten<\/dt>/g) || []).length, 2);
  assert.ok(!html.includes("<details") && !html.includes("<summary"));
  assert.ok(!html.includes("Retouren") && !html.includes("Aufträge"));
});

test("Leere IST-Liste erzeugt keine künstlichen Daten; Einzelposition und Importtexte sicher", () => {
  assert.equal(renderToStaticMarkup(createElement(ScannerIstDetails, { rows: [] })), "");
  const html = renderToStaticMarkup(createElement(ScannerIstDetails, {
    rows: [{ material: "<script>bad</script>", paletten: 1.5 }],
  }));
  assert.match(html, /1 Position /);
  assert.match(html, /1,5 Pal\./);
  assert.ok(html.includes("&lt;script&gt;") && !html.includes("<script>"));
  const missing = renderToStaticMarkup(createElement(ScannerIstDetails, { rows: [{}] }));
  assert.match(missing, /Ohne Artikelnummer/);
  assert.match(missing, /0 Pal\./);
});
