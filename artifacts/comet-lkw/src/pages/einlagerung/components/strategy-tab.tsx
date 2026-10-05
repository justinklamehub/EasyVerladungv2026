import { useState } from "react";
import type { EinlagerungState } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EntityTable, ActiveBadge } from "./entity-table";
import { SimpleSelect } from "./simple-select";
import type { FieldSpec } from "./record-dialog";
import { useRecordActions } from "../use-einlagerung";
import { datasetOf, errMsg, P, type Model } from "../lib";

export function StrategyTab({ state, model, has }: { state: EinlagerungState; model: Model; has: (k: string) => boolean }) {
  const can = has(P.strategy);
  const [moveOpen, setMoveOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const { save } = useRecordActions();
  const { toast } = useToast();
  const t = (v: unknown) => String(v ?? "");
  const shelfOpts = model.shelves.map((s) => ({ value: String(s.id), label: model.shelfLabel(s) }));
  const affected = model.rules.filter((r) => String(r.d.shelfId) === from);

  const fields: FieldSpec[] = [
    { key: "articleId", label: "Artikel", type: "select", numeric: true, required: true, options: model.articles.map((a) => ({ value: String(a.id), label: `${t(a.d.number)} - ${t(a.d.name)}` })) },
    { key: "shelfId", label: "Regal", type: "select", numeric: true, required: true, options: shelfOpts },
    { key: "groupId", label: "Kundengruppe", type: "select", numeric: true, nullable: true, options: model.groups.map((g) => ({ value: String(g.id), label: t(g.d.name) })) },
    { key: "priority", label: "Priorität", type: "number", hint: "Niedrigere Zahl = höhere Priorität." },
    { key: "note", label: "Hinweis", type: "textarea" },
    { key: "active", label: "Aktiv", type: "bool" },
  ];

  const move = async () => {
    setBusy(true);
    let ok = 0;
    try {
      for (const r of affected) { await save("rule", r, { ...r.d, shelfId: Number(to) }); ok++; }
      toast({ title: `${ok} Zuweisungen verschoben`, description: "Nur die Strategie-Zuweisung wurde geändert, keine physische Umlagerung." });
      setMoveOpen(false); setFrom(""); setTo("");
    } catch (e) {
      toast({ title: `Abgebrochen nach ${ok} von ${affected.length}`, description: errMsg(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {!datasetOf(state.datasets, "strategie") && <p className="text-xs text-slate-500">Strategie-CSV noch nicht importiert. Regeln können hier auch manuell gepflegt werden.</p>}
      <EntityTable kind="rule" noun="Regel" records={[...model.rules].sort((a, b) => Number(a.d.priority ?? 0) - Number(b.d.priority ?? 0))} canEdit={can}
        defaults={{ active: true, priority: 1, groupId: null }}
        searchText={(r) => t(model.articleById.get(Number(r.d.articleId))?.d.number) + t(model.articleById.get(Number(r.d.articleId))?.d.name) + model.shelfLabel(model.shelfById.get(Number(r.d.shelfId))) + t(r.d.note)}
        fields={fields}
        extraActions={can && <Button size="sm" variant="outline" onClick={() => setMoveOpen(true)} data-testid="button-move-assignments"><ArrowRightLeft className="w-4 h-4 mr-1" />Zuweisung verschieben</Button>}
        columns={[
          { label: "Artikel", render: (r) => { const a = model.articleById.get(Number(r.d.articleId)); return <div><span className="font-mono">{t(a?.d.number)}</span><div className="text-xs text-slate-500">{t(a?.d.name)}</div></div>; } },
          { label: "Regal", render: (r) => model.shelfLabel(model.shelfById.get(Number(r.d.shelfId))) },
          { label: "Gruppe", render: (r) => { const g = model.groupById.get(Number(r.d.groupId)); return g ? <Badge variant="outline" style={{ borderColor: t(g.d.color), color: t(g.d.color) }}>{t(g.d.name)}</Badge> : "Alle"; } },
          { label: "Prio", render: (r) => t(r.d.priority) },
          { label: "Hinweis", render: (r) => <span className="max-w-[14rem] truncate block">{t(r.d.note)}</span> },
          { label: "Status", render: (r) => <ActiveBadge on={r.d.active} /> },
        ]} />
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Strategie-Zuweisung verschieben</DialogTitle>
            <DialogDescription>Ändert nur das Ziel-Regal der Strategie-Regeln. Es werden keine Paletten physisch bewegt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Von Regal</Label><SimpleSelect value={from} onChange={setFrom} options={shelfOpts} placeholder="Regal wählen" testId="select-move-from" /></div>
            <div className="space-y-1.5"><Label>Nach Regal</Label><SimpleSelect value={to} onChange={setTo} options={shelfOpts.filter((o) => o.value !== from)} placeholder="Regal wählen" testId="select-move-to" /></div>
            {from && <p className="text-sm text-slate-600">{affected.length} Regeln betroffen.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Abbrechen</Button>
            <Button disabled={!from || !to || affected.length === 0 || busy} onClick={move} data-testid="button-confirm-move">{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Verschieben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
