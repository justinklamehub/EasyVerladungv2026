import { pool, type PoolClient } from "@workspace/db";
import { z } from "zod/v4";
import type { WvvnArticle, WvvnSession, WvvnItem } from "@workspace/api-zod";

export class WvvnError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type Row = Record<string, any>;
export const settingsSchema = z.object({
  autoAddEan: z.boolean(), defaultKware: z.boolean(),
  deviceHours: z.number().int().min(1).max(8760).nullable(),
  mailEnabled: z.boolean(), mailTime: z.literal("00:00"),
  salesRecipients: z.string().max(2000), destructionRecipients: z.string().max(2000),
});
export const defaults = {
  autoAddEan: true, defaultKware: true, deviceHours: null,
   mailEnabled: false, mailTime: "00:00", salesRecipients: "", destructionRecipients: "",
};
export const iso = (value: any): string => new Date(value).toISOString();
export async function ensureWvvnTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wvvn_devices (
      id SERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
      user_id INTEGER NOT NULL, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wvvn_reports (
      id SERIAL PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('WERKSVERKAUF','VERNICHTUNG')),
      report_date TEXT NOT NULL, running_no INTEGER NOT NULL, status TEXT NOT NULL,
      csv TEXT NOT NULL DEFAULT '', sent_at TIMESTAMPTZ, error TEXT NOT NULL DEFAULT '',
      legacy_id INTEGER UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(mode,running_no)
    );
    CREATE TABLE IF NOT EXISTS wvvn_sessions (
      id SERIAL PRIMARY KEY, owner_key TEXT NOT NULL, actor TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('WERKSVERKAUF','VERNICHTUNG')),
      netto BOOLEAN NOT NULL, kware BOOLEAN NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','done')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
      legacy_id INTEGER UNIQUE, legacy_data JSONB NOT NULL DEFAULT '{}', report_id INTEGER REFERENCES wvvn_reports(id),
      CHECK ((status='open' AND finished_at IS NULL) OR (status='done' AND finished_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wvvn_open_owner ON wvvn_sessions(owner_key,mode,netto,kware)
      WHERE status='open' AND legacy_id IS NULL;
    CREATE INDEX IF NOT EXISTS wvvn_session_dates ON wvvn_sessions(created_at DESC);
    CREATE TABLE IF NOT EXISTS wvvn_items (
      id SERIAL PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES wvvn_sessions(id),
      article_number TEXT NOT NULL, article_name TEXT NOT NULL, scanned_code TEXT NOT NULL,
      unit TEXT NOT NULL CHECK(unit IN ('STK','VE')), quantity NUMERIC(18,3) NOT NULL CHECK(quantity>0),
      ve_factor NUMERIC(18,3) NOT NULL CHECK(ve_factor>0), pieces NUMERIC(18,3) NOT NULL CHECK(pieces>0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ, request_id TEXT,
      legacy_id INTEGER UNIQUE, UNIQUE(session_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS wvvn_items_session ON wvvn_items(session_id);
    CREATE TABLE IF NOT EXISTS wvvn_events (
      id SERIAL PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wvvn_imports (
      digest TEXT PRIMARY KEY, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), actor TEXT NOT NULL
    );
    ALTER TABLE wvvn_sessions ADD COLUMN IF NOT EXISTS legacy_data JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE wvvn_sessions ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE wvvn_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE wvvn_items ADD COLUMN IF NOT EXISTS input_method TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE wvvn_reports ADD COLUMN IF NOT EXISTS automatic_day TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS wvvn_automatic_day ON wvvn_reports(mode,automatic_day) WHERE automatic_day IS NOT NULL;
    CREATE TABLE IF NOT EXISTS wvvn_revisions (
      id SERIAL PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES wvvn_sessions(id),
      revision INTEGER NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL,
      before_data JSONB NOT NULL, after_data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(session_id,revision)
    );
  `);
}
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(743168)");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (error) { await c.query("ROLLBACK"); throw error; }
  finally { c.release(); }
}
export async function settings(c: PoolClient) {
  const r = await c.query("SELECT value FROM settings WHERE key='wvvn_settings'");
  return r.rowCount ? settingsSchema.parse({ ...JSON.parse(r.rows[0].value), mailTime: "00:00" }) : { ...defaults };
}
export async function audit(c: PoolClient, actor: string, action: string, detail: string) {
  await c.query("INSERT INTO wvvn_events(actor,action,detail) VALUES($1,$2,$3)", [actor, action, detail]);
}
export const article = (r: Row): WvvnArticle => ({
  id: r.id, number: String(r.data.number), name: String(r.data.name ?? ""), ean: String(r.data.ean ?? ""),
  veEan: String(r.data.veEan ?? ""), veFactor: Number(r.data.veFactor ?? 1),
  active: r.data.active !== false, updatedAt: iso(r.updated_at),
  ...(r.data.wvvnLegacy ? {
    legacyEan: r.data.wvvnLegacy.ean, legacyVeEan: r.data.wvvnLegacy.veEan,
    importNote: [
      r.data.wvvnLegacy.ean && r.data.wvvnLegacy.ean !== r.data.ean ? `Alt-EAN: ${r.data.wvvnLegacy.ean} (nicht übernommen)` : "",
      r.data.wvvnLegacy.veEan && r.data.wvvnLegacy.veEan !== r.data.veEan ? `Alt-VE-EAN: ${r.data.wvvnLegacy.veEan} (nicht übernommen)` : "",
      Number(r.data.wvvnLegacy.veFactor) !== Number(r.data.veFactor) ? `Alt-VE-Inhalt: ${r.data.wvvnLegacy.veFactor} (bestehender Wert beibehalten)` : "",
    ].filter(Boolean).join("; "),
  } : {}),
});
export async function articles(c: PoolClient) {
  return (await c.query("SELECT * FROM einlagerung_records WHERE kind='article' ORDER BY data->>'number'")).rows.map(article);
}
export function resolveArticle(all: WvvnArticle[], code: string, autoAddEan: boolean) {
  const originalMatches = all.filter((a) => a.active &&
    [a.number, a.ean, a.veEan, a.legacyEan, a.legacyVeEan].filter(Boolean).includes(code));
  const matches = all.filter((a) => a.active && [a.number, a.ean, a.veEan].filter(Boolean).includes(code));
  if (!matches.length && originalMatches.length > 1) throw new WvvnError("Dieser Code ist in den Altdaten mehrdeutig. Bitte Artikelnummer scannen oder Stammdaten bereinigen.", 409);
  if (!matches.length) throw new WvvnError("Artikel nicht gefunden oder inaktiv.", 404);
  if (matches.length > 1) throw new WvvnError("Dieser Code ist mehreren Artikeln zugeordnet. Bitte Stammdaten bereinigen.", 409);
  const a = matches[0];
  // Article numbers, even numeric ones of EAN length, always require a quantity.
  const unit = code !== a.number && code === a.veEan ? "VE" as const : "STK" as const;
  return { article: a, unit, autoAdd: autoAddEan && code !== a.number && (code === a.ean || code === a.veEan) };
}
export function quantityPieces(quantity: number, factor: number, unit: "STK" | "VE") {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6 ||
    Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.00001)
    throw new WvvnError("Menge muss größer als 0 sein (maximal 1.000.000, bis zu 3 Nachkommastellen).");
  if (!Number.isFinite(factor) || factor <= 0) throw new WvvnError("Ungültiger Verpackungsinhalt.");
  const raw = quantity * (unit === "VE" ? factor : 1);
  if (raw < 0.001 || raw > 1e12 || Math.abs(raw * 1000 - Math.round(raw * 1000)) > 0.00001)
    throw new WvvnError("Die Stückmenge ist zu groß oder nicht mit drei Nachkommastellen darstellbar.");
  return Math.round(raw * 1000) / 1000;
}
export const item = (r: Row): WvvnItem => ({
  id: r.id, articleNumber: r.article_number, articleName: r.article_name, scannedCode: r.scanned_code,
  unit: r.unit, quantity: Number(r.quantity), veFactor: Number(r.ve_factor), pieces: Number(r.pieces), createdAt: iso(r.created_at),
});
export const session = (r: Row, items: WvvnItem[] = []): WvvnSession => ({
  id: r.id, mode: r.mode, netto: r.netto, kware: r.kware, status: r.status, actor: r.actor,
  createdAt: iso(r.created_at), finishedAt: r.finished_at ? iso(r.finished_at) : null,
  itemCount: Number(r.item_count ?? items.length), pieces: Number(r.pieces ?? items.reduce((n, i) => n + i.pieces, 0)),
  legacy: r.legacy_id != null, revision: Number(r.revision ?? 0), reported: r.report_id != null, items,
});
export async function sessionDetail(c: PoolClient, id: number) {
  const r = await c.query("SELECT * FROM wvvn_sessions WHERE id=$1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw new WvvnError("Liste nicht gefunden.", 404);
  const items = (await c.query("SELECT * FROM wvvn_items WHERE session_id=$1 AND deleted_at IS NULL ORDER BY id DESC", [id])).rows.map(item);
  return session(r.rows[0], items);
}
export const device = (r: Row) => ({
  id: r.id, label: r.label, expiresAt: r.expires_at ? iso(r.expires_at) : null,
  revokedAt: r.revoked_at ? iso(r.revoked_at) : null, createdAt: iso(r.created_at),
});
export const report = (r: Row) => ({
  id: r.id, mode: r.mode, reportDate: r.report_date, runningNo: r.running_no, status: r.status,
  sentAt: r.sent_at ? iso(r.sent_at) : null, error: r.error, legacy: r.legacy_id != null,
});
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function buildCsv(rows: Row[]) {
  const groups = new Map<string, Row>();
  for (const r of rows) {
    const key = JSON.stringify([r.article_number, r.article_name, r.netto, r.kware]);
    const group = groups.get(key) ?? { ...r, milli: 0 };
    group.milli += Math.round(Number(r.pieces) * 1000);
    groups.set(key, group);
  }
  const lines: unknown[][] = [["Artikelnummer", "Artikelname", "Netto", "K-Ware", "Menge", "Charge"]];
  for (const r of [...groups.values()].sort((a, b) => String(a.article_number).localeCompare(String(b.article_number)))) {
    lines.push([r.article_number, r.article_name, r.netto ? "Ja" : "Nein", r.kware ? "Ja" : "Nein", String(r.milli / 1000).replace(".", ","), "ALLE"]);
  }
  return "\uFEFF" + lines.map((line) => line.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
