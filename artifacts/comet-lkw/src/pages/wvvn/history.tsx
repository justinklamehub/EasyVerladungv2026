import { useMemo, useState } from "react";
import { useGetWvvnSession, type WvvnSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SessionEditor } from "./editor";
import { MODES, MODE_LABEL, catLabel, downloadCsv, errMsg, fmtDateTime, fmtNum, sel } from "./lib";

export function History({ sessions, truncated, from, to, setFrom, setTo, canExport, canEdit, loading }: {
  sessions: WvvnSession[]; truncated: boolean; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; canExport: boolean; canEdit: boolean; loading: boolean;
}) {
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const shown = useMemo(() => sessions.filter((s) => (!mode || s.mode === mode) && (!status || s.status === status)), [sessions, mode, status]);
  const total = shown.reduce((a, s) => a + s.pieces, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div><Label>Von</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" /></div>
        <div><Label>Bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" /></div>
        <div><Label>Modus</Label><select className={sel} value={mode} onChange={(e) => setMode(e.target.value)} data-testid="select-mode"><option value="">Alle</option>{MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select></div>
        <div><Label>Status</Label><select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status"><option value="">Alle</option><option value="open">Offen</option><option value="done">Abgeschlossen</option></select></div>
      </div>
      {truncated && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800" data-testid="text-truncated">Es werden nur die neuesten 300 Listen angezeigt. Zeitraum einschränken, um ältere zu sehen.</div>}
      <p className="text-xs text-slate-500" data-testid="text-totals">Summe der angezeigten Daten: {shown.length} Listen, {fmtNum(total)} Stück (ohne nicht angezeigte Listen).</p>
      {loading ? <Skeleton className="h-40" /> : shown.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Keine Listen im gewählten Zeitraum.</div>
      ) : (
        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>
            {["Nr.", "Modus", "Netto", "Kategorie", "Status", "Erfasst von", "Erstellt", "Abgeschlossen", "Pos.", "Stück"].map((h) => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(s.id)} data-testid={`row-session-${s.id}`}>
                <td className="px-3 py-2">#{s.id}{s.legacy ? " (Archiv)" : ""}</td><td className="px-3 py-2">{MODE_LABEL[s.mode]}</td>
                <td className="px-3 py-2">{s.netto ? "Ja" : "Nein"}</td><td className="px-3 py-2">{catLabel(s.kware)}</td>
                <td className="px-3 py-2">{s.status === "open" ? "Offen" : "Abgeschlossen"}</td><td className="px-3 py-2">{s.actor}</td>
                <td className="px-3 py-2">{fmtDateTime(s.createdAt)}</td><td className="px-3 py-2">{fmtDateTime(s.finishedAt)}</td>
                <td className="px-3 py-2">{s.itemCount}</td><td className="px-3 py-2 font-medium">{fmtNum(s.pieces)}</td></tr>))}</tbody></table>
        </div>
      )}
      {open != null && <Detail id={open} canExport={canExport} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Detail({ id, canExport, canEdit, onClose }: { id: number; canExport: boolean; canEdit: boolean; onClose: () => void }) {
  const q = useGetWvvnSession(id, { query: { queryKey: [`/api/wvvn/sessions/${id}`], enabled: true } });
  const [err, setErr] = useState("");
  const s = q.data;
  const [editing, setEditing] = useState(false);
  if (editing && s) return <SessionEditor session={s} onClose={() => setEditing(false)} onDone={onClose} />;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Liste #{id}</DialogTitle></DialogHeader>
        {q.isLoading && <Skeleton className="h-32" />}
        {q.isError && <div className="text-sm text-red-700">Fehler: {errMsg(q.error)} <Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>}
        {s && (
          <div className="space-y-3 text-sm">
            <p>{MODE_LABEL[s.mode]} · Netto: {s.netto ? "Ja" : "Nein"} · Kategorie: {catLabel(s.kware)} · {s.status === "open" ? "Offen" : "Abgeschlossen"} · {s.actor} · {fmtNum(s.pieces)} Stück{s.legacy ? " · Archiv" : ""}</p>
            {canExport && <Button size="sm" variant="outline" data-testid="button-export-session" onClick={() => { setErr(""); downloadCsv(`sessions/${id}/csv`, `wvvn-liste-${id}.csv`).catch((e) => setErr(errMsg(e))); }}>CSV exportieren</Button>}
            {canEdit && s.status === "done" && !s.legacy && <Button size="sm" className="ml-2" onClick={() => setEditing(true)} data-testid="button-edit-session">Liste bearbeiten</Button>}
            {s.reported && <p className="text-xs text-amber-700">Bereits in einem Bericht gemeldet.</p>}
            {err && <p className="text-red-700">{err}</p>}
            <table className="w-full"><thead className="text-xs text-slate-500"><tr><th className="text-left py-1">Artikel</th><th className="text-left">Code</th><th className="text-right">Menge</th><th className="text-right">Stück</th><th className="text-right">Zeit</th></tr></thead>
              <tbody>{s.items.map((it) => <tr key={it.id} className="border-t"><td className="py-1">{it.articleNumber} · {it.articleName}</td><td>{it.scannedCode}</td><td className="text-right">{fmtNum(it.quantity)} {it.unit}{it.unit === "VE" ? ` ×${fmtNum(it.veFactor)}` : ""}</td><td className="text-right">{fmtNum(it.pieces)}</td><td className="text-right">{fmtDateTime(it.createdAt)}</td></tr>)}</tbody></table>
            {s.items.length === 0 && <p className="text-slate-500">Keine Positionen.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
