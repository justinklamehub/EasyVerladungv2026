import { useMemo, useState } from "react";
import { usePreviewClockImport, useCommitClockImport } from "@workspace/api-client-react";
import type { ClockImportInput, ClockImportResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { errMsg, parseCsv, useInvalidateClock } from "./lib";

const readText = (f: File) => f.text();
const ts = (v: string | undefined) => (v ?? "").trim();

export function ImportPanel() {
  const preview = usePreviewClockImport(); const commit = useCommitClockImport(); const invalidate = useInvalidateClock();
  const [empText, setEmpText] = useState<string | null>(null);
  const [attText, setAttText] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [prev, setPrev] = useState<{ key: string; res: ClockImportResult } | null>(null);
  const [done, setDone] = useState<ClockImportResult | null>(null);
  const [err, setErr] = useState("");

  const built = useMemo<{ payload?: ClockImportInput; errors: string[] }>(() => {
    const errors: string[] = [];
    try {
      if (jsonText) {
        const j = JSON.parse(jsonText);
        if (!Array.isArray(j.employees) || !Array.isArray(j.entries)) return { errors: ["JSON braucht die Felder employees und entries"] };
        return { payload: { employees: j.employees, entries: j.entries, legacyTimesAcknowledged: ack }, errors };
      }
      if (empText == null && attText == null) return { errors };
      const emps = parseCsv(empText ?? ""), atts = parseCsv(attText ?? "");
      const employees: ClockImportInput["employees"] = emps.map((r, i) => {
        const card = ts(r.mitarbeiterid);
        if (!card) errors.push(`Mitarbeiter Zeile ${i + 2}: mitarbeiterid fehlt`);
        return { cardNumber: card, firstName: ts(r.vorname), lastName: ts(r.nachname), provider: ts(r.dienstleister), activity: ts(r["tatigkeit"] ?? r["tätigkeit"]), active: true };
      });
      const entries: ClockImportInput["entries"] = [];
      atts.forEach((r, i) => {
        const line = `Anwesenheit Zeile ${i + 2}`;
        const card = ts(r.mitarbeiterid);
        const b = ts(r.time_begin), e = ts(r.time_end);
        if (!card) { errors.push(`${line}: mitarbeiterid fehlt`); return; }
        if (!ts(r.id)) { errors.push(`${line}: eindeutige Alt-ID fehlt`); return; }
        if (!/^\d+$/.test(b) || Number(b) <= 0) { errors.push(`${line}: time_begin ungültig oder fehlt ("${b}")`); return; }
        let end: string | null = null;
        if (e !== "" && e.toLowerCase() !== "null" && e !== "0") {
          if (!/^\d+$/.test(e)) { errors.push(`${line}: time_end ungültig ("${e}")`); return; }
          end = new Date(Number(e) * 1000).toISOString();
        }
        entries.push({ legacyId: ts(r.id), cardNumber: card, startedAt: new Date(Number(b) * 1000).toISOString(), endedAt: end });
      });
      return { payload: { employees, entries, legacyTimesAcknowledged: ack }, errors };
    } catch (x) { return { errors: ["Datei nicht lesbar: " + errMsg(x)] }; }
  }, [empText, attText, jsonText, ack]);

  const key = built.payload ? JSON.stringify(built.payload) : "";
  const canCommit = !!prev && prev.key === key && !prev.res.errors.length && ack && !built.errors.length;
  const reset = () => { setPrev(null); setDone(null); setErr(""); };
  const pick = (set: (s: string | null) => void) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; reset();
    try {
      if (f && f.size > 40 * 1024 * 1024) throw new Error("Datei ist größer als 40 MB. Bitte in kleinere Exportdateien aufteilen.");
      set(f ? await readText(f) : null);
    } catch (error) { set(null); setErr(errMsg(error)); }
  };

  const doPreview = async () => { setErr(""); setDone(null); try { const res = await preview.mutateAsync({ data: built.payload! }); setPrev({ key, res }); } catch (e) { setErr(errMsg(e)); } };
  const doCommit = async () => { setErr(""); try { const res = await commit.mutateAsync({ data: JSON.parse(prev!.key) }); setDone(res); setPrev(null); invalidate(); } catch (e) { setErr(errMsg(e)); } };

  const Res = ({ r, title }: { r: ClockImportResult; title: string }) => (
    <div className="rounded border p-3 text-sm space-y-1" data-testid={`result-${title}`}>
      <b>{title}</b>
      <div>Neue Mitarbeiter: {r.employeesAdded} · Neue Einträge: {r.entriesAdded} · Übersprungen (Duplikate): {r.skipped}</div>
      {r.errors.length > 0 && <ul className="list-disc ml-5 text-red-700 max-h-48 overflow-auto">{r.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </div>);

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4 max-w-3xl">
      <h2 className="font-semibold">Altdaten importieren</h2>
      <p className="text-sm text-slate-600">Zwei CSV-Dateien (mitarbeiter: id, mitarbeiterid, vorname, nachname, dienstleister, tatigkeit; anwesenheit: id, mitarbeiterid, time_begin, time_end als Unix-Sekunden) oder eine normalisierte JSON-Datei. Kartennummern werden als Text gelesen, führende Nullen bleiben erhalten. Bestehende Daten werden nie verändert; es wird kein SQL ausgeführt.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Mitarbeiter-CSV</Label><input type="file" accept=".csv,text/csv" onChange={pick(setEmpText)} disabled={!!jsonText} data-testid="input-file-employees" className="block text-sm" /></div>
        <div><Label>Anwesenheit-CSV</Label><input type="file" accept=".csv,text/csv" onChange={pick(setAttText)} disabled={!!jsonText} data-testid="input-file-attendance" className="block text-sm" /></div>
        <div className="sm:col-span-2"><Label>oder JSON (ClockImportInput)</Label><input type="file" accept=".json,application/json" onChange={pick(setJsonText)} data-testid="input-file-json" className="block text-sm" /></div>
      </div>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={(v) => { setAck(v === true); reset(); }} data-testid="check-legacy-ack" />
        <span>Mir ist bewusst: Die Altzeiten sind bereits gerundet; die ursprünglich gescannte Zeit kann nicht rekonstruiert werden.</span></label>
      {built.errors.length > 0 && <ul className="list-disc ml-5 text-sm text-red-700 max-h-48 overflow-auto" data-testid="list-parse-errors">{built.errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {built.payload && !built.errors.length && <div className="text-sm text-slate-600">Gelesen: {built.payload.employees.length} Mitarbeiter, {built.payload.entries.length} Einträge.</div>}
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={doPreview} disabled={!built.payload || !!built.errors.length || !ack || preview.isPending} data-testid="button-import-preview">Vorschau prüfen</Button>
        <Button onClick={doCommit} disabled={!canCommit || commit.isPending} data-testid="button-import-commit">Import bestätigen</Button>
      </div>
      {prev && <Res r={prev.res} title="Vorschau" />}
      {done && <Res r={done} title={done.errors.length ? "Nicht importiert – keine Daten übernommen" : "Importiert"} />}
    </div>
  );
}
