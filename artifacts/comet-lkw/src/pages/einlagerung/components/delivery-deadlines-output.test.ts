import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { classifyDeliveryOrders, DEFAULT_DEADLINE_THRESHOLDS } from "./delivery-deadlines";
import { deadlineExcel, deadlinePrintHtml, filterDeadlineRows } from "./delivery-deadlines-output";

const now = new Date("2026-10-06T10:00:00Z");
const rows = classifyDeliveryOrders([
  { shelf: "A-01", spedition: "Alpha", relation: "Nord", termin: "06.10.2026", paletten: 3 },
  { shelf: "B-02", spedition: "Beta", relation: "Süd", termin: "09.10.2026", paletten: 7 },
  { shelf: "C-03", spedition: "Gamma", relation: "Nord", termin: "43.2026", paletten: 11, plusKw: "02" },
  { shelf: "D-04", spedition: "Delta", relation: "Ost", termin: "", paletten: 1 },
], DEFAULT_DEADLINE_THRESHOLDS, now);

async function readExcel(shown: typeof rows) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await deadlineExcel(shown));
  return workbook.getWorksheet("Liefertermine")!;
}

test("Druck und Excel enthalten nur die kombinierte Status-/Suchauswahl", async () => {
  const shown = filterDeadlineRows(rows, "critical", " nOrD ");
  assert.equal(shown.length, 1);
  const sheet = await readExcel(shown), html = deadlinePrintHtml(shown, "critical", " nOrD ", now);
  assert.equal(sheet.rowCount, 2, "Eine Kopfzeile und genau ein gefilterter Auftrag");
  for (const output of [JSON.stringify(sheet.getSheetValues()), html]) {
    assert.ok(output.includes("A-01"));
    for (const excluded of ["B-02", "C-03", "D-04"]) assert.ok(!output.includes(excluded));
  }
  assert.match(html, /1 Aufträge · 3 Paletten/);
  assert.match(html, /Auswahl: Kritisch · Suche: nOrD/);
});

test("KW-Auswahl, reine Textsuche, ungefilterte und leere Auswahl", async () => {
  const week = filterDeadlineRows(rows, "week", "");
  assert.deepEqual(week.map((r) => r.order.shelf), ["C-03"]);
  for (const output of [JSON.stringify((await readExcel(week)).getSheetValues()), deadlinePrintHtml(week, "week", "", now)]) {
    assert.match(output, /KW-Beginn \(Montag\)/);
    assert.match(output, /43\.2026/);
  }
  assert.equal(filterDeadlineRows(rows, "all", "").length, rows.length);
  assert.deepEqual(filterDeadlineRows(rows, "all", "beta").map((r) => r.order.shelf), ["B-02"]);
  const empty = filterDeadlineRows(rows, "soon", "A-01");
  assert.equal(empty.length, 0);
  assert.equal((await readExcel(empty)).rowCount, 1);
  assert.match(deadlinePrintHtml(empty, "soon", "A-01", now), /0 Aufträge · 0 Paletten/);
});

test("Importtexte bleiben Excel-Text, keine Formeln; HTML wird maskiert", async () => {
  const special = [{ ...rows[0], order: {
    ...rows[0].order, shelf: '<script>alert("x")</script>',
    spedition: 'Name; "Zitat"\nZeile', relation: " =HYPERLINK(\"bad\")", paletten: 1.5,
  } }];
  const sheet = await readExcel(special);
  assert.equal(sheet.getCell("E2").value, special[0].order.spedition);
  assert.equal(sheet.getCell("F2").value, special[0].order.relation);
  assert.equal(sheet.getCell("F2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("H2").value, 1.5);
  assert.equal(sheet.getCell("H2").type, ExcelJS.ValueType.Number);
  const html = deadlinePrintHtml(special, "all", "<img src=x onerror=alert(1)>", now);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img"));
});

test("Datumsähnliche Regalnamen und führende Nullen bleiben nach XLSX-Roundtrip Text", async () => {
  const shelves = ["01-02", "1.3", "03/04", "0007", "01.02.2026", "=HYPERLINK(\"bad\")"];
  const selected = shelves.map((shelf) => ({ ...rows[0], order: { ...rows[0].order, shelf } }));
  const sheet = await readExcel(selected);
  shelves.forEach((shelf, i) => {
    const cell = sheet.getCell(i + 2, 4);
    assert.equal(cell.value, shelf);
    assert.equal(cell.type, ExcelJS.ValueType.String);
    assert.equal(cell.numFmt, "@");
  });
});
