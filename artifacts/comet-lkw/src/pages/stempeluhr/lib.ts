import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import { csvCell } from "./csv";
export { csvCell, parseCsv } from "./csv";

export const P = {
  view: "stempeluhr.view", terminal: "stempeluhr.terminal", employees: "stempeluhr.employees",
  correct: "stempeluhr.correct", delete: "stempeluhr.delete", export: "stempeluhr.export",
  settings: "stempeluhr.settings", import: "stempeluhr.import",
  shifts: "stempeluhr.shifts",
} as const;

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const isoDay = (s: string) => { const [y, m, d] = s.split("-"); return `${d}.${m}.${y}`; };
export const mondayOf = (s: string) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
export const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export function useClockAccess() {
  const { user } = useAuth();
  const perms = usePermissions();
  const admin = user?.role === "comet_admin";
  const has = (k: string) => admin || !!perms[k];
  const any = (...k: string[]) => k.some(has);
  return { has, any, user };
}

export function errMsg(e: unknown): string {
  const x = e as any;
  return x?.data?.error || x?.response?.data?.error || x?.message || "Unbekannter Fehler";
}

export function useInvalidateClock() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("/api/stempeluhr/") });
}
export const terminalValidity = (expiresAt: string | null | undefined) => expiresAt ? `gültig bis ${fmtDateTime(expiresAt)}` : "Unbegrenzt";

const TZ = "Europe/Berlin";
function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === "24") o.hour = "00";
  return o;
}
export const berlinDate = (d: Date | string) => { const p = parts(new Date(d)); return `${p.year}-${p.month}-${p.day}`; };
export const berlinInput = (iso: string | null | undefined) => {
  if (!iso) return ""; const p = parts(new Date(iso)); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
export const fmtTime = (iso: string | null | undefined, sec = false) =>
  iso ? new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: sec ? "2-digit" : undefined }).format(new Date(iso)) : "–";
export const fmtDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
export const fmtDateTime = (iso: string | null | undefined) => iso ? `${fmtDate(iso)} ${fmtTime(iso, true)}` : "–";
export const fmtMin = (m: number | null | undefined) => m == null ? "–" : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;

/** Convert "YYYY-MM-DDTHH:mm" interpreted as Berlin wall time into ISO UTC. Throws on nonexistent/ambiguous. */
export function berlinToIso(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) throw new Error("Ungültiges Datum/Uhrzeit-Format");
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const ok = new Set<number>();
  for (const off of [60, 120]) {
    const t = base - off * 60000; const p = parts(new Date(t));
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === v) ok.add(t);
  }
  if (ok.size === 0) throw new Error(`${v.replace("T", " ")} existiert in Berlin nicht (Umstellung auf Sommerzeit). Bitte eine andere Uhrzeit wählen.`);
  if (ok.size > 1) throw new Error(`${v.replace("T", " ")} kommt in Berlin zweimal vor (Umstellung auf Winterzeit). Bitte die Zeit eindeutig vor 02:00 oder nach 03:00 eintragen.`);
  return new Date([...ok][0]).toISOString();
}

export function downloadCsv(name: string, rows: unknown[][]) {
  const text = "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function openPrint(title: string, body: string): boolean {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:system-ui,sans-serif;color:#111;margin:20px;font-size:12px}h1{font-size:18px}h2{font-size:14px;margin:18px 0 4px}
table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#eee}
.r{text-align:right}.sec{page-break-inside:avoid;page-break-after:always}.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card{border:1px solid #333;padding:10px;page-break-inside:avoid;text-align:center}.card svg{max-width:100%}.n{font-size:15px;font-weight:bold}
@media print{button{display:none}}</style></head><body><button onclick="window.print()">Drucken</button>${body}</body></html>`);
  w.document.close(); w.focus();
  return true;
}

export const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
