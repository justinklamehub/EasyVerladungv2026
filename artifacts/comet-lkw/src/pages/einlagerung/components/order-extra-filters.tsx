import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliveryNumberFilter } from "./delivery-number-filter";
import { OrderMultiFilter } from "./order-multi-filter";
import { DEADLINE_LABELS } from "./delivery-deadlines-output";
import type { DeadlineStatus } from "./delivery-deadlines";
import type { DeadlineFilters } from "./deadline-filters";

export function OrderExtraFilters({ filters, setFilters }: { filters: DeadlineFilters; setFilters: Dispatch<SetStateAction<DeadlineFilters>> }) {
  return <div className="flex flex-wrap items-start gap-3">
    <div className="w-full sm:w-64"><DeliveryNumberFilter value={filters.deliveryNumbers ?? []} onChange={(deliveryNumbers) => setFilters((p) => ({ ...p, deliveryNumbers }))} testId="filter-orders-delivery-numbers" /></div>
    <div className="w-full sm:w-52"><OrderMultiFilter label="Terminstatus" value={filters.statuses} onChange={(statuses) => setFilters((p) => ({ ...p, statuses: statuses as DeadlineStatus[] }))}
      options={Object.entries(DEADLINE_LABELS).map(([value, label]) => ({ value, label }))} testId="filter-orders-deadline-status" /></div>
    <label className="space-y-1 text-xs text-slate-600">Debitorennummer beginnt mit
      <Input inputMode="numeric" placeholder="z. B. 51045" value={filters.debitorPrefix ?? ""} data-testid="filter-orders-debitor-prefix" onChange={(e) => setFilters((p) => ({ ...p, debitorPrefix: e.target.value }))} />
    </label>
    <label className="space-y-1 text-xs text-slate-600">Liefertermin ab
      <Input type="date" value={filters.dateFrom} data-testid="filter-orders-date-from" onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
    </label>
    <label className="space-y-1 text-xs text-slate-600">Liefertermin bis
      <Input type="date" value={filters.dateTo} data-testid="filter-orders-date-to" onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} />
    </label>
    <Button type="button" size="sm" variant={filters.overdueOnly ? "default" : "outline"} aria-pressed={filters.overdueOnly} onClick={() => setFilters((p) => ({ ...p, overdueOnly: !p.overdueOnly }))} data-testid="filter-orders-overdue">Nur überfällig</Button>
  </div>;
}
