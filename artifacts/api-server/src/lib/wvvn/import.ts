import { createHash } from "node:crypto";
import type { PoolClient } from "@workspace/db";
import { parseLegacySql } from "../../../../../lib/db/scripts/legacy-sql-parser.mjs";
import { audit, iso, quantityPieces, WvvnError, type Row } from "./model";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const code = (v: unknown) => v == null ? "" : String(v).trim();
const timestamp = (v: unknown) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 4102444800) throw new WvvnError("Ungültiger Altzeitstempel.");
  return iso(n * 1000);
};
function uniqueIds(rows: Row[], table: string) {
  if (rows.some((r) => !Number.isSafeInteger(r.id) || r.id <= 0) || new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new WvvnError(`Ungültige oder doppelte IDs in ${table}.`);
}
export function parseWvvnSql(sql: string) {
  if (Buffer.byteLength(sql) > 20_000_000) throw new WvvnError("SQL-Datei ist zu groß (maximal 20 MB).");
  // This parser reads literal INSERT VALUES only; no SQL from the file is executed.
  const tables = parseLegacySql(sql, new Set(["artikeldaten", "mde_sessions", "mde_session_items", "mde_daily_reports"])) as Record<string, Row[]>;
  const articles = tables.artikeldaten ?? [], sessions = tables.mde_sessions ?? [], items = tables.mde_session_items ?? [], reports = tables.mde_daily_reports ?? [];
  if (!articles.length && !sessions.length) throw new WvvnError("Keine unterstützten WVVN-Daten gefunden.");
  for (const [key, rows] of Object.entries(tables)) uniqueIds(rows, key);
  const sessionIds = new Set(sessions.map((s) => s.id));
  for (const a of articles) {
    if (!code(a.artikelnummer) || code(a.artikelnummer).length > 150 || code(a.artikelname).length > 255 ||
      code(a.ean).length > 100 || code(a.veean).length > 100) throw new WvvnError("Ungültige Artikelstammdaten.");
    quantityPieces(1, Number(a.ve), "VE");
  }
  if (new Set(articles.map((a) => code(a.artikelnummer))).size !== articles.length) throw new WvvnError("Doppelte Artikelnummern im Import.");
  for (const s of sessions) {
    if (!["WERKSVERKAUF", "VERNICHTUNG"].includes(s.mode) || !["open", "done"].includes(s.status) ||
      ![0, 1].includes(Number(s.kunde_netto)) || ![0, 1].includes(Number(s.kware))) throw new WvvnError("Ungültige alte Liste.");
    timestamp(s.created_at);
    if (s.status === "done") {
      timestamp(s.finished_at);
      if (Number(s.finished_at) < Number(s.created_at)) throw new WvvnError("Alte Liste endet vor ihrem Beginn.");
    }
  }
  for (const i of items) {
    if (!sessionIds.has(i.session_id)) throw new WvvnError("Position ohne zugehörige Altliste.");
    if (!["STK", "VE"].includes(i.einheit) || !code(i.artikelnummer) || code(i.artikelnummer).length > 150 ||
      code(i.scanned_code).length > 150 || code(i.artikelname).length > 255) throw new WvvnError("Ungültige alte Position.");
    const pieces = quantityPieces(Number(i.qty_input), Number(i.ve_faktor), i.einheit);
    if (Math.abs(pieces - Number(i.qty_stk)) > 0.0001) throw new WvvnError("Stückmenge der Altdaten passt nicht zur Mengenumrechnung.");
    timestamp(i.created_at);
  }
  for (const r of reports) {
    if (!["WERKSVERKAUF", "VERNICHTUNG"].includes(r.mode) || !/^\d{4}-\d{2}-\d{2}$/.test(code(r.report_date)) ||
      !Number.isSafeInteger(r.running_no) || r.running_no < 1) throw new WvvnError("Ungültiger historischer Bericht.");
    timestamp(r.sent_at);
  }
  return { articles, sessions, items, reports };
}

export async function prepareImport(c: PoolClient, sql: string) {
  const data = parseWvvnSql(sql), fileHash = digest(sql);
  const existing = (await c.query("SELECT * FROM einlagerung_records WHERE kind='article' ORDER BY id")).rows;
  const known = !!(await c.query("SELECT 1 FROM wvvn_imports WHERE digest=$1", [fileHash])).rowCount;
  const conflicts: string[] = [], warnings: string[] = [];
  const sourceCodes = new Map<string, Set<string>>();
  for (const a of data.articles) for (const value of [a.artikelnummer, a.ean, a.veean].map(code).filter(Boolean)) {
    const set = sourceCodes.get(value) ?? new Set<string>();
    set.add(code(a.artikelnummer)); sourceCodes.set(value, set);
  }
  const ambiguous = new Set([...sourceCodes].filter(([, owners]) => owners.size > 1).map(([value]) => value));
  if (ambiguous.size) warnings.push(`${ambiguous.size} EAN-/VE-Codes sind in den Altdaten mehrdeutig. Sie werden nicht als Scan-Codes aktiviert; Originalwerte bleiben am Artikel hinterlegt. Artikelnummern bleiben nutzbar.`);
  const merged: { existing?: Row; data: Row }[] = [];
  let retained = 0;
  const occupied = new Map<string, string>();
  for (const a of existing) for (const value of [a.data.number, a.data.ean, a.data.veEan].map(code).filter(Boolean)) occupied.set(value, code(a.data.number));
  // Reserve article numbers before considering EANs.
  for (const a of data.articles) {
    const number = code(a.artikelnummer);
    if (occupied.has(number) && occupied.get(number) !== number) conflicts.push(`Artikelnummer ${number} ist bereits Scan-Code eines anderen Artikels.`);
    occupied.set(number, number);
  }
  for (const a of data.articles) {
    const number = code(a.artikelnummer), old = existing.find((r) => code(r.data.number) === number);
    const d: Row = { number, name: code(a.artikelname), ean: "", veEan: "", veFactor: Number(a.ve), active: true, ...old?.data,
      wvvnLegacy: { number, name: code(a.artikelname), ean: code(a.ean), veEan: code(a.veean), veFactor: Number(a.ve) } };
    for (const [key, value] of [["ean", code(a.ean)], ["veEan", code(a.veean)]] as const) {
      if (!value) continue;
      if (d[key]) { if (d[key] !== value) retained++; continue; }
      if (ambiguous.has(value) || (occupied.has(value) && occupied.get(value) !== number) ||
        (key === "veEan" && [number, d.ean].includes(value))) { retained++; continue; }
      d[key] = value; occupied.set(value, number);
    }
    if (!d.name) d.name = code(a.artikelname);
    if (old?.data.veFactor != null && Number(old.data.veFactor) !== Number(a.ve)) retained++;
    merged.push({ existing: old, data: d });
  }
  if (retained) warnings.push(`${retained} abweichende oder mehrdeutige Code-/Verpackungswerte bleiben unverändert bzw. werden nicht aktiviert. Die Quellwerte bleiben als wvvnLegacy am gemeinsamen Artikel erhalten.`);
  if (data.sessions.some((s) => s.status === "open")) warnings.push("Historische offene Listen bleiben im Archiv offen und werden nicht mit neuen Scannerlisten vermischt.");
  const inconsistentOpen = data.sessions.filter((s) => s.status === "open" && s.finished_at != null).length;
  if (inconsistentOpen) warnings.push(`${inconsistentOpen} offene Altliste(n) enthalten trotzdem einen alten Abschlusszeitpunkt. Der Status bleibt offen; der widersprüchliche Originalwert wird separat unverändert archiviert.`);
  warnings.push("Historische Listen werden nicht automatisch erneut per E-Mail versendet. Bereits versendete Altberichte enthalten im Export keine gespeicherten CSV-Dateien.");
  if (!known) {
    const overlap = await c.query(`SELECT
      (SELECT count(*) FROM wvvn_sessions WHERE legacy_id IS NOT NULL) +
      (SELECT count(*) FROM wvvn_items WHERE legacy_id IS NOT NULL) AS count`);
    if (Number(overlap.rows[0].count)) conflicts.push("Es wurden bereits andere WVVN-Altdaten importiert. Abweichenden Export nicht ungeprüft darüber importieren.");
    const duplicateRows: Row[] = data.reports.length ? (await c.query("SELECT mode,running_no FROM wvvn_reports WHERE legacy_id IS NULL")).rows : [];
    if (duplicateRows.some((r) => data.reports.some((p) => p.mode === r.mode && p.running_no === r.running_no))) conflicts.push("Laufnummer eines Altberichts wird bereits von einem neuen Bericht verwendet.");
  }
  const previewHash = digest(fileHash + JSON.stringify(existing.map((r) => [r.id, r.updated_at, r.data])));
  return { data, merged, fileHash, preview: { articles: data.articles.length, sessions: data.sessions.length,
    items: data.items.length, reports: data.reports.length, openSessions: data.sessions.filter((s) => s.status === "open").length,
    conflicts: [...new Set(conflicts)], warnings, alreadyImported: known, previewHash } };
}

export async function commitImport(c: PoolClient, sql: string, expected: string | undefined, actor: string) {
  await c.query("SELECT pg_advisory_xact_lock(736291)"); // Same lock as shared warehouse master-data writes.
  const p = await prepareImport(c, sql);
  if (p.preview.alreadyImported) return p.preview;
  if (!expected || expected !== p.preview.previewHash) throw new WvvnError("Vorschau ist nicht mehr aktuell. Bitte erneut prüfen.", 409);
  if (p.preview.conflicts.length) throw new WvvnError(p.preview.conflicts.join("\n"), 409);
  for (const a of p.merged) {
    if (a.existing) await c.query("UPDATE einlagerung_records SET data=$1,updated_at=clock_timestamp() WHERE id=$2", [JSON.stringify(a.data), a.existing.id]);
    else await c.query("INSERT INTO einlagerung_records(kind,data) VALUES('article',$1)", [JSON.stringify(a.data)]);
  }
  // Bulk JSON-recordset inserts keep the 45k-position import transactional without 45k round-trips.
  await c.query(`INSERT INTO wvvn_reports(mode,report_date,running_no,status,sent_at,legacy_id)
    SELECT mode,report_date,running_no,'sent',to_timestamp(sent_at),id FROM jsonb_to_recordset($1::jsonb)
    AS r(id integer,mode text,report_date text,running_no integer,sent_at bigint)`, [JSON.stringify(p.data.reports)]);
  await c.query(`INSERT INTO wvvn_sessions(owner_key,actor,mode,netto,kware,status,created_at,finished_at,legacy_id,legacy_data)
    SELECT 'legacy:'||id,'Altimport',mode,kunde_netto=1,kware=1,status,to_timestamp(created_at),
      CASE WHEN status='done' THEN to_timestamp(finished_at) ELSE NULL END,id,to_jsonb(s)
    FROM jsonb_to_recordset($1::jsonb) AS s(id integer,mode text,kunde_netto integer,kware integer,status text,created_at bigint,finished_at bigint,created_by text)`,
    [JSON.stringify(p.data.sessions)]);
  for (let offset = 0; offset < p.data.items.length; offset += 3000) {
    const data = p.data.items.slice(offset, offset + 3000).map((i) => ({
      ...i, artikelnummer: code(i.artikelnummer), artikelname: code(i.artikelname), scanned_code: code(i.scanned_code),
    }));
    await c.query(`INSERT INTO wvvn_items(session_id,article_number,article_name,scanned_code,unit,quantity,ve_factor,pieces,created_at,legacy_id)
      SELECT s.id,i.artikelnummer,i.artikelname,i.scanned_code,i.einheit,i.qty_input,i.ve_faktor,i.qty_stk,to_timestamp(i.created_at),i.id
      FROM jsonb_to_recordset($1::jsonb) AS i(id integer,session_id integer,artikelnummer text,artikelname text,scanned_code text,
        einheit text,qty_input numeric,ve_faktor numeric,qty_stk numeric,created_at bigint)
      JOIN wvvn_sessions s ON s.legacy_id=i.session_id`, [JSON.stringify(data)]);
  }
  await c.query("INSERT INTO wvvn_imports(digest,actor) VALUES($1,$2)", [p.fileHash, actor]);
  await audit(c, actor, "Altdaten importiert", `${p.preview.articles} Artikel, ${p.preview.sessions} Listen, ${p.preview.items} Positionen, ${p.preview.reports} Altberichte.`);
  return p.preview;
}
