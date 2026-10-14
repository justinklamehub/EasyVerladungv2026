import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { classifyDeliveryOrders } from "./delivery-deadlines";
import { deadlineExcel, deadlinePrintHtml } from "./delivery-deadlines-output";
import { deadlineFacetOptions, deadlineFilterDetails, deadlineRangeInvalid, emptyDeadlineFilters, filterDeliveryRows } from "./deadline-filters";

const now = new Date("2026-10-07T12:00:00Z");
const rows = classifyDeliveryOrders([
  { deliveryNumber: "80001", shelf: "A1", spedition: "DHL Freight", relation: "1", termin: "06.10.2026", hus: ["HU001"], belege: ["VB001"], paletten: 1, debitor: "001234", debitorName: "Muster GmbH" },
  { deliveryNumber: "80002", shelf: "A2", spedition: "DHL Freight", relation: "10", termin: "12.10.2026", hus: ["HU002"], paletten: 2 },
  { deliveryNumber: "80003", shelf: "B1", spedition: "Andere", relation: "Nord", termin: "42.2026", hus: ["HU003"], paletten: 1 },
  { deliveryNumber: "80004", shelf: "B2", spedition: "Andere", relation: "Süd", termin: "01.11.2026", hus: ["HU004"], paletten: 1 },
  { deliveryNumber: "80005", shelf: "C1", spedition: "Altspediteur", relation: "", termin: "", paletten: 3 },
], { criticalDays: 2, soonDays: 7, upcomingDays: 14 }, now);
const ids = (result: typeof rows) => result.map((r) => r.order.deliveryNumber).sort();

test("Status-Mehrfachauswahl OR und weitere Kriterien AND", () => {
  const filters = { ...emptyDeadlineFilters(), statuses: ["critical", "soon"] as const };
  assert.deepEqual(ids(filterDeliveryRows(rows, { ...filters, statuses: [...filters.statuses] })), ["80001", "80002", "80003"]);
  const combined = { ...emptyDeadlineFilters(), statuses: ["critical", "soon"] as ("critical" | "soon")[] };
  combined.facets.spedition = ["DHL Freight"];
  assert.deepEqual(ids(filterDeliveryRows(rows, combined)), ["80001", "80002"]);
  combined.overdueOnly = true;
  assert.deepEqual(ids(filterDeliveryRows(rows, combined)), ["80001"]);
});
test("Suchbegriffe suchen HU, Beleg, Termin und verschiedene Felder gemeinsam", () => {
  assert.deepEqual(ids(filterDeliveryRows(rows, { ...emptyDeadlineFilters(), search: "001234" })), ["80001"]);
  assert.deepEqual(ids(filterDeliveryRows(rows, { ...emptyDeadlineFilters(), search: "muster gmbh dhl" })), ["80001"]);
  assert.deepEqual(ids(filterDeliveryRows(rows, { ...emptyDeadlineFilters(), search: "dhl freight HU001 VB001" })), ["80001"]);
  assert.deepEqual(ids(filterDeliveryRows(rows, { ...emptyDeadlineFilters(), search: "DHL A2 12.10.2026" })), ["80002"]);
  assert.deepEqual(filterDeliveryRows(rows, { ...emptyDeadlineFilters(), search: "DHL Nord" }), []);
});

test("Debitor-Präfix sucht nur am Anfang der Kundennummer, nicht in anderen Feldern", async () => {
  const source = classifyDeliveryOrders([
    { deliveryNumber: "80001", debitor: "51045", termin: "06.10.2026", paletten: 1 },
    { deliveryNumber: "80002", debitor: "51045001", termin: "06.10.2026", paletten: 2 },
    { deliveryNumber: "80003", debitor: "151045", termin: "06.10.2026", paletten: 3 },
    { deliveryNumber: "80004", debitor: "51046", debitorName: "51045 im Namen", termin: "06.10.2026", paletten: 4 },
    { deliveryNumber: "80005", debitor: "0051045", termin: "06.10.2026", paletten: 5 },
    { deliveryNumber: "8051045", termin: "06.10.2026", paletten: 6 },
    { deliveryNumber: "80007", debitor: "70000, 51045999", termin: "06.10.2026", paletten: 7 },
  ], { criticalDays: 2, soonDays: 7, upcomingDays: 14 }, now);
  const filters = { ...emptyDeadlineFilters(), debitorPrefix: " 51045 " };
  const shown = filterDeliveryRows(source, filters);
  assert.deepEqual(ids(shown), ["80001", "80002", "80007"]);
  assert.equal(filterDeliveryRows(source, { ...filters, debitorPrefix: "0051" })[0].order.deliveryNumber, "80005");
  assert.equal(filterDeliveryRows(source, { ...filters, debitorPrefix: "99999" }).length, 0);
  assert.equal(filterDeliveryRows(source, emptyDeadlineFilters()).length, source.length);
  const { debitorPrefix: _prefix, ...olderFilters } = emptyDeadlineFilters();
  assert.equal(filterDeliveryRows(source, olderFilters).length, source.length, "Bereits geöffnete Ansichten ohne das neue Feld bleiben verwendbar");
  assert.deepEqual(deadlineFilterDetails(olderFilters).find(([key]) => key === "Debitorennummer beginnt mit"), ["Debitorennummer beginnt mit", "Alle"]);
  assert.equal(filterDeliveryRows(source, { ...filters, search: "80002" }).length, 1);
  const details = deadlineFilterDetails(filters);
  assert.deepEqual(details.find(([key]) => key === "Debitorennummer beginnt mit"), ["Debitorennummer beginnt mit", "51045"]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await deadlineExcel(shown, details, now));
  assert.equal(workbook.getWorksheet("Liefertermine")!.rowCount, 4);
  const html = deadlinePrintHtml(shown, [], "", now, details);
  assert.match(html, /Debitorennummer beginnt mit: 51045/);
  assert.ok(!html.includes("151045") && !html.includes("8051045"));
});
test("Datumsspanne ist einschließlich; KW zählt nach Montag ohne Plus-KW-Verlängerung", () => {
  const selection = { ...emptyDeadlineFilters(), dateFrom: "2026-10-12", dateTo: "2026-10-12" };
  assert.deepEqual(ids(filterDeliveryRows(rows, selection)), ["80002", "80003"]);
  assert.deepEqual(ids(filterDeliveryRows(rows, { ...selection, statuses: ["week"] })), ["80003"]);
  assert.equal(deadlineRangeInvalid({ ...selection, dateFrom: "2026-10-13" }), true);
  assert.equal(deadlineRangeInvalid({ ...selection, dateTo: "2026-02-30" }), true);
  assert.deepEqual(filterDeliveryRows(rows, { ...selection, dateFrom: "2026-10-13" }), []);
});
test("Dynamische Facetten beachten andere Kriterien; genaue Relation und Texteingabe bleiben getrennt", () => {
  const filters = emptyDeadlineFilters();
  filters.facets.relation = ["1"];
  assert.deepEqual(ids(filterDeliveryRows(rows, filters)), ["80001"]);
  filters.facets.relation = ["__text__:1"];
  assert.deepEqual(ids(filterDeliveryRows(rows, filters)), ["80001", "80002"]);
  filters.facets.shelf = ["A1"];
  const carriers = deadlineFacetOptions(rows, filters, "spedition");
  assert.deepEqual(carriers.map((o) => o.value), ["DHL Freight"]);
});
test("Druck und Excel übernehmen dieselben aktiven Filter und dieselben ausgewählten Positionen", async () => {
  const filters = { ...emptyDeadlineFilters(), search: "VB001", overdueOnly: true };
  const shown = filterDeliveryRows(rows, filters);
  const details = deadlineFilterDetails(filters);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await deadlineExcel(shown, details, now));
  const sheet = workbook.getWorksheet("Liefertermine")!;
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("E2").value, "80001");
  const meta = JSON.stringify(workbook.getWorksheet("Filter und Summen")!.getSheetValues());
  assert.match(meta, /VB001/);
  assert.match(meta, /Nur überfällig/);
  const html = deadlinePrintHtml(shown, filters.statuses, filters.search, now, details);
  assert.match(html, /Nur überfällig: Ja/);
  assert.match(html, /80001/);
  assert.ok(!html.includes("80002"));
  assert.deepEqual(ids(filterDeliveryRows(rows, emptyDeadlineFilters())), ["80001", "80002", "80003", "80004", "80005"]);
});
