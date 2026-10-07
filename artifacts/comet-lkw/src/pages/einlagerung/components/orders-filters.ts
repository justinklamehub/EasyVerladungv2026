export const TEXT_FILTER_PREFIX = "__text__:";
export const ORDER_FILTER_KEYS = ["spedition", "relation", "termin", "shelf"] as const;
export type OrderFilterKey = typeof ORDER_FILTER_KEYS[number];
export type OrderFilters = Record<OrderFilterKey, string[]>;
export type OrderRow = Record<string, unknown>;
export interface FilterRow {
  spedition: string;
  relation: string;
  termin: string;
  shelf: string;
  calendarWeek?: string;
  plusKw?: string;
}
export const emptyOrderFilters = (): OrderFilters => ({ spedition: [], relation: [], termin: [], shelf: [] });
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLocaleLowerCase("de");

export function orderFilterRow(row: OrderRow): FilterRow {
  return {
    spedition: text(row.spedition), relation: text(row.relation), termin: text(row.termin),
    shelf: text(row.shelf), calendarWeek: text(row.calendarWeek), plusKw: text(row.plusKw),
  };
}

function isoWeek(value: string): string {
  const week = value.match(/^(?:KW\s*)?(\d{1,2})[./-](\d{4})$/i);
  if (week) {
    const n = Number(week[1]);
    const last = Number(isoWeek(`${week[2]}-12-28`).split(".")[0]);
    return n >= 1 && n <= last ? `${n}.${week[2]}` : "";
  }
  const de = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!de && !iso) return "";
  const y = Number(de?.[3] ?? iso?.[1]), m = Number(de?.[2] ?? iso?.[2]), d = Number(de?.[1] ?? iso?.[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  return `${Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)}.${year}`;
}

function dateKey(value: string) {
  const de = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return de ? `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}` : value;
}

export function matchesOrderFilters(row: FilterRow, filters: OrderFilters, omit?: OrderFilterKey): boolean {
  return ORDER_FILTER_KEYS.every((key) => key === omit || !filters[key].length || filters[key].some((selected) => {
    const custom = selected.startsWith(TEXT_FILTER_PREFIX);
    const value = custom ? selected.slice(TEXT_FILTER_PREFIX.length) : selected;
    if (key === "termin") {
      if (/^(?:KW\s*)?\d{1,2}[./-]\d{4}$/i.test(value)) {
        const week = isoWeek(value);
        return !!week && isoWeek(row.termin) === week;
      }
      return dateKey(row.termin) === dateKey(value) ||
        (custom && norm(`${row.termin} + ${row.plusKw ?? ""}`).includes(norm(value)));
    }
    return custom ? norm(row[key]).includes(norm(value)) : norm(row[key]) === norm(value);
  }));
}

export function orderFacetOptions(rows: FilterRow[], filters: OrderFilters, key: OrderFilterKey) {
  const counts = new Map<string, { value: string; label: string; count: number }>();
  for (const row of rows) {
    if (!matchesOrderFilters(row, filters, key)) continue;
    const values = [row[key]];
    if (key === "termin") {
      const week = isoWeek(row.termin);
      if (week) values.push(`KW ${week}`);
    }
    for (const value of new Set(values.filter(Boolean))) {
      const normalized = norm(value);
      const entry = counts.get(normalized) ?? { value, label: value, count: 0 };
      entry.count++;
      counts.set(normalized, entry);
    }
  }
  // A selection stays removable even if another filter currently excludes it.
  for (const value of filters[key]) {
    if (!value.startsWith(TEXT_FILTER_PREFIX) && !counts.has(norm(value))) {
      counts.set(norm(value), { value, label: value, count: 0 });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, "de", { numeric: true }));
}

export function summarizeOrders(rows: OrderRow[]) {
  const deliveries = new Set<string>(), units = new Set<string>(), shelves = new Set<string>(), carriers = new Set<string>();
  let unidentified = 0, unidentifiedPallets = 0;
  for (const row of rows) {
    const delivery = text(row.deliveryNumber);
    if (delivery) deliveries.add(delivery); else unidentified++;
    const hus = Array.isArray(row.hus) ? row.hus.map(text).filter(Boolean) : [];
    if (hus.length) hus.forEach((hu) => units.add(hu));
    else unidentifiedPallets += Math.max(0, Number(row.paletten) || 0);
    if (text(row.shelf)) shelves.add(norm(row.shelf));
    if (text(row.spedition)) carriers.add(norm(row.spedition));
  }
  return {
    orders: deliveries.size + unidentified, positions: rows.length, unidentified,
    pallets: units.size + unidentifiedPallets, shelves: shelves.size, carriers: carriers.size,
  };
}
