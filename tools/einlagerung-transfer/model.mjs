import { createHash } from "node:crypto";

export const FORMAT = "comet-einlagerung";
export const KINDS = ["hall", "aisle", "shelf", "article", "group", "carrier", "rule", "reservation"];
const TYPES = ["strategie", "artikel", "istbestand", "retouren", "auftraege"];
const REFS = {
  aisle: { hallId: ["hall", true] },
  shelf: { aisleId: ["aisle", true] },
  rule: { articleId: ["article", true], shelfId: ["shelf", true], groupId: ["group", false] },
  reservation: { shelfId: ["shelf", true], carrierId: ["carrier", false] },
};
const fail = (message) => { throw new Error(message); };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v) => Number.isSafeInteger(v) && v > 0;
const date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
export const digest = (payload) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export const envelope = (payload) => ({ format: FORMAT, version: 1, sha256: digest(payload), payload });

export function validate(pack) {
  if (!object(pack) || pack.format !== FORMAT || pack.version !== 1 || !object(pack.payload))
    fail("Keine unterstützte COMET-Einlagerungsdatei.");
  if (digest(pack.payload) !== pack.sha256) fail("Prüfsumme stimmt nicht. Datei wurde verändert oder beschädigt.");
  const p = pack.payload;
  if (!date(p.exportedAt)) fail("Exportzeit fehlt.");
  for (const key of ["records", "datasets", "events", "carriers"]) {
    if (!Array.isArray(p[key])) fail(`Ungültige Liste: ${key}`);
    const ids = new Set();
    for (const row of p[key]) {
      if (!object(row) || !id(row.id) || ids.has(row.id)) fail(`Ungültige/doppelte ID in ${key}.`);
      ids.add(row.id);
    }
  }
  const records = new Map(p.records.map((r) => [r.id, r]));
  const carriers = new Map(p.carriers.map((r) => [r.id, r]));
  for (const c of p.carriers)
    if (typeof c.name !== "string" || typeof c.kuerzel !== "string") fail("Ungültige Speditionskennung.");
  for (const r of p.records) {
    if (!KINDS.includes(r.kind) || !object(r.data) || !date(r.updated_at)) fail("Ungültiger Stammdatensatz.");
    for (const [key, [kind, required]] of Object.entries(REFS[r.kind] || {})) {
      const value = r.data[key];
      if (value == null && !required) continue;
      if (!id(value) || records.get(value)?.kind !== kind) fail(`Ungültige Referenz ${r.id}.${key}.`);
    }
    if (["carrier", "reservation"].includes(r.kind) && r.data.speditionId != null &&
      (!id(r.data.speditionId) || !carriers.has(r.data.speditionId)))
      fail(`Speditionsreferenz von Datensatz ${r.id} fehlt im Export.`);
  }
  for (const d of p.datasets) {
    // Earlier migrations retained original files as inert legacy:* snapshots.
    // Keep these archives without interpreting them as a current CSV import.
    if (!(TYPES.includes(d.type) || (typeof d.type === "string" && /^legacy:[a-z_]+$/.test(d.type))) ||
      typeof d.filename !== "string" || typeof d.imported_by !== "string" ||
      !Array.isArray(d.rows) || d.rows.some((r) => !object(r)) || d.row_count !== d.rows.length || !date(d.imported_at))
      fail(`Ungültiger CSV-Importstand ${d.id}.`);
  }
  for (const e of p.events)
    if (![e.username, e.action, e.detail].every((v) => typeof v === "string") || !date(e.created_at))
      fail("Ungültiger Verlaufseintrag.");
  if (p.settings !== null) {
    if (typeof p.settings !== "string") fail("Ungültige Einstellungen.");
    let settings;
    try { settings = JSON.parse(p.settings); } catch { fail("Einstellungen sind kein JSON."); }
    if (!object(settings)) fail("Einstellungen müssen ein Objekt sein.");
  }
  return p;
}

const normalize = (v) => String(v).normalize("NFKC").trim().toLowerCase();
export function mapCarriers(source, target, explicit = {}) {
  if (!object(explicit)) fail("Speditionszuordnung muss ein JSON-Objekt sein.");
  const result = new Map();
  for (const [key, value] of Object.entries(explicit)) {
    if (!source.some((s) => String(s.id) === key) || !id(value) || !target.some((t) => t.id === value))
      fail(`Ungültige manuelle Speditionszuordnung für ${key}.`);
  }
  for (const s of source) {
    if (Object.hasOwn(explicit, String(s.id))) { result.set(s.id, explicit[s.id]); continue; }
    let matches = s.kuerzel.trim() ? target.filter((t) => normalize(t.kuerzel) === normalize(s.kuerzel)) : [];
    if (matches.length === 0) matches = target.filter((t) => normalize(t.name) === normalize(s.name));
    if (matches.length !== 1)
      fail(`Spedition ${s.id} (${s.kuerzel}, ${s.name}) nicht eindeutig zuordenbar. Im Ziel anlegen oder --carrier-map verwenden.`);
    result.set(s.id, matches[0].id);
  }
  return result;
}

export function remapRecord(r, ids, carriers) {
  const data = structuredClone(r.data);
  for (const key of Object.keys(REFS[r.kind] || {})) {
    if (data[key] != null) {
      if (!ids.has(data[key])) fail(`Zielreferenz ${r.id}.${key} fehlt.`);
      data[key] = ids.get(data[key]);
    }
  }
  if (["carrier", "reservation"].includes(r.kind) && data.speditionId != null) {
    if (!carriers.has(data.speditionId)) fail("Zielspedition fehlt.");
    data.speditionId = carriers.get(data.speditionId);
  }
  return data;
}

export function summary(p) {
  return {
    exportzeit: p.exportedAt,
    stammdaten: Object.fromEntries(KINDS.map((k) => [k, p.records.filter((r) => r.kind === k).length])),
    importstaende: p.datasets.length,
    importzeilen: p.datasets.reduce((n, d) => n + d.rows.length, 0),
    verlauf: p.events.length,
    speditionszuordnungen: p.carriers.length,
    einstellungen: p.settings !== null,
  };
}
