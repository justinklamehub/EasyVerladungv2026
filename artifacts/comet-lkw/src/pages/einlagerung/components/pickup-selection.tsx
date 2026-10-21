import { useEffect, useState } from "react";
import type { WarehousePickupBatchTarget } from "@workspace/api-client-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { PickupDialog, type usePickupPlanning } from "./pickup-planning";
import { pickupNumbers, visiblePickupSelection } from "./pickup-selection-state";

export function usePickupSelection(rows: readonly Record<string, unknown>[], disabled: boolean) {
  const numbers = pickupNumbers(rows);
  const key = numbers.join(",");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => {
    const visible = new Set(key.split(",").filter(Boolean));
    setChosen((old) => {
      const next = new Set([...old].filter((n) => visible.has(n)));
      return next.size === old.size ? old : next;
    });
  }, [key]);
  const selected = visiblePickupSelection(chosen, numbers);
  const toggle = (number: unknown) => {
    const n = String(number ?? "").trim();
    if (disabled || !numbers.includes(n)) return;
    setChosen((old) => { const next = new Set(old); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  };
  return { numbers, selected, chosen, disabled, toggle, setAll: (all: boolean) => setChosen(new Set(all ? numbers : [])) };
}
type Selection = ReturnType<typeof usePickupSelection>;

export function PickupSelectionAll({ selection: s }: { selection: Selection }) {
  return <Checkbox aria-label="Alle gefilterten Lieferungen auswählen" checked={s.selected.length > 0 && s.selected.length === s.numbers.length ? true : s.selected.length ? "indeterminate" : false}
    disabled={s.disabled || !s.numbers.length} onCheckedChange={() => s.setAll(s.selected.length !== s.numbers.length)} data-testid="checkbox-pickup-all" />;
}
export function PickupSelectionRow({ selection: s, number }: { selection: Selection; number: unknown }) {
  const n = String(number ?? "").trim();
  return <Checkbox aria-label={`Lieferung ${n || "ohne Nummer"} auswählen`} checked={s.chosen.has(n)}
    disabled={s.disabled || !/^8\d+$/.test(n)} onCheckedChange={() => s.toggle(n)} data-testid={`checkbox-pickup-${n}`} />;
}
export function PickupSelectionBar({ selection: s, planning: p }: { selection: Selection; planning: ReturnType<typeof usePickupPlanning> }) {
  const [editing, setEditing] = useState<WarehousePickupBatchTarget[] | null>(null);
  return <div className="rounded-lg border bg-slate-50 p-3 space-y-2" data-testid="pickup-selection-bar">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <strong>{s.selected.length} von {s.numbers.length} Lieferungen ausgewählt</strong>
      <Button type="button" size="sm" variant="outline" disabled={s.disabled || !s.numbers.length} onClick={() => s.setAll(true)} data-testid="button-pickup-select-filtered">Alle gefilterten auswählen</Button>
      <Button type="button" size="sm" variant="ghost" disabled={s.disabled || !s.selected.length} onClick={() => s.setAll(false)}>Auswahl aufheben</Button>
      <Button type="button" size="sm" disabled={s.disabled || !p.query.isSuccess || p.query.isError || !s.selected.length || s.selected.length > 10000}
        onClick={() => setEditing(s.selected.map((deliveryNumber) => ({ deliveryNumber, expectedUpdatedAt: p.plans.get(deliveryNumber)?.updatedAt ?? null })))}
        data-testid="button-pickup-bulk-edit">Auswahl gemeinsam planen</Button>
    </div>
    <p className="text-xs text-slate-500">Auswahl nach Liefernummer, nicht nach Position. Änderungen gelten für die gesamte Lieferung, auch in anderen Regalen. Es werden ausschließlich ausgewählte, aktuell gefilterte Lieferungen bearbeitet.{s.numbers.length > 10000 && " Maximal 10.000 Lieferungen je Vorgang; bitte Filter eingrenzen."}</p>
    {editing && <PickupDialog batch={editing} onClose={() => setEditing(null)} />}
  </div>;
}
