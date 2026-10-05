import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShelfStockDrops } from "./shelf-stock-drops";

test("Regaldetails trennen IST, Retouren und Aufträge in unabhängige Drops", () => {
  const html = renderToStaticMarkup(createElement(ShelfStockDrops, {
    shelfId: 123, ist: [{ material: "1351800", paletten: 10 }],
    retouren: [{ kunde: "Retourenkunde", material: "1714800", paletten: 2 }],
    auftraege: [{ spedition: "DPD", relation: "R1", termin: "22.09.2026", calendarWeek: "39.2026", belege: ["80607479"], paletten: 3 }],
    imported: { ist: true, retouren: true, auftraege: true },
    totals: { ist: 10, retouren: 2, auftraege: 3 },
  }));
  const drops = html.split("<details").slice(1);
  assert.equal(drops.length, 3);
  assert.ok(drops[0].includes("1351800") && !drops[0].includes("Retourenkunde") && !drops[0].includes("DPD"));
  assert.ok(drops[1].includes("Retourenkunde") && drops[1].includes("1714800") && !drops[1].includes("1351800"));
  assert.ok(drops[2].includes("DPD") && drops[2].includes("39.2026") && drops[2].includes("80607479"));
  assert.ok(html.includes("stock-drop-ist-123") && html.includes("stock-drop-retouren-123") && html.includes("stock-drop-auftraege-123"));
});

test("Leere Bestände und fehlende Importe werden unterschiedlich angezeigt", () => {
  const html = renderToStaticMarkup(createElement(ShelfStockDrops, {
    shelfId: 456, ist: [], retouren: [], auftraege: [],
    imported: { ist: true, retouren: true, auftraege: false },
  }));
  assert.equal(html.split("<details").length - 1, 3);
  assert.ok(html.includes("Keine IST-Paletten auf diesem Regalplatz."));
  assert.ok(html.includes("Keine Retourenpaletten auf diesem Regalplatz."));
  assert.ok(html.includes("Daten noch nicht importiert."));
  assert.ok(!html.includes("…"), "Regale ohne Belegung zeigen 0, keinen dauerhaften Ladezustand");
});
