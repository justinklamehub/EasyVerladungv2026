import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { emptyOrderFilters, matchesOrderFilters, orderFilterRow, type OrderRow } from "./orders-filters";
import { ordersExcel, ordersPrintHtml } from "./orders-output";

const now = new Date("2026-10-07T12:00:00Z");
const rows: OrderRow[] = [
  { deliveryNumber: "80000001", shelf: "01-02", spedition: "DHL", relation: "001", termin: "07.10.2026", calendarWeek: "41.2026", plusKw: "2", hus: ["HU1", "HU2"], paletten: 2 },
  { deliveryNumber: "80000001", shelf: "03-04", spedition: "DHL", relation: "001", termin: "07.10.2026", calendarWeek: "41.2026", hus: ["HU2", "HU3"], paletten: 2 },
  { deliveryNumber: "80000002", shelf: "B2", spedition: "Andere", relation: "Nord", hus: ["HU4"], paletten: 1 },
];
const selection = { ...emptyOrderFilters(), spedition: ["DHL"], relation: ["001"], shelf: ["01-02", "03-04"] };
async function workbook(selected: OrderRow[]) {
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(await ordersExcel(selected, selection, "80000001", now));
  return result;
}

test("Excel und Druck erhalten dieselben gefilterten Positionen und keine ausgeschlossenen Daten", async () => {
  const selected = rows.filter((r) => matchesOrderFilters(orderFilterRow(r), selection));
  const book = await workbook(selected);
  const sheet = book.getWorksheet("Aufträge")!;
  assert.equal(sheet.rowCount, selected.length + 1);
  assert.equal(sheet.getCell("B2").value, "01-02");
  assert.equal(sheet.getCell("B3").value, "03-04");
  const html = ordersPrintHtml(selected, selection, "80000001", now);
  assert.ok(!html.includes("80000002"));
  assert.ok(!JSON.stringify(book.getWorksheet("Aufträge")!.getSheetValues()).includes("Andere"));
  assert.match(html, /1 Aufträge · 3 Paletten · 2 Auftragspositionen/);
  assert.match(html, /01-02 oder 03-04/);
  const info = book.getWorksheet("Filter und Summen")!;
  assert.ok(JSON.stringify(info.getSheetValues()).includes("80000001"));
  assert.equal(info.getRow(8).getCell(2).value, 1);
  assert.equal(info.getRow(10).getCell(2).value, 3);
});
test("Excel schützt führende Nullen und Formeltexte; Paletten bleiben Zahlen", async () => {
  const special = [{ ...rows[0], relation: "=HYPERLINK(\"bad\")", spedition: "<script>alert(1)</script>" }];
  const sheet = (await workbook(special)).getWorksheet("Aufträge")!;
  assert.equal(sheet.getCell("D2").value, special[0].relation);
  assert.equal(sheet.getCell("D2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("B2").numFmt, "@");
  assert.equal(sheet.getCell("H2").type, ExcelJS.ValueType.Number);
  const html = ordersPrintHtml(special, { ...selection, relation: ["__text__:<img src=x>"] }, "<script>x</script>", now);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img src=x&gt; \(Textsuche\)/);
});
test("Leere und ungefilterte Ausgaben bleiben konsistent", async () => {
  assert.equal((await workbook([])).getWorksheet("Aufträge")!.rowCount, 1);
  assert.match(ordersPrintHtml([], emptyOrderFilters(), "", now), /0 Aufträge · 0 Paletten/);
  assert.match(ordersPrintHtml(rows, emptyOrderFilters(), "", now), /2 Aufträge · 4 Paletten · 3 Auftragspositionen/);
  assert.equal((await workbook(rows)).getWorksheet("Aufträge")!.rowCount, 4);
});
