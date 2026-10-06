import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetEinlagerungStateQueryKey, type EinlagerungState } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRecordActions } from "../use-einlagerung";
import { errMsg, P, type Model, type Rec } from "../lib";
import { ShelfArticleActionDialog, type ShelfArticleAction } from "./shelf-article-action-dialog";

const text = (v: unknown) => String(v ?? "").trim().toLocaleLowerCase("de-DE");
const title = (article: Rec) => [article.d.number, article.d.name].filter(Boolean).join(" – ");

export function ShelfPlannedArticles({ shelf, model, has }: {
  shelf: Rec; model: Model; has: (permission: string) => boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [priority, setPriority] = useState("1");
  const [groupId, setGroupId] = useState("");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<ShelfArticleAction | null>(null);
  const { save, busy } = useRecordActions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const submitting = useRef(false);
  const rules = model.rules.filter((r) => r.d.active !== false && Number(r.d.shelfId) === shelf.id)
    .filter((r) => model.articleById.get(Number(r.d.articleId))?.d.active !== false &&
      model.articleById.has(Number(r.d.articleId)))
    .sort((a, b) => Number(a.d.priority) - Number(b.d.priority) || a.id - b.id);
  const assigned = new Set(rules.map((r) => Number(r.d.articleId)));
  const articles = model.articles.filter((a) => a.d.active !== false);
  const groups = model.groups.filter((g) => g.d.active !== false);
  const needle = text(query);
  const matches = needle ? articles.filter((a) =>
    [a.d.number, a.d.ean, a.d.name].some((v) => text(v).includes(needle)))
    .sort((a, b) => Number([b.d.number, b.d.ean].some((v) => text(v) === needle)) -
      Number([a.d.number, a.d.ean].some((v) => text(v) === needle))) : [];
  const aisle = model.aisleById.get(Number(shelf.d.aisleId));
  const hall = aisle && model.hallById.get(Number(aisle.d.hallId));
  const canAdd = has(P.strategy) && shelf.d.active !== false &&
    !!aisle && aisle.d.active !== false && !!hall && hall.d.active !== false;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdd || busy || submitting.current) return;
    const exact = articles.filter((a) => [a.d.number, a.d.ean, a.d.name].some((v) => text(v) === needle && needle));
    const article = selectedId != null ? articles.find((a) => a.id === selectedId) : exact.length === 1 ? exact[0] : undefined;
    if (!article) {
      toast({ title: "Bitte einen Artikel aus den Suchtreffern auswählen", variant: "destructive" }); return;
    }
    if (assigned.has(article.id)) {
      toast({ title: "Dieser Artikel ist bereits für das Regal geplant", variant: "destructive" }); return;
    }
    const n = priority.trim() === "" ? NaN : Number(priority);
    if (!Number.isInteger(n) || n < 1 || n > 9999) {
      toast({ title: "Priorität muss eine ganze Zahl von 1 bis 9999 sein", variant: "destructive" }); return;
    }
    if (groupId && !groups.some((g) => g.id === Number(groupId))) {
      toast({ title: "Bitte eine gültige Kundengruppe auswählen", variant: "destructive" }); return;
    }
    submitting.current = true;
    try {
      const record = await save("rule", null, {
        articleId: article.id, shelfId: shelf.id, groupId: groupId ? Number(groupId) : null,
        priority: n, note: note.trim(), active: true,
      });
      // Show the server-confirmed assignment immediately; the shared hook also
      // refreshes shelf searches, the matrix and the strategy view.
      qc.setQueryData<EinlagerungState>(getGetEinlagerungStateQueryKey(), (old) => old ? {
        ...old, records: [...old.records.filter((r) => r.id !== record.id), record],
      } : old);
      setQuery(""); setSelectedId(null); setPriority("1"); setGroupId(""); setNote("");
      toast({ title: "Artikel zum Regal hinzugefügt", description: `${article.d.number} → ${shelf.d.name}` });
    } catch (error) {
      toast({ title: "Artikel konnte nicht hinzugefügt werden", description: errMsg(error), variant: "destructive" });
    } finally { submitting.current = false; }
  };

  return (
    <section className="space-y-3" data-testid="section-shelf-planned-articles">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Geplante Artikel ({rules.length})</h3>
        {rules.length === 0 ? <p className="text-sm text-slate-500">Noch keine Artikel für dieses Regal geplant.</p> :
          rules.map((r) => {
            const article = model.articleById.get(Number(r.d.articleId))!;
            const group = model.groupById.get(Number(r.d.groupId));
            return <div key={r.id} className="rounded-md border border-slate-200 border-l-4 bg-white px-3 py-2 text-sm"
              style={{ borderLeftColor: String(group?.d.color ?? "#94a3b8") }} data-testid={`planned-article-${r.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-1">
                <span className="min-w-0 break-words font-medium">{title(article)}</span>
                <span className="shrink-0 text-xs text-slate-500">Priorität {r.d.priority}</span>
              </div>
              {group && <p className="text-xs text-slate-500">{String(group.d.name)}</p>}
              {article.d.ean && <p className="text-xs text-slate-500">EAN: {String(article.d.ean)}</p>}
              {r.d.note && <p className="mt-1 break-words text-xs text-slate-600">{String(r.d.note)}</p>}
              {has(P.strategy) && <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => setAction({ mode: "edit", rule: r })}
                  className="bg-slate-700 hover:bg-slate-800" data-testid={`button-edit-planned-${r.id}`}>Bearbeiten</Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => setAction({ mode: "move", rule: r })}
                  className="bg-blue-600 hover:bg-blue-700" data-testid={`button-move-planned-${r.id}`}>Verschieben</Button>
                <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => setAction({ mode: "remove", rule: r })}
                  data-testid={`button-remove-planned-${r.id}`}>Entfernen</Button>
              </div>}
            </div>;
          })}
      </div>
      {canAdd && <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="form-shelf-add-article">
        <Label htmlFor={`${id}-search`} className="text-xs font-semibold uppercase text-slate-500">Artikel hinzufügen</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id={`${id}-search`} value={query} disabled={busy} autoComplete="off"
            placeholder="Artikelnummer, EAN oder Artikelname suchen…" className="min-w-0 flex-1"
            onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }} data-testid="input-shelf-article-search" />
          <Button type="submit" disabled={busy || !needle} className="shrink-0 bg-green-700 hover:bg-green-800" data-testid="button-shelf-add-article">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Hinzufügen
          </Button>
        </div>
        {needle && selectedId == null && <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white" aria-label="Artikelsuchtreffer">
          {matches.length === 0 ? <p className="p-3 text-sm text-slate-500">Kein aktiver Artikel gefunden.</p> :
            matches.slice(0, 20).map((article) => <button key={article.id} type="button" disabled={busy || assigned.has(article.id)}
              onClick={() => { setSelectedId(article.id); setQuery(title(article)); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 focus-visible:bg-slate-100 disabled:text-slate-400"
              data-testid={`shelf-article-option-${article.id}`}>
              <span className="font-medium">{title(article)}</span>
              {article.d.ean && <span className="ml-2 text-xs text-slate-500">EAN: {String(article.d.ean)}</span>}
              {assigned.has(article.id) && <span className="ml-2 text-xs">Bereits geplant</span>}
            </button>)}
          {matches.length > 20 && <p className="px-3 py-2 text-xs text-slate-500">Weitere Treffer vorhanden. Bitte Suche eingrenzen.</p>}
        </div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[5rem_10rem_minmax(0,1fr)]">
          <div className="space-y-1"><Label htmlFor={`${id}-priority`} className="text-[10px] font-semibold uppercase text-slate-500">Prio</Label>
            <Input id={`${id}-priority`} type="number" min={1} max={9999} step={1} required value={priority}
              onChange={(e) => setPriority(e.target.value)} disabled={busy} data-testid="input-shelf-article-priority" /></div>
          <div className="space-y-1"><Label htmlFor={`${id}-group`} className="text-[10px] font-semibold uppercase text-slate-500">Kundengruppe</Label>
            <select id={`${id}-group`} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy}
              className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm" data-testid="select-shelf-article-group">
              <option value="">Keine</option>{groups.map((g) => <option key={g.id} value={g.id}>{String(g.d.name)}</option>)}
            </select></div>
          <div className="space-y-1"><Label htmlFor={`${id}-note`} className="text-[10px] font-semibold uppercase text-slate-500">Hinweis</Label>
            <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Optional"
              disabled={busy} data-testid="input-shelf-article-note" /></div>
        </div>
      </form>}
      {action && has(P.strategy) && <ShelfArticleActionDialog key={`${action.mode}-${action.rule.id}`} action={action}
        model={model} has={has} onClose={() => setAction(null)} />}
    </section>
  );
}
