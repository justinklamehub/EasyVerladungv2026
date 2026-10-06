import { DEADLINE_TIME_ZONE, type DeadlineOrder, type DeadlineStatus } from "./delivery-deadlines";

export const DEADLINE_LABELS: Record<DeadlineStatus, string> = {
  critical: "Kritisch", soon: "Bald fällig", upcoming: "Demnächst",
  safe: "Unkritisch", week: "KW-Termine", unknown: "Ohne gültigen Termin",
};
const HEADERS = ["Status", "Termin", "Rest", "Regal", "Spedition", "Relation", "Plus-KW", "Paletten"];

// The table, printout and export must all use this exact selection, in the same order.
export function filterDeadlineRows(rows: DeadlineOrder[], filter: DeadlineStatus | "all", search: string) {
  const needle = search.trim().toLowerCase();
  return rows.filter((r) =>
    (filter === "all" || (filter === "week" ? r.dateLabel.startsWith("KW ") : r.status === filter)) &&
    (!needle || [r.order.shelf, r.order.spedition, r.order.relation]
      .some((v) => String(v ?? "").toLowerCase().includes(needle))));
}

function cells(r: DeadlineOrder): string[] {
  const rest = r.days == null ? "–" : r.days < 0 ? `${-r.days} Tg. überfällig`
    : r.days === 0 ? "Heute" : `${r.days} Tg.`;
  return [
    DEADLINE_LABELS[r.status], r.dateLabel,
    rest + (r.dateLabel.startsWith("KW ") ? " · KW-Beginn (Montag)" : ""),
    String(r.order.shelf ?? ""), String(r.order.spedition ?? ""), String(r.order.relation ?? ""),
    r.order.plusKw ? String(r.order.plusKw) : "–",
    (Number(r.order.paletten) || 0).toLocaleString("de-DE", { useGrouping: false }),
  ];
}

function csvCell(value: string) {
  // Imported names can contain spreadsheet formulas. Treat those as text.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function deadlineCsv(shown: DeadlineOrder[]): string {
  return "\uFEFF" + [HEADERS, ...shown.map(cells)]
    .map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function deadlinePrintHtml(
  shown: DeadlineOrder[], filter: DeadlineStatus | "all", search: string, createdAt = new Date(),
): string {
  const selection = filter === "all" ? "Alle Status" : DEADLINE_LABELS[filter];
  const pallets = shown.reduce((n, r) => n + (Number(r.order.paletten) || 0), 0);
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
<p>${shown.length.toLocaleString("de-DE")} Aufträge · ${pallets.toLocaleString("de-DE")} Paletten · Stand: ${escapeHtml(stamp)} (${DEADLINE_TIME_ZONE})</p>
<table><thead><tr>${HEADERS.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>${shown.map((r) => `<tr>${cells(r).map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`;
}
