import { useMemo, useState } from "react";
import { useSearchEinlagerung, getSearchEinlagerungQueryKey } from "@workspace/api-client-react";
import type { EinlagerungState, SearchEinlagerungParams } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { SimpleSelect } from "./simple-select";
import { LocationCard } from "./location-card";
import { DATASET_LABELS, datasetOf, nf, type Model, type Rec } from "../lib";

function ShelfDetail({ shelf, model, state, has, onClose }: { shelf: Rec | null; model: Model; state: EinlagerungState; has: (k: string) => boolean; onClose: () => void }) {
  const params = useMemo<SearchEinlagerungParams>(() => ({ mode: "regal", shelfId: shelf?.id }), [shelf?.id]);
  const q = useSearchEinlagerung(params, { query: { enabled: !!shelf, queryKey: getSearchEinlagerungQueryKey(params), refetchInterval: 30_000, refetchIntervalInBackground: false } });
  const imported = { ist: !!datasetOf(state.datasets, "istbestand"), retouren: !!datasetOf(state.datasets, "retouren"), auftraege: !!datasetOf(state.datasets, "auftraege") };
  const loc = q.data?.locations.find((l) => l.shelf.id === shelf?.id) ?? q.data?.locations[0];
  const resv = model.reservations.filter((r) => Number(r.d.shelfId) === shelf?.id && r.d.status === "offen");
  return (
    <Dialog open={!!shelf} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Regal {String(shelf?.d.name ?? "")}</DialogTitle></DialogHeader>
        {q.isLoading && <Skeleton className="h-40" />}
        {q.isError && <p className="text-sm text-red-700">Details konnten nicht geladen werden.</p>}
        {loc && <LocationCard loc={loc} has={has} imported={imported} label={model.shelfLabel(shelf ?? undefined)} />}
        {resv.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-slate-500">Offene Reservierungen</div>
            {resv.map((r) => (
              <div key={r.id} className="text-sm rounded-md border border-slate-200 px-3 py-2">
                {model.spedName(r.d.speditionId) || "-"} / {String(r.d.relation ?? "")} / {String(r.d.termin ?? "")}{r.d.note ? ` - ${r.d.note}` : ""}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ShelfPlan({ state, model, has }: { state: EinlagerungState; model: Model; has: (k: string) => boolean }) {
  const [hall, setHall] = useState("");
  const [aisle, setAisle] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [hideFull, setHideFull] = useState(state.settings.hideFull);
  const [sel, setSel] = useState<Rec | null>(null);

  const occ = useMemo(() => new Map(state.occupancy.map((o) => [o.shelf, o])), [state.occupancy]);
  const assigned = useMemo(() => {
    const byShelf = new Map<number, { number: string; name: string; priority: number }[]>();
    for (const rule of model.rules) {
      if (rule.d.active === false) continue;
      const article = model.articleById.get(Number(rule.d.articleId));
      if (!article || article.d.active === false) continue;
      const shelfId = Number(rule.d.shelfId);
      const list = byShelf.get(shelfId) ?? [];
      list.push({ number: String(article.d.number), name: String(article.d.name ?? ""), priority: Number(rule.d.priority) });
      byShelf.set(shelfId, list);
    }
    for (const list of byShelf.values()) list.sort((a, b) => a.priority - b.priority || a.number.localeCompare(b.number, "de", { numeric: true }));
    return byShelf;
  }, [model.rules, model.articleById]);
  const ds = { ist: datasetOf(state.datasets, "istbestand"), ret: datasetOf(state.datasets, "retouren"), auf: datasetOf(state.datasets, "auftraege") };

  const aisles = model.aisles.filter((a) => a.d.active !== false && (!hall || String(a.d.hallId) === hall));
  const groups = aisles.filter((a) => !aisle || String(a.id) === aisle).map((a) => ({
    aisle: a,
    hall: model.hallById.get(Number(a.d.hallId)),
    shelves: model.shelves.filter((s) => Number(s.d.aisleId) === a.id && s.d.active !== false).filter((s) => {
      const o = occ.get(String(s.d.name));
      const used = !!o && (o.ist > 0 || o.retouren > 0 || o.auftraege > 0);
      if (hideFull && s.d.full) return false;
      if (status === "full" && !s.d.full) return false;
      if (status === "occupied" && !used) return false;
      if (status === "free" && (used || s.d.full)) return false;
      if (q && !String(s.d.name).toLowerCase().includes(q.toLowerCase()) &&
        !(assigned.get(s.id) ?? []).some((a) => a.number.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    }),
  })).filter((g) => g.shelves.length > 0 && g.hall?.d.active !== false);

  const staleMs = state.settings.staleHours * 3600_000;
  const chip = (label: string, d?: { importedAt: string }) => {
    const stale = d && Date.now() - new Date(d.importedAt).getTime() > staleMs;
    return (
      <Badge variant={!d ? "outline" : stale ? "destructive" : "secondary"} className="font-normal" key={label}>
        {label}: {d ? `${stale ? "veraltet, " : ""}${formatDistanceToNow(new Date(d.importedAt), { addSuffix: true, locale: de })}` : "nicht importiert"}
      </Badge>
    );
  };

  if (model.shelves.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500" data-testid="empty-plan">Noch keine Regale angelegt. Hallen, Gänge und Regale werden unter Stammdaten gepflegt.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chip(DATASET_LABELS.istbestand, ds.ist)}{chip(DATASET_LABELS.retouren, ds.ret)}{chip(DATASET_LABELS.auftraege, ds.auf)}
      </div>
      <div className="app-filter-bar border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center">
        <SimpleSelect value={hall} onChange={(v) => { setHall(v); setAisle(""); }} allLabel="Alle Hallen" options={model.halls.map((h) => ({ value: String(h.id), label: String(h.d.name) }))} testId="filter-hall" />
        <SimpleSelect value={aisle} onChange={setAisle} allLabel="Alle Gänge" options={aisles.map((a) => ({ value: String(a.id), label: String(a.d.name) }))} testId="filter-aisle" />
        <SimpleSelect value={status} onChange={setStatus} allLabel="Alle Status" options={[{ value: "free", label: "Frei" }, { value: "occupied", label: "Belegt" }, { value: "full", label: "Voll" }]} testId="filter-status" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Regal oder Artikelnummer" data-testid="filter-shelf-q" />
        <div className="flex items-center gap-2">
          <Switch id="hf" checked={hideFull} onCheckedChange={setHideFull} data-testid="switch-hide-full" />
          <Label htmlFor="hf" className="text-sm">Volle ausblenden</Label>
        </div>
      </div>

      {groups.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Keine Regale für diese Filter.</div>}
      {groups.map(({ aisle: a, hall: h, shelves }) => (
        <section key={a.id} className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-slate-500">{String(h?.d.name ?? "")}</span>
            <span className="font-semibold text-slate-900">Gang {String(a.d.name)}</span>
            <span className="text-xs text-slate-400 ml-auto">{shelves.length} Regale</span>
          </div>
          <div className="p-3 grid gap-2 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
            {shelves.map((s) => {
              const o = occ.get(String(s.d.name));
              const used = !!o && (o.ist > 0 || o.retouren > 0 || o.auftraege > 0);
              const articles = assigned.get(s.id) ?? [];
              const tileStatus = s.d.full ? "full" : used ? "occupied" : "free";
              const background = state.settings.colors[tileStatus];
              const hex = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16) / 255);
              const luminance = hex.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
              const foreground = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.179 ? "#0f172a" : "#ffffff";
              const secondary = foreground === "#ffffff" ? "#e2e8f0" : "#475569";
              const cell = (label: string, v: number | undefined, on: boolean) => (
                <div className="flex justify-between text-[11px]"><span style={{ color: secondary }}>{label}</span><span className={on ? "font-semibold" : ""} style={{ color: on ? foreground : secondary }}>{on ? nf(v ?? 0) : "-"}</span></div>
              );
              return (
                <button key={s.id} onClick={() => setSel(s)} data-testid={`tile-shelf-${s.id}`}
                   className={`text-left rounded-lg border p-2.5 transition-colors hover:border-slate-900 ${s.d.full ? "border-red-200" : used ? "border-slate-300" : "border-slate-200"}`}
                   style={{ backgroundColor: background, color: foreground }}>
                  <div className="flex items-center justify-between mb-1.5">
                     <span className="font-semibold text-sm" style={{ color: foreground }}>{String(s.d.name)}</span>
                     {s.d.full ? <span className="text-[10px] font-semibold uppercase" style={{ color: foreground }}>Voll</span> : null}
                  </div>
                   {articles.length > 0 && <div className="mb-2 text-[11px] leading-snug" style={{ color: foreground }} data-testid={`articles-shelf-${s.id}`}>
                     <span className="font-medium">Artikel: </span>
                     {articles.map((article, i) => <span key={i} className="inline-block mr-1" title={`${article.name} · Priorität ${article.priority}`}>{article.number}{i < articles.length - 1 ? "," : ""}</span>)}
                   </div>}
                  {cell("IST", o?.ist, !!ds.ist)}
                  {cell("Retouren", o?.retouren, !!ds.ret)}
                  {cell("Aufträge", o?.auftraege, !!ds.auf)}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <ShelfDetail shelf={sel} model={model} state={state} has={has} onClose={() => setSel(null)} />
    </div>
  );
}
