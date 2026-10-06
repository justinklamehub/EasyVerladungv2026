import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeliveryOrders, DEFAULT_DEADLINE_THRESHOLDS } from "./delivery-deadlines";
import { deadlineCsv, deadlinePrintHtml, filterDeadlineRows } from "./delivery-deadlines-output";

const now = new Date("2026-10-06T10:00:00Z");
const rows = classifyDeliveryOrders([
  { shelf: "A-01", spedition: "Alpha", relation: "Nord", termin: "06.10.2026", paletten: 3 },
  { shelf: "B-02", spedition: "Beta", relation: "Süd", termin: "09.10.2026", paletten: 7 },
  { shelf: "C-03", spedition: "Gamma", relation: "Nord", termin: "43.2026", paletten: 11, plusKw: "02" },
  { shelf: "D-04", spedition: "Delta", relation: "Ost", termin: "", paletten: 1 },
], DEFAULT_DEADLINE_THRESHOLDS, now);

test("Druck und CSV enthalten nur die kombinierte Status-/Suchauswahl", () => {
  const shown = filterDeadlineRows(rows, "critical", " nOrD ");
  assert.equal(shown.length, 1);
  const csv = deadlineCsv(shown), html = deadlinePrintHtml(shown, "critical", " nOrD ", now);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.trim().split("\r\n").length, 2, "Eine Kopfzeile und genau ein gefilterter Auftrag");
  for (const output of [csv, html]) {
    assert.ok(output.includes("A-01"));
    for (const excluded of ["B-02", "C-03", "D-04"]) assert.ok(!output.includes(excluded));
  }
  assert.match(html, /1 Aufträge · 3 Paletten/);
  assert.match(html, /Auswahl: Kritisch · Suche: nOrD/);
});

test("KW-Auswahl, reine Textsuche, ungefilterte und leere Auswahl", () => {
  const week = filterDeadlineRows(rows, "week", "");
  assert.deepEqual(week.map((r) => r.order.shelf), ["C-03"]);
  for (const output of [deadlineCsv(week), deadlinePrintHtml(week, "week", "", now)]) {
    assert.match(output, /KW-Beginn \(Montag\)/);
    assert.match(output, /43\.2026/);
  }
  assert.equal(filterDeadlineRows(rows, "all", "").length, rows.length);
  assert.deepEqual(filterDeadlineRows(rows, "all", "beta").map((r) => r.order.shelf), ["B-02"]);
  const empty = filterDeadlineRows(rows, "soon", "A-01");
  assert.equal(empty.length, 0);
  assert.equal(deadlineCsv(empty).trim().split("\r\n").length, 1);
  assert.match(deadlinePrintHtml(empty, "soon", "A-01", now), /0 Aufträge · 0 Paletten/);
});

test("Importtexte werden in HTML maskiert und in CSV sicher gequotet", () => {
  const special = [{ ...rows[0], order: {
    ...rows[0].order, shelf: '<script>alert("x")</script>',
    spedition: 'Name; "Zitat"\nZeile', relation: " =HYPERLINK(\"bad\")", paletten: 1.5,
  } }];
  const csv = deadlineCsv(special);
  assert.match(csv, /"Name; ""Zitat""\nZeile"/);
  assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"1,5"'));
  const html = deadlinePrintHtml(special, "all", "<img src=x onerror=alert(1)>", now);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img"));
});
