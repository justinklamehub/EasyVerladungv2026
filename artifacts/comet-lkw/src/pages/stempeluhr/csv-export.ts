import type { ClockEntry } from "@workspace/api-client-react";

export const CLOCK_CSV_KEY = "stempeluhr_csv_export";
export const CSV_FIELDS = [
  ["firstName", "Vorname"], ["lastName", "Nachname"], ["provider", "Dienstleister"],
  ["activity", "Tätigkeit"], ["bookedStart", "Arbeitsbeginn"], ["bookedEnd", "Arbeitsende"],
  ["grossMinutes", "Gesamtarbeitszeit"], ["pauseMinutes", "Pausenzeit"], ["netMinutes", "Arbeitszeit"],
  ["date", "Datum"], ["cardNumber", "Kartennummer"],
  ["startedAt", "Kommen (erfasst/korrigiert)"], ["endedAt", "Gehen (erfasst/korrigiert)"],
  ["pauseOverride", "Pause manuell"], ["status", "Status"], ["source", "Quelle"],
  ["originalStartedAt", "Kommen (unverändertes Original)"], ["originalEndedAt", "Gehen (unverändertes Original)"],
  ["reason", "Grund"],
] as const;
export type CsvField = typeof CSV_FIELDS[number][0];
export interface CsvColumn { id: CsvField; header: string; enabled: boolean }
export interface ClockCsvConfig { version: 1; durationFormat: "hhmm" | "minutes"; columns: CsvColumn[] }

export function defaultClockCsvConfig(): ClockCsvConfig {
  return { version: 1, durationFormat: "hhmm", columns: CSV_FIELDS.map(([id, header], i) => ({ id, header, enabled: i < 9 || id === "reason" })) };
}

export function legacyClockCsvConfig(): ClockCsvConfig {
  const headers: Partial<Record<CsvField, string>> = {
    bookedStart: "Kommen (gebucht)", bookedEnd: "Gehen (gebucht)",
    grossMinutes: "Brutto min", pauseMinutes: "Pause min", netMinutes: "Netto min",
  };
  const order: CsvField[] = ["date", "cardNumber", "lastName", "firstName", "provider", "activity",
    "startedAt", "endedAt", "bookedStart", "bookedEnd", "grossMinutes", "pauseMinutes", "netMinutes",
    "pauseOverride", "status", "source", "originalStartedAt", "originalEndedAt", "reason"];
  return { version: 1, durationFormat: "minutes", columns: order.map((id) => ({
    id, header: headers[id] ?? CSV_FIELDS.find(([field]) => field === id)![1], enabled: true,
  })) };
}

export function validateClockCsvConfig(config: ClockCsvConfig): string | null {
  if (config.version !== 1 || !["hhmm", "minutes"].includes(config.durationFormat) ||
    config.columns.length !== CSV_FIELDS.length ||
    new Set(config.columns.map((c) => c.id)).size !== CSV_FIELDS.length ||
    config.columns.some((c) => !CSV_FIELDS.some(([id]) => id === c.id))) return "Ungültige CSV-Spaltenkonfiguration.";
  const enabled = config.columns.filter((c) => c.enabled);
  if (!enabled.length) return "Bitte mindestens eine Spalte auswählen.";
  if (config.columns.some((c) => c.header.length > 100 || /[\u0000-\u001f\u007f]/.test(c.header)) ||
    enabled.some((c) => !c.header.trim())) return "Ausgewählte Spalten brauchen eine Überschrift (maximal 100 Zeichen, ohne Zeilenumbrüche).";
  const headers = enabled.map((c) => c.header.trim().toLocaleLowerCase("de"));
  if (new Set(headers).size !== headers.length) return "Spaltenüberschriften dürfen nicht doppelt vorkommen.";
  return null;
}

export function parseClockCsvConfig(value: unknown): ClockCsvConfig {
  if (!value || typeof value !== "object") throw new Error("Gespeicherte CSV-Einstellungen sind ungültig.");
  const c = value as Record<string, unknown>;
  if (c.version !== 1 || (c.durationFormat !== "hhmm" && c.durationFormat !== "minutes") || !Array.isArray(c.columns) ||
    c.columns.some((column) => !column || typeof column !== "object" ||
      typeof column.id !== "string" || typeof column.header !== "string" || typeof column.enabled !== "boolean")) {
    throw new Error("Gespeicherte CSV-Einstellungen sind ungültig.");
  }
  const config = { ...c, columns: c.columns.map((column) => ({ ...column })) } as unknown as ClockCsvConfig;
  // Add the new column without resetting personal order, labels, or disabled fields.
  if (!config.columns.some((column) => column.id === "reason")) {
    const headers = new Set(config.columns.map((column) => column.header.trim().toLocaleLowerCase("de")));
    let header = "Grund", suffix = 1;
    while (headers.has(header.toLocaleLowerCase("de"))) header = `Grund (Eintrag ${suffix++})`;
    config.columns.push({ id: "reason", header, enabled: true });
  }
  const error = validateClockCsvConfig(config);
  if (error) throw new Error(error);
  return { version: 1, durationFormat: config.durationFormat, columns: config.columns.map((column) => ({ ...column, header: column.header.trim() })) };
}

const dateFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function timestamp(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}
function duration(value: number | null, format: ClockCsvConfig["durationFormat"]): string | number {
  if (value == null) return "";
  return format === "minutes" ? value : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function clockCsvRows(entries: ClockEntry[], config: ClockCsvConfig): unknown[][] {
  const error = validateClockCsvConfig(config);
  if (error) throw new Error(error);
  const columns = config.columns.filter((column) => column.enabled);
  const value = (entry: ClockEntry, id: CsvField): unknown => {
    switch (id) {
      case "date": return dateFormat.format(new Date(entry.bookedStart));
      case "bookedStart": case "bookedEnd": case "startedAt": case "endedAt":
      case "originalStartedAt": case "originalEndedAt": return timestamp(entry[id]);
      case "grossMinutes": case "pauseMinutes": case "netMinutes":
        return duration(entry.endedAt ? entry[id] : null, config.durationFormat);
      case "status": return entry.endedAt ? "abgeschlossen" : "offen";
      case "pauseOverride": return entry.pauseOverride ?? "";
      case "reason": return entry.reason ?? "";
      default: return entry[id];
    }
  };
  return [columns.map((column) => column.header.trim()),
    ...entries.map((entry) => columns.map((column) => value(entry, column.id)))];
}
