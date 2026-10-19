export const DEADLINE_COLUMNS = [
  ["status", "Status"], ["date", "Termin"], ["remaining", "Rest"], ["shelf", "Regal"],
  ["deliveryNumber", "Lieferungsnummer"], ["debitor", "Debitorennummer"], ["debitorName", "Debitorname"],
  ["spedition", "Spedition"], ["relation", "Relation"], ["plusKw", "Plus-KW"], ["paletten", "Paletten"],
] as const;

export type DeadlineColumnId = typeof DEADLINE_COLUMNS[number][0];
export interface DeadlineColumn { id: DeadlineColumnId; visible: boolean }
export interface DeadlineColumnConfig { version: 1; columns: DeadlineColumn[] }
export const DEADLINE_COLUMNS_KEY = "einlagerung_deadline_columns";

export function defaultDeadlineColumns(): DeadlineColumnConfig {
  return { version: 1, columns: DEADLINE_COLUMNS.map(([id]) => ({ id, visible: true })) };
}

export function parseDeadlineColumns(value: unknown): DeadlineColumnConfig {
  if (!value || typeof value !== "object") throw new Error("Ungültige Spalteneinstellungen.");
  const config = value as Partial<DeadlineColumnConfig>;
  if (config.version !== 1 || !Array.isArray(config.columns) ||
    config.columns.length !== DEADLINE_COLUMNS.length ||
    config.columns.some((c) => !c || typeof c.visible !== "boolean" || !DEADLINE_COLUMNS.some(([id]) => id === c.id)) ||
    new Set(config.columns.map((c) => c.id)).size !== DEADLINE_COLUMNS.length) {
    throw new Error("Ungültige Spalteneinstellungen.");
  }
  if (!config.columns.some((c) => c.visible)) throw new Error("Bitte mindestens eine Spalte einblenden.");
  return { version: 1, columns: config.columns.map((c) => ({ ...c })) };
}

export function moveDeadlineColumn(config: DeadlineColumnConfig, id: DeadlineColumnId, offset: -1 | 1): DeadlineColumnConfig {
  const columns = config.columns.map((c) => ({ ...c }));
  const index = columns.findIndex((c) => c.id === id);
  const target = index + offset;
  if (index >= 0 && target >= 0 && target < columns.length) {
    [columns[index], columns[target]] = [columns[target], columns[index]];
  }
  return { version: 1, columns };
}
