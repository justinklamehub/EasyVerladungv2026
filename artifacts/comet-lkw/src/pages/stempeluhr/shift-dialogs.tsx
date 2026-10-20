import { useState } from "react";
import { useCreateClockShift, useUpdateClockShift, useCreateClockShiftAssignment, useUpdateClockShiftAssignment, useCreateClockShiftException, useUpdateClockShiftException } from "@workspace/api-client-react";
import type { ClockShift, ClockShiftAssignment, ClockShiftException, ClockEmployee } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { WEEKDAYS, addDays, errMsg, isoDay, mondayOf, sel } from "./lib";

const box = "max-h-[90dvh] overflow-y-auto w-[calc(100vw-1rem)] sm:max-w-lg";
const ErrBox = ({ e }: { e: string }) => e ? <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2" data-testid="text-shift-error">{e}</div> : null;
const empName = (e: ClockEmployee) => `${e.lastName}, ${e.firstName}${e.active ? "" : " (inaktiv)"}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export function ShiftDialog({ shift, onClose, done }: { shift: ClockShift | null; onClose: () => void; done: () => void }) {
  const create = useCreateClockShift(); const update = useUpdateClockShift();
  const [pinned] = useState(shift?.updatedAt);
  const [name, setName] = useState(shift?.name ?? "");
  const [start, setStart] = useState(shift?.startTime.slice(0, 5) ?? "06:00");
  const [end, setEnd] = useState(shift?.endTime.slice(0, 5) ?? "14:00");
  const [pause, setPause] = useState(String(shift?.pauseMinutes ?? 30));
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    const p = Number(pause);
    if (!name.trim()) return setErr("Bitte einen Namen angeben.");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return setErr("Beginn und Ende angeben.");
    if (start === end) return setErr("Beginn und Ende dürfen nicht gleich sein.");
    if (start.startsWith("02:") || end.startsWith("02:")) return setErr("Zeiten zwischen 02:00 und 02:59 sind wegen der Zeitumstellung nicht erlaubt.");
    if (!Number.isInteger(p) || p < 0 || p > 1439) return setErr("Pause: ganze Minuten, 0 bis 1439.");
    const dur = (toMin(end) - toMin(start) + 1440) % 1440;
    if (p >= dur) return setErr(`Die Pause muss kürzer als die Schicht (${dur} Minuten) sein.`);
    const data = { name: name.trim(), startTime: start, endTime: end, pauseMinutes: p };
    try {
      if (shift) await update.mutateAsync({ id: shift.id, data: { ...data, expectedUpdatedAt: pinned! } }); else await create.mutateAsync({ data });
      done(); onClose();
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className={box}>
      <DialogHeader><DialogTitle>{shift ? "Schicht bearbeiten" : "Neue Schicht"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} maxLength={100} placeholder="z. B. Frühschicht" onChange={(e) => setName(e.target.value)} data-testid="input-shift-name" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Beginn</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-shift-start" /></div>
          <div><Label>Ende</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-shift-end" /></div>
        </div>
        <div><Label>Pause (Minuten, unbezahlt)</Label><Input inputMode="numeric" value={pause} onChange={(e) => setPause(e.target.value)} data-testid="input-shift-pause" /></div>
        <p className="text-xs text-slate-500">Liegt das Ende vor dem Beginn, endet die Schicht am Folgetag (Nachtschicht). Gezählt wird nur die Zeit innerhalb der Schicht abzüglich Pause. Bereits erfasste Stempelungen bleiben unverändert.</p>
        <ErrBox e={err} />
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={create.isPending || update.isPending} data-testid="button-save-shift">Speichern</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function WeekdayPick({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Wochentage">
      {WEEKDAYS.map((w, i) => { const on = value.includes(i + 1); return (
        <button key={w} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== i + 1) : [...value, i + 1].sort())}
          className={`h-9 min-w-10 px-2 rounded-md border text-sm ${on ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`} data-testid={`toggle-weekday-${i + 1}`}>{w}</button>); })}
    </div>
  );
}

export function AssignmentDialog({ item, employees, shifts, defaultEmployee, onClose, done }: { item: ClockShiftAssignment | null; employees: ClockEmployee[]; shifts: ClockShift[]; defaultEmployee?: string; onClose: () => void; done: () => void }) {
  const create = useCreateClockShiftAssignment(); const update = useUpdateClockShiftAssignment();
  const [pinned] = useState(item?.updatedAt);
  const [emp, setEmp] = useState(item ? String(item.employeeId) : defaultEmployee ?? "");
  const [from, setFrom] = useState(item?.startsOn ?? "");
  const [to, setTo] = useState(item?.endsOn ?? "");
  const [days, setDays] = useState<number[]>(item?.weekdays ?? [1, 2, 3, 4, 5]);
  const [cycle, setCycle] = useState<string[]>(item ? item.shiftIds.map(String) : [""]);
  const [err, setErr] = useState("");
  const move = (i: number, d: number) => { const c = [...cycle]; const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; setCycle(c); };
  const sname = (id: string) => shifts.find((s) => String(s.id) === id)?.name ?? "?";
  const save = async () => {
    setErr("");
    if (!emp) return setErr("Mitarbeiter wählen.");
    if (!dateRe.test(from)) return setErr("Startdatum angeben.");
    if (to && (!dateRe.test(to) || to < from)) return setErr("Das Enddatum darf nicht vor dem Startdatum liegen.");
    if (!days.length) return setErr("Mindestens einen Wochentag wählen.");
    if (cycle.some((c) => !c)) return setErr("Jede Woche des Zyklus braucht eine Schicht.");
    const data = { employeeId: Number(emp), startsOn: from, endsOn: to || null, weekdays: days, shiftIds: cycle.map(Number) };
    try {
      if (item) await update.mutateAsync({ id: item.id, data: { ...data, expectedUpdatedAt: pinned! } }); else await create.mutateAsync({ data });
      done(); onClose();
    } catch (e) { setErr(errMsg(e)); }
  };
  const mon = dateRe.test(from) ? mondayOf(from) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className={box}>
      <DialogHeader><DialogTitle>{item ? "Zuweisung bearbeiten" : "Schichten zuweisen"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Mitarbeiter</Label>
          <select className={sel} value={emp} onChange={(e) => setEmp(e.target.value)} disabled={!!item} data-testid="select-assign-employee">
            <option value="">Bitte wählen</option>{employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Gültig ab</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-assign-from" /></div>
          <div><Label>Bis (leer = offen)</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-assign-to" /></div>
        </div>
        <div><Label>Arbeitstage</Label><WeekdayPick value={days} onChange={setDays} /></div>
        <div className="space-y-2"><Label>Wochenzyklus (1 bis 12 Wochen, in Reihenfolge)</Label>
          {cycle.map((c, i) => (
            <div key={i} className="flex gap-1 items-center">
              <span className="w-16 shrink-0 text-xs text-slate-500">Woche {i + 1}</span>
              <select className={sel} aria-label={`Schicht Woche ${i + 1}`} value={c} onChange={(e) => setCycle(cycle.map((x, j) => j === i ? e.target.value : x))} data-testid={`select-cycle-${i}`}>
                <option value="">Schicht wählen</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)})</option>)}</select>
              <Button size="icon" variant="ghost" aria-label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Nach unten" disabled={i === cycle.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="Woche entfernen" disabled={cycle.length < 2} onClick={() => setCycle(cycle.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>))}
          <Button size="sm" variant="outline" disabled={cycle.length >= 12} onClick={() => setCycle([...cycle, ""])} data-testid="button-add-cycle"><Plus className="w-4 h-4 mr-1" />Woche</Button>
        </div>
        <div className="rounded border bg-slate-50 p-2 text-xs space-y-1" data-testid="preview-cycle">
          <div className="font-medium">Vorschau (Wechsel automatisch jeden Montag)</div>
          {mon ? Array.from({ length: Math.min(Math.max(cycle.length, 1) * 2, 8) }, (_, k) => (
            <div key={k} className="flex justify-between"><span>Woche ab {isoDay(addDays(mon, k * 7))}</span><span>{cycle[k % cycle.length] ? sname(cycle[k % cycle.length]) : "-"}</span></div>)) : <div>Startdatum wählen. Position 1 gilt für die Woche des Startdatums.</div>}
        </div>
        <ErrBox e={err} />
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={create.isPending || update.isPending} data-testid="button-save-assignment">Speichern</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

export function ExceptionDialog({ item, employees, shifts, defaultEmployee, onClose, done }: { item: ClockShiftException | null; employees: ClockEmployee[]; shifts: ClockShift[]; defaultEmployee?: string; onClose: () => void; done: () => void }) {
  const create = useCreateClockShiftException(); const update = useUpdateClockShiftException();
  const [pinned] = useState(item?.updatedAt);
  const [emp, setEmp] = useState(item ? String(item.employeeId) : defaultEmployee ?? "");
  const [from, setFrom] = useState(item?.startsOn ?? "");
  const [to, setTo] = useState(item?.endsOn ?? "");
  const [days, setDays] = useState<number[]>(item?.weekdays ?? [1, 2, 3, 4, 5, 6, 7]);
  const [shift, setShift] = useState(item?.shiftId ? String(item.shiftId) : "");
  const [note, setNote] = useState(item?.note ?? "");
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (!emp) return setErr("Mitarbeiter wählen.");
    if (!dateRe.test(from) || !dateRe.test(to)) return setErr("Von- und Bis-Datum angeben (für einen Tag beide gleich).");
    if (to < from) return setErr("Das Enddatum darf nicht vor dem Startdatum liegen.");
    if (!days.length) return setErr("Mindestens einen Wochentag wählen.");
    const data = { employeeId: Number(emp), startsOn: from, endsOn: to, weekdays: days, shiftId: shift ? Number(shift) : null, note: note.trim() };
    try {
      if (item) await update.mutateAsync({ id: item.id, data: { ...data, expectedUpdatedAt: pinned! } }); else await create.mutateAsync({ data });
      done(); onClose();
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className={box}>
      <DialogHeader><DialogTitle>{item ? "Ausnahme bearbeiten" : "Ausnahme anlegen"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Eine Ausnahme hat Vorrang vor der Zuweisung, z. B. Tausch, Urlaub oder frei.</p>
        <div><Label>Mitarbeiter</Label>
          <select className={sel} value={emp} onChange={(e) => setEmp(e.target.value)} disabled={!!item} data-testid="select-exc-employee">
            <option value="">Bitte wählen</option>{employees.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Von</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (!to) setTo(e.target.value); }} data-testid="input-exc-from" /></div>
          <div><Label>Bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-exc-to" /></div>
        </div>
        <div><Label>Wochentage</Label><WeekdayPick value={days} onChange={setDays} /></div>
        <div><Label>Schicht</Label>
          <select className={sel} value={shift} onChange={(e) => setShift(e.target.value)} data-testid="select-exc-shift">
            <option value="">Frei (keine Arbeitszeit)</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)})</option>)}</select></div>
        <div><Label>Notiz</Label><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} data-testid="input-exc-note" /></div>
        <ErrBox e={err} />
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={create.isPending || update.isPending} data-testid="button-save-exception">Speichern</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

export function ConfirmDelete({ title, text, onConfirm, onClose }: { title: string; text: string; onConfirm: () => Promise<unknown>; onClose: () => void }) {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(""); try { await onConfirm(); onClose(); } catch (e) { setErr(errMsg(e)); setBusy(false); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className={box}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <p className="text-sm">{text}</p><ErrBox e={err} />
      <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button variant="destructive" onClick={go} disabled={busy} data-testid="button-confirm-delete-shift">Löschen</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
