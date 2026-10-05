import { z } from "zod/v4";
import { checkData, dataset, event, getSettings, isShelfActive, records, snapshots, WarehouseError, type Client, type Data, type WarehouseRecord } from "./model";

export const fields: Record<string, string[]> = {
  strategie: ["artikelnummer", "regal", "kundengruppe", "prioritaet", "hinweis"],
  artikel: ["artikelnummer", "ean", "artikelname"],
  istbestand: ["typ", "lagerplatz", "material", "b", "dauer", "charge", "lagereinh", "bme", "verfueg_bestand"],
  retouren: ["debitor", "name", "parcours", "hu", "platz", "kartons"],
  auftraege: ["verkaufsbeleg", "lfdat", "plus_kw", "debitor", "kunde_name1", "plz", "beleg", "ern_ausl", "ret_klasse", "parkkennz", "handling_unit", "typ", "platz", "spediteur", "spediteur_name1", "relation", "q", "kartonanz"],
};
const required: Record<string, string[]> = {
  strategie: ["artikelnummer", "regal"], artikel: ["artikelnummer"],
  istbestand: ["lagerplatz", "material", "lagereinh"], retouren: ["platz", "hu"], auftraege: ["platz", "handling_unit"],
};
export const importSchema = z.object({
  type: z.enum(["strategie", "istbestand", "retouren", "auftraege", "artikel"]),
  csv: z.string().min(1).max(35_000_000),
  filename: z.string().min(1).max(255),
  mode: z.enum(["replace", "merge"]),
  mapping: z.record(z.string(), z.number().int().min(0).max(100)).optional(),
});
export type ImportInput = z.infer<typeof importSchema>;
const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const aliases: Record<string, string[]> = {
  artikelnummer: ["artikel", "material", "artikelnummer"], artikelname: ["bezeichnung", "artikelname"],
  prioritaet: ["prio", "priorität", "prioritaet"], hinweis: ["bemerkung", "hinweis"],
  lfdat: ["lfdat", "lieferdatum", "liefertermin"], plus_kw: ["+kw", "pluskw"],
  regal: ["regal", "lagerplatz", "platz"], lagereinheit: ["lagereinheit"],
  lagereinh: ["lagereinh", "lagereinheit", "le"], handling_unit: ["handlingunit", "hu"],
  lagerplatz: ["lagerplatz", "platz"], kundengruppe: ["kundengruppe", "kundengr"],
  verfueg_bestand: ["verfüg.bestand", "verfueg_bestand", "verfbestand", "verfügbarerbestand"],
  verkaufsbeleg: ["verkaufsbeleg", "verkaufsb"], kunde_name1: ["kundename1", "name1"],
  spediteur_name1: ["spediteurname1", "spediteurname", "speditionsname"],
  kartonanz: ["kartonanz", "kartonanzahl"], parcours: ["parcours", "parcoursname"],
};

// Handles quoted delimiters, escaped quotes, CRLF, BOM and multiline cells.
export function parseCsv(input: string) {
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((delimiter) => {
    let quoted = false, count = 0;
    for (let i = 0; i < first.length; i++) {
      if (first[i] === '"') { if (quoted && first[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted && first[i] === delimiter) count++;
    }
    return { delimiter, count };
  });
  const delimiter = counts.sort((a, b) => b.count - a.count)[0]!.delimiter;
  const rows: string[][] = [];
  let cell = "", row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      cell = ""; row = [];
    } else cell += char;
  }
  if (quoted) throw new WarehouseError("CSV enthält ein nicht geschlossenes Anführungszeichen.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function resolveMapping(type: string, headers: string[], explicit: Record<string, number> | undefined) {
  const result: Record<string, number> = {};
  const normalized = headers.map(norm);
  fields[type]!.forEach((field, legacyIndex) => {
    const candidates = (aliases[field] || [field]).map(norm);
    const index = normalized.findIndex((h) => candidates.includes(h));
    result[field] = explicit?.[field] ?? (index >= 0 ? index : legacyIndex);
  });
  if (type === "auftraege" && explicit?.spediteur_name1 == null) {
    const names = normalized.flatMap((h, i) => h === "name1" ? [i] : []);
    if (names.length > 1) result.spediteur_name1 = names[1]!;
  }
  return result;
}
function unitKey(type: string, row: Data) {
  return type === "istbestand" ? row.lagereinh : type === "retouren" ? row.hu : row.handling_unit;
}
export async function prepareImport(client: Client, input: ImportInput) {
  const csv = parseCsv(input.csv);
  const headers = csv.shift() || [];
  const errors: string[] = [], warnings: string[] = [];
  if (csv.length === 0) errors.push("Die Datei enthält keine Datenzeilen. Ein leerer Import ersetzt keine Daten.");
  if (csv.length > 100000) errors.push("Maximal 100.000 Datenzeilen pro Import.");
  const settings = await getSettings(client);
  const explicit = input.mapping ?? settings.profiles[input.type];
  if (explicit && Object.keys(explicit).some((f) => !fields[input.type]!.includes(f)))
    errors.push("Die Spaltenzuordnung enthält unbekannte Felder.");
  const mapping = resolveMapping(input.type, headers, explicit);
  for (const field of required[input.type]!) {
    if (mapping[field]! >= headers.length) errors.push(`Pflichtspalte ${field} fehlt.`);
  }
  const all = await records(client);
  const output: Record<string, string>[] = [];
  const seen = new Set<string>(), unitShelves = new Map<string, string>();
  let duplicates = 0, errorCount = errors.length;
  const fail = (message: string) => { errorCount++; if (errors.length < 50) errors.push(message); };
  for (const [index, cells] of csv.entries()) {
    if (index >= 100000) break;
    const row = Object.fromEntries(fields[input.type]!.map((f) => [f, cells[mapping[f]!] || ""]));
    let valid = true;
    for (const f of required[input.type]!) {
      if (!row[f]) { fail(`Zeile ${index + 2}: ${f} fehlt.`); valid = false; }
    }
    if (cells.length !== headers.length) {
      fail(`Zeile ${index + 2}: ${cells.length} Spalten statt ${headers.length}.`); valid = false;
    }
    if (Object.values(row).some((v) => v.length > 2000)) {
      fail(`Zeile ${index + 2}: Feld ist zu lang.`); valid = false;
    }
    const shelfName = row.regal || row.lagerplatz || row.platz;
    if (shelfName && !all.some((r) => r.kind === "shelf" && r.data.name === shelfName)) {
      fail(`Zeile ${index + 2}: unbekanntes Regal ${shelfName}.`); valid = false;
    }
    if (input.type === "strategie") {
      const shelf = all.find((r) => r.kind === "shelf" && r.data.name === row.regal);
      if (shelf && !isShelfActive(shelf, all)) {
        fail(`Zeile ${index + 2}: Regal oder zugehöriger Gang/Halle ist deaktiviert.`); valid = false;
      }
      if (!all.some((r) => r.kind === "article" && r.data.active && r.data.number === row.artikelnummer)) {
        fail(`Zeile ${index + 2}: unbekannter oder deaktivierter Artikel ${row.artikelnummer}; zuerst Artikel importieren/anlegen.`); valid = false;
      }
      if (row.kundengruppe && !all.some((r) => r.kind === "group" && r.data.active && r.data.name === row.kundengruppe)) {
        fail(`Zeile ${index + 2}: unbekannte oder deaktivierte Kundengruppe ${row.kundengruppe}.`); valid = false;
      }
      row.prioritaet ||= "1";
      if (!/^[1-9]\d{0,3}$/.test(row.prioritaet)) { fail(`Zeile ${index + 2}: ungültige Priorität.`); valid = false; }
      const match = output.find((r) => r.artikelnummer === row.artikelnummer && r.regal === row.regal);
      if (match && JSON.stringify(match) !== JSON.stringify(row)) {
        fail(`Zeile ${index + 2}: widersprüchliche Artikel-Regal-Zuordnung.`); valid = false;
      }
    }
    if (input.type === "artikel") {
      const match = output.find((r) => r.artikelnummer === row.artikelnummer);
      if (match && JSON.stringify(match) !== JSON.stringify(row)) {
        fail(`Zeile ${index + 2}: widersprüchliche Artikelnummer.`); valid = false;
      }
      const current = all.find((r) => r.kind === "article" && r.data.number === row.artikelnummer);
      try {
        checkData("article", { number: row.artikelnummer, ean: row.ean, name: row.artikelname, active: true },
          [...all, ...output.filter((r) => r.artikelnummer !== row.artikelnummer).map((r, i) => ({
            id: -i - 1, kind: "article", updatedAt: "", data: { number: r.artikelnummer, ean: r.ean },
          }))], current?.id);
      } catch (err) { fail(`Zeile ${index + 2}: ${(err as Error).message}`); valid = false; }
    }
    if (["istbestand", "retouren", "auftraege"].includes(input.type)) {
      const key = unitKey(input.type, row);
      if (key && unitShelves.has(key) && unitShelves.get(key) !== shelfName) {
        fail(`Zeile ${index + 2}: HU/Lagereinheit ${key} ist mehreren Regalen zugeordnet.`); valid = false;
      }
      unitShelves.set(key, shelfName);
    }
    for (const f of ["kartonanz", "verfueg_bestand", "kartons"]) {
      if (row[f] && !/^-?\d+(?:[.,]\d+)?$/.test(row[f]!)) {
        fail(`Zeile ${index + 2}: ${f} ist keine gültige Zahl.`); valid = false;
      }
    }
    const identity = JSON.stringify(row);
    if (seen.has(identity)) { duplicates++; continue; }
    seen.add(identity);
    if (valid) output.push(row);
  }
  if (duplicates) warnings.push(`${duplicates} identische Dubletten werden nur einmal übernommen.`);
  if (input.type === "auftraege") {
    const unknown = [...new Set(output.filter((r) => !all.some((c) => c.kind === "carrier" &&
      c.data.active && ((r.spediteur && c.data.number === r.spediteur) || c.data.name === r.spediteur_name1)))
      .map((r) => r.spediteur_name1 || r.spediteur).filter(Boolean))];
    if (unknown.length) warnings.push(`Speditionen ohne COMET-Zuordnung: ${unknown.slice(0, 10).join(", ")}. In Stammdaten zuordnen.`);
  }
  const replacing = input.mode === "replace" ? "Vorhandener Stand dieses Importtyps wird ersetzt." : "Neue HUs/Artikel/Zuordnungen werden ergänzt; vorhandene werden aktualisiert.";
  warnings.push(replacing);
  return { preview: { valid: errorCount === 0, rowCount: output.length, headers,
    sample: output.slice(0, 10), errors, warnings }, rows: output, all };
}

async function upsert(client: Client, kind: string, data: Data, existing: WarehouseRecord | undefined) {
  if (existing) {
    await client.query("UPDATE einlagerung_records SET data=$1, updated_at=clock_timestamp() WHERE id=$2", [JSON.stringify(data), existing.id]);
  } else {
    await client.query("INSERT INTO einlagerung_records (kind,data) VALUES ($1,$2)", [kind, JSON.stringify(data)]);
  }
}
export async function commitImport(client: Client, input: ImportInput, username: string) {
  const prepared = await prepareImport(client, input);
  if (!prepared.preview.valid) throw new WarehouseError(prepared.preview.errors.join("\n"));
  const { rows, all } = prepared;
  if (input.type === "strategie") {
    if (input.mode === "replace") {
      await client.query("UPDATE einlagerung_records SET data=jsonb_set(data,'{active}','false'),updated_at=clock_timestamp() WHERE kind='rule'");
    }
    for (const row of rows) {
      const article = all.find((r) => r.kind === "article" && r.data.number === row.artikelnummer)!;
      const shelf = all.find((r) => r.kind === "shelf" && r.data.name === row.regal)!;
      const group = all.find((r) => r.kind === "group" && r.data.name === row.kundengruppe);
      const existing = all.find((r) => r.kind === "rule" && r.data.articleId === article.id && r.data.shelfId === shelf.id);
      const data = checkData("rule", { articleId: article.id, shelfId: shelf.id, groupId: group?.id ?? null,
        priority: Number(row.prioritaet), note: row.hinweis, active: true }, all, existing?.id);
      await upsert(client, "rule", data, existing);
    }
  } else if (input.type === "artikel") {
    if (input.mode === "replace")
      await client.query("UPDATE einlagerung_records SET data=jsonb_set(data,'{active}','false'),updated_at=clock_timestamp() WHERE kind='article'");
    for (const row of rows) {
      const existing = all.find((r) => r.kind === "article" && r.data.number === row.artikelnummer);
      await upsert(client, "article", { number: row.artikelnummer, ean: row.ean, name: row.artikelname, active: true }, existing);
    }
  }
  let dataRows = rows;
  if (input.mode === "merge" && ["istbestand", "retouren", "auftraege"].includes(input.type)) {
    const latest = (await snapshots(client)).find((s) => s.type === input.type);
    const incomingUnits = new Set(rows.map((r) => unitKey(input.type, r)));
    dataRows = [...(latest?.rows || []).filter((r: Data) => !incomingUnits.has(unitKey(input.type, r))), ...rows];
  }
  const result = await client.query(
    "INSERT INTO einlagerung_datasets (type,filename,rows,row_count,imported_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [input.type, input.filename.split(/[\\/]/).pop(), JSON.stringify(dataRows), dataRows.length, username]);
  await event(client, username, "CSV-Import", `${input.type}: ${rows.length} geprüfte Zeilen, ${input.mode === "replace" ? "ersetzen" : "ergänzen"} (${input.filename})`);
  return dataset(result.rows[0]);
}
