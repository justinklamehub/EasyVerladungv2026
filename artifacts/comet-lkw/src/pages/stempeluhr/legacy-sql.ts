import type { ClockImportInput } from "@workspace/api-client-react";

type SqlRow = Record<string, string | null>;

/** Read values only. No SQL from the file is ever sent to, or executed on, a database. */
function statements(input: string): string[] {
  const result: string[] = [];
  let current = "", quote = "", lineComment = false, blockComment = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i], next = input[i + 1];
    if (lineComment) { if (c === "\n") { lineComment = false; current += " "; } continue; }
    if (blockComment) { if (c === "*" && next === "/") { blockComment = false; i++; current += " "; } continue; }
    if (quote) {
      current += c;
      if (c === "\\" && quote !== "`" && next !== undefined) { current += next; i++; }
      else if (c === quote) {
        if (next === quote) { current += next; i++; } else quote = "";
      }
      continue;
    }
    if (c === "#" || (c === "-" && next === "-" && /\s/.test(input[i + 2] ?? ""))) {
      lineComment = true; if (c === "-") i++; continue;
    }
    if (c === "/" && next === "*") { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; current += c; continue; }
    if (c === ";") { if (current.trim()) result.push(current.trim()); current = ""; }
    else current += c;
  }
  if (quote || blockComment) throw new Error("SQL-Datei ist unvollständig: Zeichenkette oder Kommentar nicht geschlossen.");
  if (current.trim()) result.push(current.trim());
  return result;
}

function rowsFromInsert(statement: string): { table: string; rows: SqlRow[] } | null {
  const header = /^INSERT\s+INTO\s+`?(anwesenheit|mitarbeiter)`?\s*\(([^)]+)\)\s*VALUES\s*/i.exec(statement);
  if (!header) {
    if (/^INSERT\b[\s\S]*?\b(?:anwesenheit|mitarbeiter)\b/i.test(statement))
      throw new Error("Nicht unterstütztes INSERT-Format. Erwartet werden benannte Spalten und VALUES.");
    return null;
  }
  const columns = header[2].split(",").map((c) => c.trim().replace(/^`|`$/g, "").toLowerCase());
  if (new Set(columns).size !== columns.length || columns.some((c) => !/^[a-z_]+$/.test(c)))
    throw new Error("SQL-Datei enthält ungültige oder doppelte Spaltennamen.");
  const rows: SqlRow[] = [], values = statement.slice(header[0].length);
  let position = 0;
  const whitespace = () => { while (/\s/.test(values[position] ?? "") && position < values.length) position++; };
  const literal = (): string | null => {
    whitespace();
    const quote = values[position];
    if (quote === "'" || quote === '"') {
      position++; let value = "";
      while (position < values.length) {
        const c = values[position++];
        if (c === quote) {
          if (values[position] === quote) { value += quote; position++; continue; }
          return value;
        }
        if (c === "\\") {
          if (position === values.length) break;
          const next = values[position++];
          const escapes: Record<string, string> = { "0": "\0", n: "\n", r: "\r", t: "\t", b: "\b", Z: "\x1a" };
          value += escapes[next] ?? next;
        } else value += c;
      }
      throw new Error("Nicht geschlossene Zeichenkette im SQL-INSERT.");
    }
    const begin = position;
    while (position < values.length && values[position] !== "," && values[position] !== ")") position++;
    const token = values.slice(begin, position).trim();
    if (/^NULL$/i.test(token)) return null;
    if (/^[+-]?\d+(?:\.\d+)?$/.test(token)) return token;
    throw new Error("SQL-INSERT enthält einen Ausdruck statt eines einfachen Datenwerts.");
  };
  while (position < values.length) {
    whitespace(); if (values[position++] !== "(") throw new Error("Ungültiger Datensatz im SQL-INSERT.");
    const fields: (string | null)[] = [];
    for (;;) {
      fields.push(literal()); whitespace();
      const separator = values[position++];
      if (separator === ")") break;
      if (separator !== ",") throw new Error("Ungültiger Feldtrenner im SQL-INSERT.");
    }
    if (fields.length !== columns.length) throw new Error("SQL-INSERT: Anzahl der Werte stimmt nicht mit den Spalten überein.");
    rows.push(Object.fromEntries(columns.map((column, i) => [column, fields[i]])));
    whitespace();
    if (position === values.length) break;
    if (values[position++] !== ",") throw new Error("Zusätzlicher SQL-Inhalt nach Datensatz nicht unterstützt.");
    whitespace();
    if (position === values.length) throw new Error("Unvollständiges SQL-INSERT.");
  }
  return { table: header[1].toLowerCase(), rows };
}

export function readLegacySqlTables(text: string) {
  if (text.length > 40 * 1024 * 1024) throw new Error("SQL-Datei ist größer als 40 MB. Bitte in Teilmengen exportieren.");
  const tables: Record<"mitarbeiter" | "anwesenheit", SqlRow[]> = { mitarbeiter: [], anwesenheit: [] };
  for (const statement of statements(text.replace(/^\uFEFF/, ""))) {
    const insert = rowsFromInsert(statement);
    if (insert) tables[insert.table as keyof typeof tables].push(...insert.rows);
  }
  return tables;
}

export function parseLegacySql(text: string, legacyTimesAcknowledged = false, recoverArchivedEmployees = false): ClockImportInput {
  const tables = readLegacySqlTables(text);
  const employees: ClockImportInput["employees"] = [], entries: ClockImportInput["entries"] = [];
  const unixTime = (value: string | null | undefined, optional: boolean, label: string): string | null => {
    if (optional && (value == null || value.trim() === "" || value.trim() === "0")) return null;
    if (value == null || !/^\d+$/.test(value.trim()) || Number(value) <= 0) throw new Error(`${label}: ungültiger Unix-Zeitstempel.`);
    const date = new Date(Number(value) * 1000);
    if (!Number.isFinite(date.getTime())) throw new Error(`${label}: Zeitstempel außerhalb des gültigen Bereichs.`);
    return date.toISOString();
  };
  for (const table of ["mitarbeiter", "anwesenheit"] as const) {
    for (const row of tables[table]) {
      if (table === "mitarbeiter") {
        const required = ["mitarbeiterid", "vorname", "nachname"];
        if (required.some((column) => !row[column]?.trim()))
          throw new Error(`Mitarbeiter ${employees.length + 1}: ID, Vor- oder Nachname fehlt.`);
        employees.push({ cardNumber: row.mitarbeiterid!.trim(), firstName: row.vorname!.trim(), lastName: row.nachname!.trim(),
          provider: row.dienstleister?.trim() ?? "", activity: row.tatigkeit?.trim() ?? "", active: true });
      } else {
        const label = `Alt-Eintrag ${row.id ?? entries.length + 1}`;
        if (!row.id?.trim() || !row.mitarbeiterid?.trim()) throw new Error(`${label}: ID oder Mitarbeiter-ID fehlt.`);
        entries.push({ legacyId: row.id.trim(), cardNumber: row.mitarbeiterid.trim(),
          startedAt: unixTime(row.time_begin, false, label)!,
          endedAt: unixTime(row.time_end, true, label) });
      }
    }
  }
  if (recoverArchivedEmployees) {
    const known = new Set(employees.map((e) => e.cardNumber));
    const archived = new Map<string, { firstName: string; lastName: string }>();
    for (const row of tables.anwesenheit) {
      const card = row.mitarbeiterid?.trim();
      if (!card || known.has(card)) continue;
      const name = { firstName: row.vorname?.trim() ?? "", lastName: row.nachname?.trim() ?? "" };
      if (!name.firstName || !name.lastName) throw new Error("Ein historischer Mitarbeiter ohne Stammdatensatz hat keinen vollständigen Namen. Bitte zuerst klären.");
      const previous = archived.get(card);
      if (previous && (previous.firstName !== name.firstName || previous.lastName !== name.lastName))
        throw new Error("Eine historische Kartennummer ist mehreren Namen zugeordnet. Bitte zuerst klären; es wird kein Mitarbeiter geraten.");
      archived.set(card, name);
    }
    for (const [cardNumber, name] of archived) {
      employees.push({ cardNumber, ...name, provider: "", activity: "", active: false });
    }
  }
  if (!employees.length && !entries.length) throw new Error("Keine INSERT-Daten für mitarbeiter oder anwesenheit gefunden.");
  if (employees.length > 10000 || entries.length > 50000) throw new Error("Zu viele Datensätze. Bitte in Teilmengen exportieren.");
  return { employees, entries, legacyTimesAcknowledged };
}
