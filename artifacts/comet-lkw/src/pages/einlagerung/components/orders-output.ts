import { summarizeOrders, TEXT_FILTER_PREFIX, type OrderFilters, type OrderRow } from "./orders-filters";

const HEADERS = ["Liefernummer", "Regal", "Spedition", "Relation", "Termin", "Kalenderwoche", "Plus-KW", "Paletten"];
const KEYS = ["deliveryNumber", "shelf", "spedition", "relation", "termin", "calendarWeek", "plusKw"] as const;
const TIME_ZONE = "Europe/Berlin";
const string = (v: unknown) => String(v ?? "");
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function orderOutputFilters(filters: OrderFilters, search: string) {
  const selected = (values: string[]) => values.length ? values.map((v) =>
    v.startsWith(TEXT_FILTER_PREFIX) ? `${v.slice(TEXT_FILTER_PREFIX.length)} (Textsuche)` : v).join(" oder ") : "Alle";
  return [
    ["Suche", search.trim() || "Keine"],
    ["Speditionen", selected(filters.spedition)],
    ["Relationen", selected(filters.relation)],
    ["Termine / KW", selected(filters.termin)],
    ["Regale", selected(filters.shelf)],
  ];
}

// Receive exactly the already-filtered table rows; never refetch unfiltered data.
export async function ordersExcel(rows: OrderRow[], filters: OrderFilters, search: string, createdAt = new Date()) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Easy-Verladung";
  workbook.created = createdAt;
  const sheet = workbook.addWorksheet("Aufträge");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  [22, 20, 32, 24, 22, 20, 14, 14].forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
    sheet.getColumn(i + 1).numFmt = i < 7 ? "@" : "#,##0.###";
  });
  for (const row of rows) sheet.addRow([
    ...KEYS.map((key) => string(row[key])), Number(row.paletten) || 0,
  ]);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: HEADERS.length } };
  const info = workbook.addWorksheet("Filter und Summen");
  info.getColumn(1).width = 28;
  info.getColumn(2).width = 80;
  info.addRow(["Auswertung", "Einlagerung – Aufträge"]);
  info.addRow(["Stand", createdAt.toLocaleString("de-DE", { timeZone: TIME_ZONE }) + ` (${TIME_ZONE})`]);
  orderOutputFilters(filters, search).forEach((row) => info.addRow(row));
  const sum = summarizeOrders(rows);
  [
    ["Aufträge", sum.orders], ["Auftragspositionen", sum.positions], ["Paletten", sum.pallets],
    ["Regale", sum.shelves], ["Speditionen", sum.carriers],
    ["Positionen ohne Liefernummer", sum.unidentified],
  ].forEach((row) => info.addRow(row));
  info.addRow(["Zählweise", "Liefernummern und HU-Nummern über alle Positionen nur einmal; Positionen ohne Liefernummer separat."]);
  return workbook.xlsx.writeBuffer();
}

export function ordersPrintHtml(rows: OrderRow[], filters: OrderFilters, search: string, createdAt = new Date()) {
  const sum = summarizeOrders(rows);
  const number = (n: number) => n.toLocaleString("de-DE");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Easy-Verladung – Aufträge</title><style>
@page { size: A4 landscape; margin: 12mm; }
body { font: 11px Arial,sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 20px; margin: 0 0 8px; } p { margin: 5px 0; }
table { border-collapse: collapse; width: 100%; margin-top: 16px; table-layout: fixed; }
thead { display: table-header-group; } tr { break-inside: avoid; }
th,td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; overflow-wrap: anywhere; }
th { background: #f1f5f9; } th:last-child,td:last-child { text-align: right; }
</style></head><body><h1>Easy-Verladung – Aufträge</h1>
<p>Stand: ${escapeHtml(createdAt.toLocaleString("de-DE", { timeZone: TIME_ZONE }))} (${TIME_ZONE})</p>
${orderOutputFilters(filters, search).map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}
<p>${number(sum.orders)} Aufträge · ${number(sum.pallets)} Paletten · ${number(sum.positions)} Auftragspositionen · ${number(sum.shelves)} Regale · ${number(sum.carriers)} Speditionen</p>
<p>Liefernummern und HU-Nummern werden über alle Positionen nur einmal gezählt.${sum.unidentified ? ` ${number(sum.unidentified)} Positionen ohne Liefernummer werden separat als Auftrag gezählt.` : ""}</p>
<table><thead><tr>${HEADERS.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((row) => `<tr>${[...KEYS.map((key) => string(row[key])), number(Number(row.paletten) || 0)]
    .map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`;
}
