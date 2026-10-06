import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEinlagerungStateQueryKey, type EinlagerungState } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRecordActions } from "../use-einlagerung";
import { errMsg, P, type Model, type Rec } from "../lib";
import { lookupValue } from "./field-lookup";

export type ShelfArticleAction = { mode: "edit" | "move" | "remove"; rule: Rec };
const titles = { edit: "Geplanten Artikel bearbeiten", move: "Geplanten Artikel verschieben", remove: "Geplanten Artikel entfernen?" };

export function ShelfArticleActionDialog({ action, model, has, onClose }: {
  action: ShelfArticleAction; model: Model; has: (permission: string) => boolean; onClose: () => void;
}) {
  const { mode, rule } = action;
  const id = useId();
  const [priority, setPriority] = useState(String(rule.d.priority));
  const [groupId, setGroupId] = useState(rule.d.groupId == null ? "" : String(rule.d.groupId));
  const [note, setNote] = useState(String(rule.d.note ?? ""));
  const [target, setTarget] = useState("");
  const { save, remove, busy } = useRecordActions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const submitting = useRef(false);
  const article = model.articleById.get(Number(rule.d.articleId));
  const groups = model.groups.filter((g) => g.d.active !== false);
  const currentGroup = model.groupById.get(Number(rule.d.groupId));
  const sourceShelf = model.shelfById.get(Number(rule.d.shelfId));
  const options = model.shelves.filter((s) => {
    const aisle = model.aisleById.get(Number(s.d.aisleId));
    const hall = aisle && model.hallById.get(Number(aisle.d.hallId));
    return s.id !== Number(rule.d.shelfId) && s.d.active !== false &&
      !!aisle && aisle.d.active !== false && !!hall && hall.d.active !== false;
  }).map((s) => ({ value: String(s.id), inputLabel: String(s.d.name), label: model.shelfLabel(s) }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!has(P.strategy) || busy || submitting.current) return;
    let data = { ...rule.d };
    if (mode === "edit") {
      const n = priority.trim() === "" ? NaN : Number(priority);
      if (!Number.isInteger(n) || n < 1 || n > 9999) {
        toast({ title: "Priorität muss eine ganze Zahl von 1 bis 9999 sein", variant: "destructive" }); return;
      }
      if (groupId && !groups.some((g) => g.id === Number(groupId))) {
        toast({ title: "Bitte eine aktive Kundengruppe auswählen", variant: "destructive" }); return;
      }
      data = { ...data, priority: n, groupId: groupId ? Number(groupId) : null, note: note.trim() };
    }
    if (mode === "move") {
      const destination = lookupValue(options, target);
      if (!destination) {
        toast({ title: "Bitte ein anderes aktives Regal eindeutig auswählen", variant: "destructive" }); return;
      }
      if (model.rules.some((r) => r.id !== rule.id && r.d.active !== false &&
        Number(r.d.articleId) === Number(rule.d.articleId) && Number(r.d.shelfId) === Number(destination))) {
        toast({ title: "Dieser Artikel ist im Zielregal bereits geplant", variant: "destructive" }); return;
      }
      data = { ...data, shelfId: Number(destination) };
    }
    const latest = model.rules.find((r) => r.id === rule.id);
    if (!latest || latest.updatedAt !== rule.updatedAt) {
      toast({ title: "Die Zuordnung wurde inzwischen geändert", description: "Bitte schließen und erneut öffnen.", variant: "destructive" }); return;
    }
    submitting.current = true;
    try {
      if (mode === "remove") {
        // Deletes only the rule, never the master article or any inventory.
        await remove("rule", rule.id);
        qc.setQueryData<EinlagerungState>(getGetEinlagerungStateQueryKey(), (old) => old ? {
          ...old, records: old.records.filter((r) => r.id !== rule.id),
        } : old);
      } else {
        const saved = await save("rule", rule, data);
        qc.setQueryData<EinlagerungState>(getGetEinlagerungStateQueryKey(), (old) => old ? {
          ...old, records: [...old.records.filter((r) => r.id !== saved.id), saved],
        } : old);
      }
      toast({ title: mode === "edit" ? "Zuordnung gespeichert" : mode === "move" ? "Artikelplanung verschoben" : "Artikelplanung entfernt" });
      onClose();
    } catch (error) {
      toast({ title: "Änderung fehlgeschlagen", description: errMsg(error), variant: "destructive" });
    } finally { submitting.current = false; }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }} data-testid={`dialog-shelf-article-${mode}`}>
      <DialogHeader>
        <DialogTitle>{titles[mode]}</DialogTitle>
        <DialogDescription>
          {mode === "edit" ? "Priorität, Kundengruppe und Hinweis dieser Regalzuordnung ändern." :
            mode === "move" ? "Nur die geplante Zuordnung wird verschoben. Der tatsächliche Bestand bleibt unverändert." :
              "Nur die geplante Zuordnung wird dauerhaft entfernt. Artikelstammdaten, tatsächliche Bestände und Palettenkonten bleiben erhalten."}
        </DialogDescription>
      </DialogHeader>
      <p className="break-words text-sm font-medium">{String(article?.d.number ?? rule.d.articleId)}{article?.d.name ? ` – ${article.d.name}` : ""}
        <span className="block text-xs font-normal text-slate-500">{model.shelfLabel(sourceShelf)}</span></p>
      <form onSubmit={submit} className="space-y-4">
        {mode === "edit" && <>
          <div className="space-y-1.5"><Label htmlFor={`${id}-priority`}>Priorität</Label>
            <Input id={`${id}-priority`} type="number" min={1} max={9999} step={1} required value={priority}
              onChange={(e) => setPriority(e.target.value)} disabled={busy} data-testid="input-edit-planned-priority" /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-group`}>Kundengruppe</Label>
            <select id={`${id}-group`} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy}
              className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm" data-testid="select-edit-planned-group">
              <option value="">Keine</option>
              {currentGroup?.d.active === false && <option value={currentGroup.id} disabled>{String(currentGroup.d.name)} (inaktiv)</option>}
              {groups.map((g) => <option key={g.id} value={g.id}>{String(g.d.name)}</option>)}
            </select></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-note`}>Hinweis</Label>
            <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Optional"
              disabled={busy} data-testid="input-edit-planned-note" /></div>
        </>}
        {mode === "move" && <div className="space-y-1.5">
          <Label htmlFor={`${id}-target`}>Zielregal</Label>
          <Input id={`${id}-target`} list={`${id}-targets`} value={target} onChange={(e) => setTarget(e.target.value)}
            disabled={busy} required autoComplete="off" placeholder="Regalnummer eingeben oder Vorschlag wählen" data-testid="input-move-planned-shelf" />
          <datalist id={`${id}-targets`}>{options.map((o) => <option key={o.value} value={o.inputLabel} label={o.label} />)}</datalist>
          {options.length === 0 && <p className="text-sm text-amber-700">Kein anderes aktives Regal vorhanden.</p>}
        </div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy} data-testid="button-cancel-planned-action">Abbrechen</Button>
          <Button type="submit" variant={mode === "remove" ? "destructive" : "default"}
            disabled={busy || (mode === "move" && options.length === 0)} data-testid={`button-confirm-planned-${mode}`}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Speichern" : mode === "move" ? "Verschieben" : "Zuordnung entfernen"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
