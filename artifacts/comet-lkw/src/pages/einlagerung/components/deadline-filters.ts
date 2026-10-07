import { type DeadlineOrder, type DeadlineStatus } from "./delivery-deadlines";
import { DEADLINE_LABELS } from "./delivery-deadlines-output";
import { emptyOrderFilters, matchesOrderFilters, orderFacetOptions, orderFilterRow, TEXT_FILTER_PREFIX, type OrderFilters, type OrderFilterKey } from "./orders-filters";

export interface DeadlineFilters {
  search: string;
  statuses: DeadlineStatus[];
  facets: OrderFilters;
  overdueOnly: boolean;
  dateFrom: string;
  dateTo: string;
}
export const emptyDeadlineFilters = (): DeadlineFilters => ({
  search: "", statuses: [], facets: emptyOrderFilters(), overdueOnly: false, dateFrom: "", dateTo: "",
});
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() / 86400000 : NaN;
}
export function deadlineRangeInvalid(filters: DeadlineFilters) {
  return (!!filters.dateFrom && !Number.isFinite(day(filters.dateFrom))) ||
    (!!filters.dateTo && !Number.isFinite(day(filters.dateTo))) ||
    (!!filters.dateFrom && !!filters.dateTo && day(filters.dateFrom) > day(filters.dateTo));
}
export function filterDeliveryRows(rows: DeadlineOrder[], filters: DeadlineFilters, omit?: OrderFilterKey, ignoreStatuses = false) {
  if (deadlineRangeInvalid(filters)) return [];
  const terms = filters.search.trim().toLocaleLowerCase("de").split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (!ignoreStatuses && filters.statuses.length && !filters.statuses.some((s) =>
      s === "week" ? row.dateLabel.startsWith("KW ") : row.status === s)) return false;
    if (filters.overdueOnly && !(row.days != null && row.days < 0)) return false;
    if (filters.dateFrom && (!Number.isFinite(row.sortDay) || row.sortDay < day(filters.dateFrom))) return false;
    if (filters.dateTo && (!Number.isFinite(row.sortDay) || row.sortDay > day(filters.dateTo))) return false;
    const searchable = [
      row.order.deliveryNumber, row.order.shelf, row.order.spedition, row.order.relation,
      row.order.termin, row.order.calendarWeek, row.order.plusKw, row.dateLabel, DEADLINE_LABELS[row.status],
      ...(Array.isArray(row.order.belege) ? row.order.belege : []),
      ...(Array.isArray(row.order.hus) ? row.order.hus : []),
    ].map((v) => String(v ?? "")).join(" ").toLocaleLowerCase("de");
    return terms.every((term) => searchable.includes(term)) &&
      matchesOrderFilters(orderFilterRow(row.order), filters.facets, omit);
  });
}
export function deadlineFacetOptions(rows: DeadlineOrder[], filters: DeadlineFilters, key: OrderFilterKey) {
  return orderFacetOptions(filterDeliveryRows(rows, filters, key).map((r) => orderFilterRow(r.order)), filters.facets, key);
}
export function deadlineFilterDetails(filters: DeadlineFilters) {
  const list = (values: string[]) => values.length ? values.map((v) =>
    v.startsWith(TEXT_FILTER_PREFIX) ? `${v.slice(TEXT_FILTER_PREFIX.length)} (Textsuche)` : v).join(" oder ") : "Alle";
  return [
    ["Status", filters.statuses.length ? filters.statuses.map((s) => DEADLINE_LABELS[s]).join(" oder ") : "Alle"],
    ["Suche", filters.search.trim() || "Keine"],
    ["Speditionen", list(filters.facets.spedition)], ["Relationen", list(filters.facets.relation)],
    ["Termine / KW", list(filters.facets.termin)], ["Regale", list(filters.facets.shelf)],
    ["Nur überfällig", filters.overdueOnly ? "Ja" : "Nein"],
    ["Liefertermin ab", filters.dateFrom || "Unbegrenzt"], ["Liefertermin bis", filters.dateTo || "Unbegrenzt"],
  ];
}
