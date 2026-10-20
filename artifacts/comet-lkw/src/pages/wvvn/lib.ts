import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";

export const P = {
  view: "wvvn.view", scan: "wvvn.scan", delete: "wvvn.delete", finish: "wvvn.finish", devices: "wvvn.devices",
  articles: "wvvn.articles", export: "wvvn.export", settings: "wvvn.settings", import: "wvvn.import", edit: "wvvn.edit", remove: "wvvn.remove",
} as const;

export function useWvvnAccess() {
  const { user } = useAuth();
  const perms = usePermissions();
  const admin = user?.role === "comet_admin";
  const has = (k: string) => admin || !!perms[k];
  const any = () => Object.values(P).some(has);
  return { has, any, user };
}

export function errMsg(e: unknown): string {
  const x = e as any;
  return x?.data?.error || x?.response?.data?.error || x?.message || "Unbekannter Fehler";
}

export function useInvalidateWvvn() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("/api/wvvn/") });
}

export const sel = "h-9 w-full rounded-md border border-input bg-white px-2 text-sm";
export const MODE_LABEL = { WERKSVERKAUF: "Werksverkauf", VERNICHTUNG: "Vernichtung" } as const;
export const MODES = ["WERKSVERKAUF", "VERNICHTUNG"] as const;

const TZ = "Europe/Berlin";
export const berlinDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "–";
export const fmtNum = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n);

export function parseQty(v: string): number | null {
  const t = v.trim().replace(/\s/g, "");
  const m = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : ""));
  return Number.isFinite(n) && n > 0 && n <= 1000000 ? n : null;
}

export async function downloadCsv(path: string, filename: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const r = await fetch(`${base}/api/wvvn/${path}`, { credentials: "include" });
  if (!r.ok) {
    let m = `HTTP ${r.status}`;
    try { m = (await r.json()).error || m; } catch { /* ignore */ }
    throw new Error(m);
  }
  const t = await r.text();
  const url = URL.createObjectURL(new Blob([t.startsWith("\uFEFF") ? t : "\uFEFF" + t], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const catLabel = (kware: boolean) => (kware ? "K-Ware" : "Retoure");
