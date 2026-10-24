import { useMemo, useState } from "react";
import { useCreateClockEntry, useUpdateClockEntry, useDeleteClockEntry } from "@workspace/api-client-react";
import type { ClockEntry, ClockEmployee } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { P, berlinDate, berlinInput, berlinToIso, downloadCsv, errMsg, esc, fmtDate, fmtDateTime, fmtMin, fmtTime, openPrint, sel, useInvalidateClock } from "./lib";
import { clockCsvRows } from "./csv-export";
import { CsvExportSettings, useClockCsvPreferences } from "./csv-export-settings";
import { attendanceShiftOptions, filterAttendance, NO_SHIFT } from "./attendance-filters";

type Has = (k: string) => boolean;
interface Props { entries: ClockEntry[]; employees: ClockEmployee[]; has: Has; from: string; to: string }

export function Attendance({ entries, employees, has, from, to }: Props) {
  const { toast } = useToast();
  const invalidate = useInvalidateClock();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [shift, setShift] = useState("");
  const [edit, setEdit] = useState<ClockEntry | "new" | null>(null);
  const [del, setDel] = useState<ClockEntry | null>(null);
  const csv = useClockCsvPreferences(has(P.export));

  const shiftOptions = useMemo(() => attendanceShiftOptions(entries, shift), [entries, shift]);
  const rows = useMemo(() => filterAttendance(entries, { search, status, shift }), [entries, search, status, shift]);

  const tot = useMemo(() => {
    let g = 0, p = 0, n = 0, open = 0;
    for (const e of rows) { if (e.endedAt === null || e.netMinutes == null) { open++; continue; } g += e.grossMinutes ?? 0; p += e.pauseMinutes ?? 0; n += e.netMinutes; }
    return { g, p, n, open };
  }, [rows]);

  const exportCsv = () => {
    if (!csv.query.data || csv.query.isError) return;
    downloadCsv(`stempeluhr_${from}_${to}.csv`, clockCsvRows(rows, csv.query.data));
  };

  const report = () => {
    const by = new Map<number, ClockEntry[]>();
    for (const e of rows) by.set(e.employeeId, [...(by.get(e.employeeId) ?? []), e]);
    let html = `<h1>Stundenbericht ${esc(from)} bis ${esc(to)}</h1>`;
    for (const list of by.values()) {
      const f = list[0]; let g = 0, p = 0, n = 0, open = 0;
      list.sort((a, b) => a.bookedStart.localeCompare(b.bookedStart));
      const tr = list.map((e) => {
        if (e.endedAt === null) open++; else { g += e.grossMinutes ?? 0; p += e.pauseMinutes ?? 0; n += e.netMinutes ?? 0; }
        const endTime = e.bookedEnd && berlinDate(e.bookedEnd) !== berlinDate(e.bookedStart) ? fmtDateTime(e.bookedEnd) : fmtTime(e.bookedEnd);
        return `<tr><td>${esc(fmtDate(e.bookedStart))}</td><td>${esc(fmtTime(e.bookedStart))}</td><td>${e.endedAt ? esc(endTime) : "offen"}</td><td class="r">${esc(fmtMin(e.grossMinutes))}</td><td class="r">${esc(fmtMin(e.pauseMinutes))}</td><td class="r">${e.endedAt ? esc(fmtMin(e.netMinutes)) : "offen, kein Netto"}</td><td style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(e.reason ?? "")}</td></tr>`;
      }).join("");
      html += `<div class="sec"><h2>${esc(f.lastName)}, ${esc(f.firstName)} (${esc(f.cardNumber)}) - ${esc(f.provider)} ${esc(f.activity)}</h2><table><tr><th>Tag</th><th>Kommen</th><th>Gehen</th><th>Brutto</th><th>Pause</th><th>Netto</th><th>Grund</th></tr>${tr}<tr><th colspan="3">Summe abgeschlossene Einträge</th><th class="r">${esc(fmtMin(g))}</th><th class="r">${esc(fmtMin(p))}</th><th class="r">${esc(fmtMin(n))}</th><th></th></tr></table>${open ? `<p><b>${open} offene(r) Eintrag/Einträge ohne Nettosumme.</b></p>` : ""}</div>`;
    }
    if (!by.size) html += "<p>Keine Einträge im Zeitraum.</p>";
    if (!openPrint("Stundenbericht", html)) toast({ title: "Popup blockiert", description: "Bitte Popups für diese Seite erlauben.", variant: "destructive" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[10rem]"><Label>Suche</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, Karte, Dienstleister" data-testid="input-search" /></div>
        <div><Label>Status</Label>
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status"><option value="all">Alle</option><option value="open">Offen</option><option value="closed">Abgeschlossen</option></select></div>
        <div className="min-w-[12rem]"><Label htmlFor="clock-shift-filter">Schicht</Label>
          <select id="clock-shift-filter" className={sel} value={shift} onChange={(e) => setShift(e.target.value)} data-testid="select-shift-filter">
            <option value="">Alle Schichten</option>
            <option value={NO_SHIFT}>Ohne Schicht</option>
            {shiftOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></div>
        {has(P.export) && <Button variant="outline" onClick={exportCsv} disabled={!csv.query.data || csv.query.isError} data-testid="button-export-csv"><Download className="w-4 h-4 mr-1" />CSV</Button>}
        {has(P.export) && csv.query.data && <CsvExportSettings config={csv.query.data} onSave={csv.save.mutateAsync} saving={csv.save.isPending} />}
        {has(P.export) && <Button variant="outline" onClick={report} data-testid="button-report"><Printer className="w-4 h-4 mr-1" />Bericht drucken</Button>}
        {has(P.correct) && <Button onClick={() => setEdit("new")} data-testid="button-new-entry"><Plus className="w-4 h-4 mr-1" />Zeit erfassen</Button>}
      </div>

      {has(P.export) && csv.query.isLoading && <p className="text-xs text-slate-500">CSV-Einstellungen werden geladen …</p>}
      {has(P.export) && csv.query.isError && <div role="alert" className="text-sm text-red-700">{errMsg(csv.query.error)} <Button size="sm" variant="outline" onClick={() => csv.query.refetch()}>Erneut versuchen</Button></div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {[["Brutto", fmtMin(tot.g)], ["Pause", fmtMin(tot.p)], ["Netto", fmtMin(tot.n)], ["Offen", String(tot.open)]].map(([l, v]) => (
          <div key={l} className="rounded-lg border bg-white p-3"><div className="text-xs text-slate-500">{l}{l !== "Offen" && " (abgeschlossen)"}</div><div className="text-lg font-semibold tabular-nums" data-testid={`total-${l}`}>{v}</div></div>))}
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>
            {["Tag", "Mitarbeiter", "Kommen", "Gehen", "Brutto", "Pause", "Netto", "Status", "Grund", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t" data-testid={`row-entry-${e.id}`}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.bookedStart)}</td>
                <td className="px-3 py-2"><div className="font-medium">{e.lastName}, {e.firstName}</div><div className="text-xs text-slate-500">{e.cardNumber} · {e.provider} {e.activity}</div>{e.shiftName && <div className="text-xs text-sky-800" data-testid={`text-shift-${e.id}`}>Schicht {e.shiftName}{e.shiftDay ? ` (${e.shiftDay.split("-").reverse().join(".")})` : ""}{e.shiftStart && e.shiftEnd ? `, ${fmtTime(e.shiftStart)}-${fmtTime(e.shiftEnd)}` : ""}</div>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtTime(e.bookedStart)}{e.bookedStart !== e.startedAt && <div className="text-xs text-slate-500">erfasst {fmtTime(e.startedAt)}</div>}{e.originalStartedAt !== e.startedAt && <div className="text-xs text-amber-700" title={fmtDateTime(e.originalStartedAt)}>Original {fmtTime(e.originalStartedAt)}</div>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{e.endedAt ? (e.bookedEnd && berlinDate(e.bookedEnd) !== berlinDate(e.bookedStart) ? fmtDateTime(e.bookedEnd) : fmtTime(e.bookedEnd)) : "–"}{e.endedAt && e.bookedEnd !== e.endedAt && <div className="text-xs text-slate-500">erfasst {fmtTime(e.endedAt)}</div>}{e.originalEndedAt !== e.endedAt && <div className="text-xs text-amber-700" title={fmtDateTime(e.originalEndedAt)}>Original {fmtTime(e.originalEndedAt)}</div>}</td>
                <td className="px-3 py-2 tabular-nums">{fmtMin(e.grossMinutes)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtMin(e.pauseMinutes)}{e.pauseOverride != null && <div className="text-xs text-amber-700">manuell</div>}</td>
                <td className="px-3 py-2 tabular-nums">{e.endedAt ? fmtMin(e.netMinutes) : "–"}</td>
                <td className="px-3 py-2">{e.endedAt ? <Badge variant="secondary">Abgeschlossen</Badge> : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Offen</Badge>}</td>
                <td className="px-3 py-2 min-w-[10rem] max-w-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid={`text-entry-reason-${e.id}`}>{e.reason || "–"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {has(P.correct) && <Button size="icon" variant="ghost" onClick={() => setEdit(e)} data-testid={`button-edit-entry-${e.id}`} aria-label="Bearbeiten"><Pencil className="w-4 h-4" /></Button>}
                  {has(P.delete) && <Button size="icon" variant="ghost" onClick={() => setDel(e)} data-testid={`button-delete-entry-${e.id}`} aria-label="Löschen"><Trash2 className="w-4 h-4 text-red-600" /></Button>}
                </td>
              </tr>))}
            {!rows.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-500">Keine Einträge für den gewählten Zeitraum und die gesetzten Filter.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <EntryDialog key={edit === "new" ? "new" : edit.id} entry={edit === "new" ? null : edit} employees={employees} onClose={() => setEdit(null)} invalidate={invalidate} />}
      {del && <DeleteDialog entry={del} onClose={() => setDel(null)} invalidate={invalidate} />}
    </div>
  );
}

function EntryDialog({ entry, employees, onClose, invalidate }: { entry: ClockEntry | null; employees: ClockEmployee[]; onClose: () => void; invalidate: () => void }) {
  const create = useCreateClockEntry(); const update = useUpdateClockEntry();
  const [emp, setEmp] = useState(entry ? String(entry.employeeId) : "");
  const [start, setStart] = useState(berlinInput(entry?.startedAt));
  const [end, setEnd] = useState(berlinInput(entry?.endedAt));
  const [pause, setPause] = useState(entry?.pauseOverride != null ? String(entry.pauseOverride) : "");
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [err, setErr] = useState("");
  const busy = create.isPending || update.isPending;

  const save = async () => {
    setErr("");
    try {
      if (!emp) throw new Error("Mitarbeiter wählen");
      if (!start) throw new Error("Beginn angeben");
      if (!entry && reason.trim().length < 3) throw new Error("Begründung (mind. 3 Zeichen) ist Pflicht");
      const startedAt = berlinToIso(start);
      const endedAt = end ? berlinToIso(end) : null;
      if (endedAt && endedAt <= startedAt) throw new Error("Ende muss nach dem Beginn liegen");
      let pauseOverride: number | null = null;
      if (pause.trim() !== "") { pauseOverride = Number(pause); if (!Number.isInteger(pauseOverride) || pauseOverride < 0 || pauseOverride > 1440) throw new Error("Pause: ganze Minuten 0 bis 1440"); }
      const data = { employeeId: Number(emp), startedAt, endedAt, pauseOverride, reason: reason.trim(), ...(entry ? { expectedUpdatedAt: entry.updatedAt } : {}) };
      if (entry) await update.mutateAsync({ id: entry.id, data }); else await create.mutateAsync({ data });
      invalidate(); onClose();
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{entry ? "Eintrag korrigieren" : "Zeit manuell erfassen"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Mitarbeiter</Label>
            <select className={sel} value={emp} onChange={(e) => setEmp(e.target.value)} disabled={!!entry} data-testid="select-entry-employee">
              <option value="">Bitte wählen</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.cardNumber}){e.active ? "" : " - inaktiv"}</option>)}
            </select></div>
          <p className="text-xs text-slate-500">Alle Zeiten gelten als Zeit in Berlin (Europe/Berlin), unabhängig von der Geräte-Zeitzone.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Beginn</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-entry-start" /></div>
            <div><Label>Ende (leer = offen)</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-entry-end" /></div>
          </div>
          <div><Label>Pause manuell (Minuten, leer = automatisch)</Label><Input inputMode="numeric" value={pause} onChange={(e) => setPause(e.target.value)} data-testid="input-entry-pause" /></div>
          <div><Label>Begründung ({entry ? "optional" : "Pflicht"})</Label><Textarea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} data-testid="input-entry-reason" /></div>
          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2" data-testid="text-entry-error">{err}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button onClick={save} disabled={busy} data-testid="button-save-entry">Speichern</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ entry, onClose, invalidate }: { entry: ClockEntry; onClose: () => void; invalidate: () => void }) {
  const del = useDeleteClockEntry();
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const go = async () => {
    if (reason.trim().length < 3) { setErr("Begründung (mind. 3 Zeichen) ist Pflicht"); return; }
    try { await del.mutateAsync({ id: entry.id, data: { reason: reason.trim(), expectedUpdatedAt: entry.updatedAt } }); invalidate(); onClose(); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Eintrag löschen</DialogTitle></DialogHeader>
        <p className="text-sm">{entry.lastName}, {entry.firstName} am {fmtDate(entry.bookedStart)} ({fmtTime(entry.bookedStart)} bis {fmtTime(entry.bookedEnd)}). Das Löschen wird im Verlauf protokolliert.</p>
        <div><Label>Begründung (Pflicht)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-delete-reason" /></div>
        {err && <div className="text-sm text-red-700">{err}</div>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button variant="destructive" onClick={go} disabled={del.isPending} data-testid="button-confirm-delete-entry">Löschen</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
