import { DEADLINE_TIME_ZONE, type DeadlineOrder, type DeadlineStatus } from "./delivery-deadlines";
import { summarizeOrders } from "./orders-filters";

export const DEADLINE_LABELS: Record<DeadlineStatus, string> = {
  critical: "Kritisch", soon: "Bald fällig", upcoming: "Demnächst",
  safe: "Unkritisch", week: "KW-Termine", unknown: "Ohne gültigen Termin",
};
const HEADERS = ["Status", "Termin", "Rest", "Regal", "Lieferungsnummer", "Spedition", "Relation", "Plus-KW", "Paletten"];

// The table, printout and export must all use this exact selection, in the same order.
export function filterDeadlineRows(rows: DeadlineOrder[], filter: DeadlineStatus | "all", search: string) {
  const needle = search.trim().toLowerCase();
  return rows.filter((r) =>
    (filter === "all" || (filter === "week" ? r.dateLabel.startsWith("KW ") : r.status === filter)) &&
    (!needle || [r.order.deliveryNumber, r.order.shelf, r.order.spedition, r.order.relation]
      .some((v) => String(v ?? "").toLowerCase().includes(needle))));
}

function cells(r: DeadlineOrder): string[] {
  const rest = r.days == null ? "–" : r.days < 0 ? `${-r.days} Tg. überfällig`
    : r.days === 0 ? "Heute" : `${r.days} Tg.`;
  return [
    DEADLINE_LABELS[r.status], r.dateLabel,
    rest + (r.dateLabel.startsWith("KW ") ? " · KW-Beginn (Montag)" : ""),
    String(r.order.shelf ?? ""), String(r.order.deliveryNumber || "–"), String(r.order.spedition ?? ""), String(r.order.relation ?? ""),
    r.order.plusKw ? String(r.order.plusKw) : "–",
    (Number(r.order.paletten) || 0).toLocaleString("de-DE", { useGrouping: false }),
  ];
}

export async function deadlineExcel(shown: DeadlineOrder[], details?: string[][], createdAt = new Date()) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Liefertermine");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const widths = [24, 22, 38, 20, 22, 32, 22, 12, 14];
  widths.forEach((width, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = width;
    // Explicit string values + text formatting prevent Excel's date/number
    // inference for shelf names, relations, KW labels and leading zeroes.
    column.numFmt = i < 8 ? "@" : "#,##0.###";
  });
  for (const item of shown) {
    const values: (string | number)[] = cells(item);
    values[8] = Number(item.order.paletten) || 0;
    sheet.addRow(values);
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: 9 } };
  if (details) {
    const info = workbook.addWorksheet("Filter und Summen");
    info.getColumn(1).width = 28;
    info.getColumn(2).width = 80;
    info.addRow(["Stand", createdAt.toLocaleString("de-DE", { timeZone: DEADLINE_TIME_ZONE })]);
    details.forEach((row) => info.addRow(row));
    const sum = summarizeOrders(shown.map((r) => r.order));
    [["Aufträge", sum.orders], ["Auftragspositionen", sum.positions], ["Paletten", sum.pallets],
      ["Regale", sum.shelves], ["Speditionen", sum.carriers]].forEach((row) => info.addRow(row));
    info.addRow(["Zählweise", "Lieferungen und HU-Nummern nur einmal; Positionen ohne Liefernummer separat."]);
  }
  return workbook.xlsx.writeBuffer();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function deadlinePrintHtml(
  shown: DeadlineOrder[], filter: DeadlineStatus | "all" | DeadlineStatus[], search: string, createdAt = new Date(), details?: string[][],
): string {
  const selection = Array.isArray(filter) ? filter.length ? filter.map((s) => DEADLINE_LABELS[s]).join(" oder ") : "Alle Status"
    : filter === "all" ? "Alle Status" : DEADLINE_LABELS[filter];
  const totals = summarizeOrders(shown.map((r) => r.order));
  const pallets = totals.pallets;
  const stamp = createdAt.toLocaleString("de-DE", { timeZone: DEADLINE_TIME_ZONE });
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>COMET LKW – Liefertermine</title><style>
@page { size: A4 landscape; margin: 12mm; }
body { font: 11px Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 20px; margin: 0 0 8px; } p { margin: 5px 0; }
table { border-collapse: collapse; width: 100%; margin-top: 16px; table-layout: fixed; }
thead { display: table-header-group; } tr { break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; overflow-wrap: anywhere; }
th { background: #f1f5f9; } th:last-child, td:last-child { text-align: right; }
</style></head><body><h1>COMET LKW – Liefertermine</h1>
<p>Auswahl: ${escapeHtml(selection)}${search.trim() ? ` · Suche: ${escapeHtml(search.trim())}` : ""}</p>
${(details ?? []).filter(([key]) => key !== "Status" && key !== "Suche").map(([key, value]) =>
    `<p>${escapeHtml(key)}: ${escapeHtml(value)}</p>`).join("")}
<p>${totals.orders.toLocaleString("de-DE")} Aufträge · ${pallets.toLocaleString("de-DE")} Paletten · Stand: ${escapeHtml(stamp)} (${DEADLINE_TIME_ZONE})</p>
<p>${totals.positions.toLocaleString("de-DE")} Auftragspositionen. Liefernummern und HU-Nummern werden nur einmal gezählt.${totals.unidentified ? ` ${totals.unidentified} Positionen ohne Liefernummer separat gezählt.` : ""}</p>
<table><thead><tr>${HEADERS.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>${shown.map((r) => `<tr>${cells(r).map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`;
}
