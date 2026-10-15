import { useMemo, useState } from "react";
import { useCreateClockEmployee, useUpdateClockEmployee, useDeleteClockEmployee, useGetNextClockCardNumber } from "@workspace/api-client-react";
import type { ClockEmployee, ClockEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { errMsg, esc, openPrint, useInvalidateClock } from "./lib";

export function Employees({ employees, entries, canEdit }: { employees: ClockEmployee[]; entries: ClockEntry[]; canEdit: boolean }) {
  const { toast } = useToast();
  const invalidate = useInvalidateClock();
  const update = useUpdateClockEmployee(); const remove = useDeleteClockEmployee();
  const [q, setQ] = useState(""); const [edit, setEdit] = useState<ClockEmployee | "new" | null>(null);
  const [del, setDel] = useState<ClockEmployee | null>(null); const [err, setErr] = useState("");
  const list = useMemo(() => employees.filter((e) => `${e.firstName} ${e.lastName} ${e.cardNumber} ${e.provider} ${e.activity}`.toLowerCase().includes(q.trim().toLowerCase())), [employees, q]);

  const cards = async (items: ClockEmployee[]) => {
    try {
      const mod = await import("jsbarcode"); const JsBarcode = (mod as any).default ?? mod;
      const html = items.map((e) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, e.cardNumber, { format: "CODE128", height: 60, displayValue: true });
        return `<div class="card"><div class="n">${esc(e.firstName)} ${esc(e.lastName)}</div><div>${esc(e.provider)} ${esc(e.activity)}</div>${svg.outerHTML}</div>`;
      }).join("");
      if (!openPrint("Mitarbeiterkarten", `<h1>Mitarbeiterkarten</h1><div class="cards">${html}</div>`)) toast({ title: "Popup blockiert", description: "Bitte Popups erlauben.", variant: "destructive" });
    } catch (e) { toast({ title: "Karten konnten nicht erstellt werden", description: errMsg(e), variant: "destructive" }); }
  };

  const deactivate = async (e: ClockEmployee) => {
    setErr("");
    try { await update.mutateAsync({ id: e.id, data: { cardNumber: e.cardNumber, firstName: e.firstName, lastName: e.lastName, provider: e.provider, activity: e.activity, active: !e.active, expectedUpdatedAt: e.updatedAt } }); invalidate(); }
    catch (x) { setErr(errMsg(x)); }
  };
  const doDelete = async () => {
    if (!del) return; setErr("");
    try { await remove.mutateAsync({ id: del.id }); invalidate(); setDel(null); } catch (x) { setErr(errMsg(x)); setDel(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[10rem]"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mitarbeiter suchen" data-testid="input-employee-search" /></div>
        {canEdit && <Button variant="outline" onClick={() => cards(list.filter((e) => e.active))} disabled={!list.length} data-testid="button-print-cards"><CreditCard className="w-4 h-4 mr-1" />Karten drucken</Button>}
        {canEdit && <Button onClick={() => setEdit("new")} data-testid="button-new-employee"><Plus className="w-4 h-4 mr-1" />Mitarbeiter</Button>}
      </div>
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2" data-testid="text-employee-error">{err}</div>}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{["Name", "Karte", "Dienstleister", "Tätigkeit", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-t" data-testid={`row-employee-${e.id}`}>
                <td className="px-3 py-2 font-medium">{e.lastName}, {e.firstName}</td>
                <td className="px-3 py-2 font-mono">{e.cardNumber}</td><td className="px-3 py-2">{e.provider}</td><td className="px-3 py-2">{e.activity}</td>
                <td className="px-3 py-2">{e.active ? <Badge variant="secondary">Aktiv</Badge> : <Badge variant="outline">Inaktiv</Badge>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{canEdit && <>
                  <Button size="icon" variant="ghost" aria-label="Karte drucken" onClick={() => cards([e])}><CreditCard className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Bearbeiten" onClick={() => setEdit(e)} data-testid={`button-edit-employee-${e.id}`}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={e.active ? "Deaktivieren" : "Aktivieren"} onClick={() => deactivate(e)} data-testid={`button-toggle-employee-${e.id}`}><UserX className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Löschen" onClick={() => setDel(e)} data-testid={`button-delete-employee-${e.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button></>}</td>
              </tr>))}
            {!list.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">Keine Mitarbeiter.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EmployeeDialog key={edit === "new" ? "n" : edit.id} emp={edit === "new" ? null : edit} onClose={() => setEdit(null)} invalidate={invalidate} />}
      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent><DialogHeader><DialogTitle>Mitarbeiter löschen</DialogTitle></DialogHeader>
          <p className="text-sm">{del?.firstName} {del?.lastName} wird endgültig gelöscht. Das ist nur möglich, wenn keine Zeiteinträge existieren
            {del && entries.some((x) => x.employeeId === del.id) ? " (im gewählten Zeitraum gibt es Einträge, daher wird der Server das voraussichtlich ablehnen; stattdessen deaktivieren)" : ""}.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>Abbrechen</Button><Button variant="destructive" onClick={doDelete} disabled={remove.isPending} data-testid="button-confirm-delete-employee">Löschen</Button></DialogFooter>
        </DialogContent></Dialog>
    </div>
  );
}

function EmployeeDialog({ emp, onClose, invalidate }: { emp: ClockEmployee | null; onClose: () => void; invalidate: () => void }) {
  const create = useCreateClockEmployee(); const update = useUpdateClockEmployee();
  const nextCard = useGetNextClockCardNumber({ query: { queryKey: ["/api/stempeluhr/employees/next-card-number"], enabled: !emp, staleTime: 0 } });
  const [f, setF] = useState({ firstName: emp?.firstName ?? "", lastName: emp?.lastName ?? "", provider: emp?.provider ?? "", activity: emp?.activity ?? "", active: emp?.active ?? true });
  const [err, setErr] = useState("");
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setErr("");
    if (!f.firstName.trim() || !f.lastName.trim()) { setErr("Vor- und Nachname sind Pflicht"); return; }
    const data = { ...f, firstName: f.firstName.trim(), lastName: f.lastName.trim(), provider: f.provider.trim(), activity: f.activity.trim() };
    try {
      if (emp) await update.mutateAsync({ id: emp.id, data: { ...data, cardNumber: emp.cardNumber, expectedUpdatedAt: emp.updatedAt } }); else await create.mutateAsync({ data });
      invalidate(); onClose();
    } catch (e) { setErr(errMsg(e)); }
  };
  const fields: [keyof typeof f, string][] = [["firstName", "Vorname"], ["lastName", "Nachname"], ["provider", "Dienstleister"], ["activity", "Tätigkeit"]];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent><DialogHeader><DialogTitle>{emp ? "Mitarbeiter bearbeiten" : "Mitarbeiter anlegen"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="employee-card-number">Kartennummer (ID)</Label>
            <Input id="employee-card-number" value={emp?.cardNumber ?? nextCard.data?.cardNumber ?? ""} readOnly aria-readonly="true" className="font-mono bg-slate-50" placeholder="Wird automatisch ermittelt…" data-testid="input-employee-cardNumber" />
            <p className="mt-1 text-xs text-slate-500">{emp ? "Die Kartennummer ist fest vergeben und nicht bearbeitbar." : "Automatische Vergabe beim Speichern. Bei gleichzeitigen Anlagen kann sich die angezeigte Nummer noch ändern."}</p>
            {!emp && nextCard.isError && <div className="text-sm text-red-700">{errMsg(nextCard.error)} <Button size="sm" variant="outline" onClick={() => nextCard.refetch()}>Erneut versuchen</Button></div>}
          </div>
          {fields.map(([k, l]) => <div key={k}><Label>{l}</Label><Input value={String(f[k])} onChange={(e) => set(k, e.target.value)} data-testid={`input-employee-${k}`} /></div>)}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.active} onCheckedChange={(v) => set("active", v === true)} />Aktiv</label>
          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={create.isPending || update.isPending || (!emp && (!nextCard.data || nextCard.isFetching || nextCard.isError))} data-testid="button-save-employee">Speichern</Button></DialogFooter>
      </DialogContent></Dialog>
  );
}
