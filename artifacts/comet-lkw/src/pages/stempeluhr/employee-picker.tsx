import { useMemo, useState } from "react";
import type { ClockEmployee } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sel } from "./lib";

export const MAX_BULK = 500;

export function EmployeePicker({ employees, selected, onChange, conflicts }: { employees: ClockEmployee[]; selected: Set<number>; onChange: (s: Set<number>) => void; conflicts: Map<number, string> }) {
  const [q, setQ] = useState(""); const [prov, setProv] = useState(""); const [act, setAct] = useState("");
  const providers = useMemo(() => [...new Set(employees.map((e) => e.provider).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")), [employees]);
  const acts = useMemo(() => [...new Set(employees.map((e) => e.activity).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")), [employees]);
  const filtered = useMemo(() => { const t = q.trim().toLowerCase(); return employees.filter((e) => (!prov || e.provider === prov) && (!act || e.activity === act) && (!t || `${e.lastName} ${e.firstName} ${e.cardNumber}`.toLowerCase().includes(t))); }, [employees, q, prov, act]);
  const ids = new Set(filtered.map((e) => e.id));
  const outside = [...selected].filter((id) => !ids.has(id)).length;
  const toggle = (id: number, on: boolean) => { const n = new Set(selected); if (on) { if (n.size >= MAX_BULK) return; n.add(id); } else n.delete(id); onChange(n); };
  const selectAll = () => { const n = new Set(selected); for (const e of filtered) { if (n.size >= MAX_BULK) break; n.add(e.id); } onChange(n); };
  const conflictIds = [...selected].filter((id) => conflicts.has(id));
  return (
    <div className="space-y-2" data-testid="picker-employees">
      <Label>Mitarbeiter (aktive, 1 bis {MAX_BULK})</Label>
      <Input placeholder="Suchen: Name oder Kartennummer" aria-label="Mitarbeiter suchen" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-picker-search" />
      <div className="grid grid-cols-2 gap-2">
        <select className={sel} aria-label="Dienstleister filtern" value={prov} onChange={(e) => setProv(e.target.value)} data-testid="select-picker-provider"><option value="">Alle Dienstleister</option>{providers.map((p) => <option key={p}>{p}</option>)}</select>
        <select className={sel} aria-label="Tätigkeit filtern" value={act} onChange={(e) => setAct(e.target.value)} data-testid="select-picker-activity"><option value="">Alle Tätigkeiten</option>{acts.map((p) => <option key={p}>{p}</option>)}</select>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" size="sm" variant="outline" onClick={selectAll} disabled={!filtered.length} data-testid="button-picker-select-filtered">Alle gefilterten wählen ({filtered.length})</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(new Set())} disabled={!selected.size} data-testid="button-picker-clear">Alle abwählen</Button>
      </div>
      <div className="text-xs" role="status" aria-live="polite" data-testid="text-picker-count"><b>{selected.size} von max. {MAX_BULK} ausgewählt</b>{outside > 0 && <span className="text-slate-600"> ({outside} außerhalb des aktuellen Filters)</span>}{selected.size >= MAX_BULK && <span className="text-red-700"> Höchstgrenze erreicht.</span>}</div>
      <ul className="max-h-48 overflow-y-auto rounded border divide-y" data-testid="list-picker">
        {filtered.map((e) => { const on = selected.has(e.id); return (
          <li key={e.id}><label className="flex items-start gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={on} disabled={!on && selected.size >= MAX_BULK} onChange={(ev) => toggle(e.id, ev.target.checked)} data-testid={`checkbox-employee-${e.id}`} />
            <span className="min-w-0"><span className="font-medium">{e.lastName}, {e.firstName}</span><span className="block text-xs text-slate-500 truncate">{[e.provider, e.activity].filter(Boolean).join(" / ") || "-"}</span>{on && conflicts.has(e.id) && <span className="block text-xs text-red-700">Konflikt: {conflicts.get(e.id)}</span>}</span>
          </label></li>); })}
        {!filtered.length && <li className="p-3 text-center text-sm text-slate-500">Keine aktiven Mitarbeiter für diesen Filter.</li>}
      </ul>
      {conflictIds.length > 0 && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800 space-y-1" data-testid="box-conflicts">
          <div className="font-medium">{conflictIds.length} Mitarbeiter mit bestehender Zuweisung im Zeitraum. Speichern ist gesperrt.</div>
          <ul className="max-h-24 overflow-y-auto">{conflictIds.map((id) => { const e = employees.find((x) => x.id === id); return <li key={id}>{e ? `${e.lastName}, ${e.firstName}` : `#${id}`}: {conflicts.get(id)}</li>; })}</ul>
          <Button type="button" size="sm" variant="outline" onClick={() => { const n = new Set(selected); conflictIds.forEach((i) => n.delete(i)); onChange(n); }} data-testid="button-deselect-conflicts">Konflikte abwählen</Button>
        </div>)}
    </div>
  );
}
