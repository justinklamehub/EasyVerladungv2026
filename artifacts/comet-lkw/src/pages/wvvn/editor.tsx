import { useRef, useState } from "react";
import { useUpdateWvvnSession, type WvvnMode, type WvvnSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODES, MODE_LABEL, errMsg, fmtNum, parseQty, sel, useInvalidateWvvn } from "./lib";

type Row = { key: string; id?: number; code: string; label: string; unit: string; qty: string };

export function SessionEditor({ session: s, onClose, onDone }: { session: WvvnSession; onClose: () => void; onDone: () => void }) {
  const baseRevision = useRef(s.revision).current;
  const [rows, setRows] = useState<Row[]>(() => s.items.map((i) => ({ key: `i${i.id}`, id: i.id, code: i.scannedCode, label: `${i.articleNumber} · ${i.articleName}`, unit: i.unit, qty: String(i.quantity).replace(".", ",") })));
  const [mode, setMode] = useState<WvvnMode>(s.mode);
  const [kware, setKware] = useState(s.kware);
  const [netto, setNetto] = useState(s.netto);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [nCode, setNCode] = useState("");
  const [nQty, setNQty] = useState("");
  const [err, setErr] = useState("");
  const m = useUpdateWvvnSession();
  const inv = useInvalidateWvvn();
  const addRow = () => {
    const q = parseQty(nQty);
    if (!nCode.trim() || q == null) { setErr("Neue Position: Code und gültige Menge erforderlich."); return; }
    setErr(""); setRows((r) => [...r, { key: `n${Date.now()}${r.length}`, code: nCode.trim(), label: `Neu: ${nCode.trim()}`, unit: "", qty: nQty }]); setNCode(""); setNQty("");
  };
  const save = () => {
    const items = [];
    for (const r of rows) {
      const q = parseQty(r.qty);
      if (q == null) { setErr(`Ungültige Menge bei ${r.label}.`); return; }
      items.push(r.id != null ? { id: r.id, quantity: q } : { code: r.code, quantity: q });
    }
    if (items.length < 1) { setErr("Mindestens eine Position erforderlich."); return; }
    const rs = reason.trim();
    if (rs.length < 3) { setErr("Begründung (mind. 3 Zeichen) erforderlich."); return; }
    if (s.reported && !ack) { setErr("Bitte die Berichts-Warnung bestätigen."); return; }
    setErr("");
    m.mutate({ id: s.id, data: { revision: baseRevision, mode, netto, kware, reason: rs, acknowledgeReported: ack, items } }, { onSuccess: () => { inv(); onDone(); }, onError: (e) => setErr(errMsg(e)) });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Liste #{s.id} bearbeiten</DialogTitle></DialogHeader>
      {s.reported && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Diese Liste wurde bereits in einem Bericht versendet. Der gesendete Bericht bleibt unverändert; die Korrektur wird nicht automatisch erneut gesendet.
          <label className="flex items-center gap-2 mt-2"><Switch checked={ack} onCheckedChange={setAck} data-testid="switch-ack-reported" />Verstanden, trotzdem korrigieren</label>
        </div>)}
      <div className="grid sm:grid-cols-3 gap-2">
        <div><Label>Modus</Label><select className={sel} value={mode} onChange={(e) => setMode(e.target.value as WvvnMode)} data-testid="edit-mode">{MODES.map((x) => <option key={x} value={x}>{MODE_LABEL[x]}</option>)}</select></div>
        <div><Label>Kategorie</Label><select className={sel} value={kware ? "k" : "r"} onChange={(e) => setKware(e.target.value === "k")} data-testid="edit-category"><option value="k">K-Ware</option><option value="r">Retoure</option></select></div>
        <label className="flex items-end gap-2 text-sm pb-2"><Switch checked={netto} onCheckedChange={setNetto} />Netto-Kunde</label>
      </div>
      <div className="divide-y rounded-md border">{rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 p-2 text-sm" data-testid={`edit-row-${r.key}`}>
          <div className="min-w-0 flex-1 truncate">{r.label}<span className="text-xs text-slate-500"> · {r.code}</span></div>
          <Input className="w-24" inputMode="decimal" value={r.qty} onChange={(e) => setRows((x) => x.map((y) => y.key === r.key ? { ...y, qty: e.target.value } : y))} />
          <span className="text-xs w-8">{r.unit}</span>
          <Button size="sm" variant="outline" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>Entfernen</Button>
        </div>))}
        {rows.length === 0 && <div className="p-3 text-xs text-slate-500">Keine Positionen.</div>}</div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[10rem]"><Label>Neue Position: Code</Label><Input value={nCode} onChange={(e) => setNCode(e.target.value)} data-testid="edit-new-code" /></div>
        <div className="w-28"><Label>Menge</Label><Input inputMode="decimal" value={nQty} onChange={(e) => setNQty(e.target.value)} data-testid="edit-new-qty" /></div>
        <Button variant="outline" onClick={addRow}>Hinzufügen</Button>
      </div>
      <p className="text-xs text-slate-500">Mengen in der Einheit der Position (Stück bzw. VE); der Server ordnet neue Codes dem Artikel zu. Gesamt aktuell: {fmtNum(s.pieces)} Stück.</p>
      <div><Label>Begründung</Label><Input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} data-testid="edit-reason" /></div>
      {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{err}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button disabled={m.isPending} onClick={save} data-testid="button-save-edit">Korrektur speichern</Button></div>
    </DialogContent></Dialog>
  );
}
