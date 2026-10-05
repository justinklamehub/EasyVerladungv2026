// One-time DEVELOPMENT import. Never executes SQL from the supplied dump.
// Only storage configuration is copied; stock, users and old full reports are not.
import { readFile } from "node:fs/promises";
import pg from "pg";

const source = process.argv[2];
if (!source) throw new Error("Usage: node lib/db/scripts/import-einlagerung-legacy.mjs path/to/dump.sql [--dry-run]");
if (process.env.NODE_ENV === "production") throw new Error("Dieser Import ist nur für die Entwicklung erlaubt.");
const sql = await readFile(source, "utf8");
const allowed = new Set(["artikel", "lager_gaenge", "lager_regale", "kundengruppen", "einlagerung_zuordnung", "speditionsfarben"]);
const tables = {};
const insert = /INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\s*/g;
function tuples(text, start) {
  let index = start, rows = [], row = [], value = "", quoted = false, inRow = false, wasString = false;
  const finish = () => {
    const trimmed = value.trim();
    row.push(wasString ? value : trimmed === "NULL" ? null : Number(trimmed));
    value = ""; wasString = false;
  };
  for (; index < text.length; index++) {
    const c = text[index];
    if (quoted) {
      if (c === "\\") {
        const next = text[++index];
        value += ({ n: "\n", r: "\r", t: "\t", "0": "\0" })[next] ?? next;
      } else if (c === "'" && text[index + 1] === "'") { value += "'"; index++; }
      else if (c === "'") quoted = false;
      else value += c;
    } else if (c === "'") { quoted = true; wasString = true; value = ""; }
    else if (c === "(") { inRow = true; row = []; value = ""; }
    else if (c === ")" && inRow) { finish(); rows.push(row); inRow = false; }
    else if (c === "," && inRow) finish();
    else if (c === ";" && !inRow) return rows;
    else if (inRow && (wasString ? !/\s/.test(c) : true)) value += c;
  }
  throw new Error("Unvollständiges INSERT im SQL-Dump.");
}
for (const match of sql.matchAll(insert)) {
  if (!allowed.has(match[1])) continue;
  const cols = [...match[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const rows = tuples(sql, match.index + match[0].length);
  tables[match[1]] ??= [];
  for (const row of rows) {
    if (row.length !== cols.length || row.some((v) => typeof v === "number" && !Number.isFinite(v)))
      throw new Error(`Ungültige Werte in ${match[1]}.`);
    tables[match[1]].push(Object.fromEntries(cols.map((key, i) => [key, row[i]])));
  }
}
console.log("Konfiguration im Dump:", Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.length])));
if (process.argv.includes("--dry-run")) process.exit(0);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const ids = new Map();
let copied = 0, skippedCarriers = 0;
const key = (kind, id) => `${kind}:${id}`;
async function add(kind, oldId, data) {
  const result = await client.query("INSERT INTO einlagerung_records (kind,data) VALUES ($1,$2) RETURNING id", [kind, JSON.stringify(data)]);
  ids.set(key(kind, oldId), result.rows[0].id);
  copied++;
  return result.rows[0].id;
}
const lookup = (kind, id) => {
  const value = ids.get(key(kind, id));
  if (!value) throw new Error(`Fehlende Referenz: ${kind} ${id}`);
  return value;
};
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(736291)");
  if (Number((await client.query("SELECT count(*) FROM einlagerung_records")).rows[0].count) !== 0)
    throw new Error("Lagerkonfiguration existiert bereits. Keine erneute Übernahme.");
  // The legacy grid defined hall membership by blocks of six aisles.
  // These are imported initial master data, not a runtime layout constraint.
  for (let h = 1; h <= 3; h++) await add("hall", h, { name: `Halle ${h}`, sort: h, active: true });
  for (const row of tables.lager_gaenge || []) {
    const hall = Math.ceil(Number(row.gang_nr) / 6);
    await add("aisle", row.id, { name: row.gang_nr, hallId: lookup("hall", hall), sort: Number(row.gang_nr), active: !!row.aktiv });
  }
  for (const row of tables.lager_regale || []) {
    await add("shelf", row.id, { name: row.regal_nr, aisleId: lookup("aisle", row.gang_id),
      position: Number(row.regal_nr.split("-").pop()), sort: row.sortierung, active: !!row.aktiv,
      full: false, fullAt: null, fullNote: "" });
  }
  for (const row of tables.artikel || []) await add("article", row.id, { number: row.artikelnummer, ean: row.ean || "", name: row.artikelname || "", active: !!row.aktiv });
  for (const row of tables.kundengruppen || []) {
    if (row.farbe && !/^#[0-9a-fA-F]{6}$/.test(row.farbe)) throw new Error("Ungültige Kundengruppenfarbe im Dump.");
    await add("group", row.id, { name: row.name, color: row.farbe || "#64748b", active: true });
  }
  const seenRules = new Set();
  for (const row of tables.einlagerung_zuordnung || []) {
    if (!row.aktiv) continue;
    const identity = `${row.artikel_id}:${row.regal_id}`;
    if (seenRules.has(identity)) throw new Error("Doppelte aktive Artikel-Regal-Zuordnung im Dump.");
    seenRules.add(identity);
    await add("rule", row.id, { articleId: lookup("article", row.artikel_id), shelfId: lookup("shelf", row.regal_id),
      groupId: row.kundengruppe_id ? lookup("group", row.kundengruppe_id) : null,
      priority: row.prioritaet, note: row.hinweis || "", active: true });
  }
  const normalize = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
  const speditionen = (await client.query("SELECT id,name FROM speditionen")).rows;
  for (const row of tables.speditionsfarben || []) {
    const match = speditionen.filter((s) => normalize(s.name) === normalize(row.spediteur_name1));
    if (match.length !== 1) { skippedCarriers++; continue; }
    if (!/^#[0-9a-fA-F]{6}$/.test(row.farbe) || !/^#[0-9a-fA-F]{6}$/.test(row.textfarbe))
      throw new Error("Ungültige Speditionsfarbe im Dump.");
    await add("carrier", row.id, { name: row.spediteur_name1, number: "", speditionId: match[0].id,
      color: row.farbe, textColor: row.textfarbe, active: !!row.aktiv });
  }
  await client.query("INSERT INTO einlagerung_events (action,username,detail) VALUES ($1,$2,$3)",
    ["Altbestand übernommen", "System", `${copied} Stammdaten und aktive Strategiezuordnungen übernommen. Bestände, Vormerkungen und alte Vollmeldungen bewusst nicht aktiviert. ${skippedCarriers} Speditionsfarben ohne eindeutige Zuordnung nicht übernommen.`]);
  await client.query("COMMIT");
  console.log(`Übernommen: ${copied} Konfigurationsdatensätze. Nicht eindeutig zugeordnete Speditionsfarben: ${skippedCarriers}.`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally { client.release(); await pool.end(); }
