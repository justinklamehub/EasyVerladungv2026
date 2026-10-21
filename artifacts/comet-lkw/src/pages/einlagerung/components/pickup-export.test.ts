import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { classifyDeliveryOrders } from "./delivery-deadlines";
import { deadlineExcel, deadlinePrintHtml } from "./delivery-deadlines-output";

test("Liefertermin-Ausgaben erhalten Abholstatus, LKW-Text und numerische Paletten ohne HTML auszuführen", async () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const raw = { deliveryNumber: "80000019", shelf: "A1", termin: "22.10.2026", paletten: 3,
    pickupStatus: "Abholung eingeplant", pickupTruck: "LKW #19 · <Test> & Partner" };
  const rows = classifyDeliveryOrders([raw], { criticalDays: 2, soonDays: 7, upcomingDays: 14 }, now);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await deadlineExcel(rows, undefined, now));
  const sheet = book.getWorksheet("Liefertermine")!;
  assert.equal(sheet.getCell("L1").value, "Abholplanung");
  assert.equal(sheet.getCell("L2").value, raw.pickupStatus);
  assert.equal(sheet.getCell("M2").value, raw.pickupTruck);
  assert.equal(sheet.getCell("K2").value, 3);
  assert.equal(sheet.getColumn(11).numFmt, "#,##0.###");
  const html = deadlinePrintHtml(rows, "all", "", now);
  assert.match(html, /Abholung eingeplant/);
  assert.match(html, /&lt;Test&gt; &amp; Partner/);
  assert.ok(!html.includes("<Test>"));
});
