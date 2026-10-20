import { useMemo, useState } from "react";
import { useGetClockShiftPlanning, getGetClockShiftPlanningQueryKey, useDeleteClockShift, useDeleteClockShiftAssignment, useDeleteClockShiftException } from "@workspace/api-client-react";
import type { ClockShift, ClockShiftAssignment, ClockShiftException, ClockShiftDay } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { WEEKDAYS, addDays, berlinDate, diffDays, errMsg, fmtMin, fmtTime, isoDay, mondayOf, sel, useInvalidateClock } from "./lib";
import { AssignmentDialog, ConfirmDelete, ExceptionDialog, ShiftDialog } from "./shift-dialogs";

type Dlg = { k: "shift"; v: ClockShift | null } | { k: "assign"; v: ClockShiftAssignment | null } | { k: "exc"; v: ClockShiftException | null }
  | { k: "delShift"; v: ClockShift } | { k: "delAssign"; v: ClockShiftAssignment } | { k: "delExc"; v: ClockShiftException } | null;

const wd = (d: number[]) => d.length === 7 ? "täglich" : d.map((x) => WEEKDAYS[x - 1]).join(", ");
const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-lg border bg-white p-3 sm:p-4 space-y-3"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{title}</h2><div className="ml-auto">{action}</div></div>{children}</section>);

export function ShiftsPanel({ canEdit }: { canEdit: boolean }) {
  const invalidate = useInvalidateClock();
  const today = berlinDate(new Date());
  const mon = mondayOf(today);
  const [from, setFrom] = useState(mon);
  const [to, setTo] = useState(addDays(mon, 13));
  const [emp, setEmp] = useState("");
  const [dlg, setDlg] = useState<Dlg>(null);
  const delShift = useDeleteClockShift(); const delAssign = useDeleteClockShiftAssignment(); const delExc = useDeleteClockShiftException();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const span = re.test(from) && re.test(to) ? diffDays(from, to) : -1;
  const valid = span >= 0 && span < 62;
  const params = { from, to, ...(emp ? { employeeId: Number(emp) } : {}) };
  const q = useGetClockShiftPlanning(params, { query: { enabled: valid, queryKey: getGetClockShiftPlanningQueryKey(params), staleTime: 10_000, refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const d = q.data;
  const empById = useMemo(() => new Map(d?.employees.map((e) => [e.id, e]) ?? []), [d]);
  const nm = (id: number) => { const e = empById.get(id); return e ? `${e.lastName}, ${e.firstName}` : `#${id}`; };
  const sn = (id: number | null) => id == null ? "Frei" : d?.shifts.find((s) => s.id === id)?.name ?? `#${id}`;
  const days = useMemo(() => valid ? Array.from({ length: span + 1 }, (_, i) => addDays(from, i)) : [], [valid, from, span]);
  const cell = useMemo(() => new Map<string, ClockShiftDay>(d?.days.map((x) => [`${x.employeeId}|${x.day}`, x]) ?? []), [d]);
  const rowsEmp = (d?.employees ?? []).filter((e) => emp ? String(e.id) === emp : e.active);
  const sorted = (d?.employees ?? []).slice().sort((a, b) => a.lastName.localeCompare(b.lastName, "de"));
  const done = () => invalidate();
  const week = (o: number) => { const m = addDays(mondayOf(today), o * 7); setFrom(m); setTo(addDays(m, 13)); };
  const add = (b: React.ReactNode) => canEdit ? b : null;
  const list = (a: ClockShiftAssignment[]) => a.filter((x) => !emp || String(x.employeeId) === emp).sort((p, q2) => nm(p.employeeId).localeCompare(nm(q2.employeeId), "de") || p.startsOn.localeCompare(q2.startsOn));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div><Label>Von</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-plan-from" /></div>
        <div><Label>Bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-plan-to" /></div>
        <div className="min-w-[12rem] flex-1 sm:flex-none"><Label>Mitarbeiter</Label>
          <select className={sel} value={emp} onChange={(e) => setEmp(e.target.value)} data-testid="select-plan-employee"><option value="">Alle</option>{sorted.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</select></div>
        <Button variant="outline" onClick={() => week(0)}>Diese + nächste Woche</Button>
        <Button variant="outline" onClick={() => week(1)}>Ab nächster Woche</Button>
        {!valid && <span className="text-sm text-red-700" role="alert">Ungültiger Zeitraum (höchstens 62 Tage).</span>}
      </div>

      {q.isLoading && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>}
      {q.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3"><span>Schichtplan nicht ladbar: {errMsg(q.error)}</span><Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>}

      {d && <>
        <Card title="Planungskalender">
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-sky-100 border border-sky-300" />Zugewiesene Schicht</span>
            <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-slate-200 border border-slate-300" />Frei (0 h)</span>
            <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-400" />Ausnahme</span>
            <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm border border-dashed border-slate-300" />Keine Zuweisung: allgemeine Zeitregeln gelten</span>
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="text-xs w-full border-collapse">
              <thead className="bg-slate-50"><tr><th className="sticky left-0 bg-slate-50 text-left px-2 py-2 min-w-[9rem] z-10">Mitarbeiter</th>
                {days.map((x) => { const w = (new Date(`${x}T12:00:00Z`).getUTCDay() + 6) % 7; return <th key={x} className={`px-1 py-2 font-medium min-w-[5.5rem] ${x === today ? "text-sky-700" : "text-slate-500"}`}>{WEEKDAYS[w]} {x.slice(8)}.{x.slice(5, 7)}.</th>; })}</tr></thead>
              <tbody>
                {rowsEmp.map((e) => (
                  <tr key={e.id} className="border-t" data-testid={`row-plan-${e.id}`}>
                    <th className="sticky left-0 bg-white text-left px-2 py-1 font-medium z-10">{e.lastName}, {e.firstName}</th>
                    {days.map((x) => {
                      const c = cell.get(`${e.id}|${x}`);
                      let cls = "border-dashed border-slate-300 text-slate-400", body: React.ReactNode = "keine Zuw.";
                      if (c && c.source !== "none") {
                        const exc = c.source === "exception";
                        if (c.shiftId == null) { cls = exc ? "bg-amber-100 border-amber-400 text-amber-900" : "bg-slate-200 border-slate-300 text-slate-700"; body = <><b>Frei</b><div>0:00 h</div></>; }
                        else { cls = exc ? "bg-amber-100 border-amber-400 text-amber-900" : "bg-sky-100 border-sky-300 text-sky-900"; body = <><b>{c.shiftName}</b><div>{fmtTime(c.startsAt)}-{fmtTime(c.endsAt)}</div><div>{fmtMin(c.plannedMinutes)}</div></>; }
                        if (exc) body = <>{body}<div className="uppercase text-[9px] tracking-wide">Ausnahme</div></>;
                      }
                      return <td key={x} className="p-0.5"><div className={`rounded border px-1 py-1 text-center leading-tight ${cls}`} data-testid={`cell-plan-${e.id}-${x}`}>{body}</div></td>;
                    })}
                  </tr>))}
                {!rowsEmp.length && <tr><td colSpan={days.length + 1} className="p-8 text-center text-slate-500">Keine Mitarbeiter vorhanden.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Arbeitszeit wird nur innerhalb der zugewiesenen Schicht abzüglich Pause gezählt. Ohne Zuweisung gelten die allgemeinen Regeln. Zuweisungen ändern bestehende Stempelungen nicht.</p>
        </Card>

        <Card title="Schichten" action={add(<Button size="sm" onClick={() => setDlg({ k: "shift", v: null })} data-testid="button-new-shift"><Plus className="w-4 h-4 mr-1" />Schicht</Button>)}>
          {!d.shifts.length ? <p className="text-sm text-slate-500 py-4 text-center">Noch keine Schichten angelegt. Legen Sie z. B. Früh- und Spätschicht an, um Mitarbeitern Schichten zuzuweisen.</p> :
            <ul className="divide-y">{d.shifts.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2 text-sm" data-testid={`row-shift-${s.id}`}>
                <div className="flex-1 min-w-0"><div className="font-medium truncate">{s.name}</div><div className="text-xs text-slate-500">{s.startTime.slice(0, 5)} bis {s.endTime.slice(0, 5)}{s.endTime < s.startTime ? " (Folgetag)" : ""}, Pause {s.pauseMinutes} min</div></div>
                {add(<><Button size="icon" variant="ghost" aria-label="Schicht bearbeiten" onClick={() => setDlg({ k: "shift", v: s })} data-testid={`button-edit-shift-${s.id}`}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Schicht löschen" onClick={() => setDlg({ k: "delShift", v: s })} data-testid={`button-delete-shift-${s.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button></>)}
              </li>))}</ul>}
        </Card>

        <Card title="Zuweisungen und Wochenzyklus" action={add(<Button size="sm" disabled={!d.shifts.length} onClick={() => setDlg({ k: "assign", v: null })} data-testid="button-new-assignment"><Plus className="w-4 h-4 mr-1" />Mehrere zuweisen</Button>)}>
          {!list(d.assignments).length ? <p className="text-sm text-slate-500 py-4 text-center">{d.shifts.length ? "Keine Zuweisungen. Ohne Zuweisung gelten die allgemeinen Zeitregeln." : "Erst Schichten anlegen."}</p> :
            <ul className="divide-y">{list(d.assignments).map((a) => (
              <li key={a.id} className="py-2 text-sm space-y-1" data-testid={`row-assignment-${a.id}`}>
                <div className="flex items-center gap-2"><div className="flex-1 min-w-0"><div className="font-medium">{nm(a.employeeId)}</div>
                  <div className="text-xs text-slate-500">{isoDay(a.startsOn)} bis {a.endsOn ? isoDay(a.endsOn) : "offen"}, {wd(a.weekdays)}</div></div>
                  {add(<><Button size="icon" variant="ghost" aria-label="Zuweisung bearbeiten" onClick={() => setDlg({ k: "assign", v: a })} data-testid={`button-edit-assignment-${a.id}`}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Zuweisung löschen" onClick={() => setDlg({ k: "delAssign", v: a })} data-testid={`button-delete-assignment-${a.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button></>)}</div>
                <div className="flex flex-wrap gap-1 text-xs">{a.shiftIds.map((id, i) => <span key={i} className="rounded border bg-slate-50 px-1.5 py-0.5">W{i + 1}: {sn(id)}</span>)}
                  <span className="text-slate-500 self-center">Wechsel jeden Montag, Start Woche ab {isoDay(a.anchorMonday)}</span></div>
              </li>))}</ul>}
        </Card>

        <Card title="Ausnahmen" action={add(<Button size="sm" disabled={!d.employees.length} onClick={() => setDlg({ k: "exc", v: null })} data-testid="button-new-exception"><Plus className="w-4 h-4 mr-1" />Ausnahme</Button>)}>
          {!d.exceptions.filter((x) => !emp || String(x.employeeId) === emp).length ? <p className="text-sm text-slate-500 py-4 text-center">Keine Ausnahmen im Zeitraum.</p> :
            <ul className="divide-y">{d.exceptions.filter((x) => !emp || String(x.employeeId) === emp).map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-2 text-sm" data-testid={`row-exception-${x.id}`}>
                <div className="flex-1 min-w-0"><div className="font-medium">{nm(x.employeeId)}: {sn(x.shiftId)}</div>
                  <div className="text-xs text-slate-500">{x.startsOn === x.endsOn ? isoDay(x.startsOn) : `${isoDay(x.startsOn)} bis ${isoDay(x.endsOn)}`}, {wd(x.weekdays)}{x.note ? `, ${x.note}` : ""}</div></div>
                {add(<><Button size="icon" variant="ghost" aria-label="Ausnahme bearbeiten" onClick={() => setDlg({ k: "exc", v: x })} data-testid={`button-edit-exception-${x.id}`}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Ausnahme löschen" onClick={() => setDlg({ k: "delExc", v: x })} data-testid={`button-delete-exception-${x.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button></>)}
              </li>))}</ul>}
        </Card>

        {dlg?.k === "shift" && <ShiftDialog key={dlg.v?.id ?? "new"} shift={dlg.v} onClose={() => setDlg(null)} done={done} />}
        {dlg?.k === "assign" && <AssignmentDialog key={dlg.v?.id ?? "new"} item={dlg.v} employees={sorted} shifts={d.shifts} defaultEmployee={emp} assignments={d.assignments} onClose={() => setDlg(null)} done={done} />}
        {dlg?.k === "exc" && <ExceptionDialog key={dlg.v?.id ?? "new"} item={dlg.v} employees={sorted} shifts={d.shifts} defaultEmployee={emp} onClose={() => setDlg(null)} done={done} />}
        {dlg?.k === "delShift" && <ConfirmDelete title="Schicht löschen" text={`Schicht "${dlg.v.name}" löschen? Wird sie noch in Zuweisungen oder Ausnahmen verwendet, kann sie nicht gelöscht werden.`} onClose={() => setDlg(null)} onConfirm={async () => { await delShift.mutateAsync({ id: dlg.v.id, data: { expectedUpdatedAt: dlg.v.updatedAt } }); done(); }} />}
        {dlg?.k === "delAssign" && <ConfirmDelete title="Zuweisung löschen" text={`Zuweisung von ${nm(dlg.v.employeeId)} ab ${isoDay(dlg.v.startsOn)} löschen? Bereits erfasste Stempelungen bleiben erhalten.`} onClose={() => setDlg(null)} onConfirm={async () => { await delAssign.mutateAsync({ id: dlg.v.id, data: { expectedUpdatedAt: dlg.v.updatedAt } }); done(); }} />}
        {dlg?.k === "delExc" && <ConfirmDelete title="Ausnahme löschen" text={`Ausnahme von ${nm(dlg.v.employeeId)} (${isoDay(dlg.v.startsOn)} bis ${isoDay(dlg.v.endsOn)}) löschen?`} onClose={() => setDlg(null)} onConfirm={async () => { await delExc.mutateAsync({ id: dlg.v.id, data: { expectedUpdatedAt: dlg.v.updatedAt } }); done(); }} />}
      </>}
    </div>
  );
}
