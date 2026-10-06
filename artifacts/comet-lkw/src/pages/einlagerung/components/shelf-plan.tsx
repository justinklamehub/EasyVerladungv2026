import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useSearchEinlagerung, getSearchEinlagerungQueryKey } from "@workspace/api-client-react";
import type { EinlagerungState, SearchEinlagerungParams } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { SimpleSelect } from "./simple-select";
import { LocationCard } from "./location-card";
import { ShelfMatrix } from "./shelf-matrix";
import { compareShelvesDescending } from "./shelf-layout";
import { ShelfTiles } from "./shelf-tiles";
import { ShelfStatusDialog, type ShelfAction } from "./shelf-status-dialog";
import { ShelfLegend } from "./shelf-legend";
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, filtersActive, matrixCounts, nextTarget, orderedShelves, scrollToShelf, shelfMatches, type Art, type MatrixFilters, type StatusFilter } from "./matrix-model";
import { DATASET_LABELS, datasetOf, errMsg, type Model, type Rec } from "../lib";
import { contentRows, loadSearchText, type LoadView } from "./shelf-load-content";
import { openReservationsByShelf } from "./shelf-reservations";
import { useShelfPlanPreference } from "./use-shelf-plan-preference";

function ShelfDetail({ shelf, model, state, has, onClose }: { shelf: Rec | null; model: Model; state: EinlagerungState; has: (k: string) => boolean; onClose: () => void }) {
  const params = useMemo<SearchEinlagerungParams>(() => ({ mode: "regal", shelfId: shelf?.id }), [shelf?.id]);
  const q = useSearchEinlagerung(params, { query: { enabled: !!shelf, queryKey: getSearchEinlagerungQueryKey(params), refetchInterval: 30_000, refetchIntervalInBackground: false } });
  const imported = { ist: !!datasetOf(state.datasets, "istbestand"), retouren: !!datasetOf(state.datasets, "retouren"), auftraege: !!datasetOf(state.datasets, "auftraege") };
  const loc = q.data?.locations.find((l) => l.shelf.id === shelf?.id);
  const resv = model.reservations.filter((r) => Number(r.d.shelfId) === shelf?.id && r.d.status === "offen");
  return (
    <Dialog open={!!shelf} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regal {String(shelf?.d.name ?? "")}</DialogTitle>
          <DialogDescription className="sr-only">IST-Bestand, Retouren und Aufträge des ausgewählten Regals.</DialogDescription>
        </DialogHeader>
        {q.isLoading && <Skeleton className="h-40" />}
        {q.isError && <p className="text-sm text-red-700">Details konnten nicht geladen werden.</p>}
        {loc && <LocationCard loc={loc} has={has} imported={imported} label={model.shelfLabel(shelf ?? undefined)} separateStock />}
        {!q.isLoading && !q.isError && q.data && !loc && <p className="text-sm text-slate-500">{q.data.message || "Keine Daten für dieses Regal gefunden."}</p>}
        {resv.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-slate-500">Offene Reservierungen</div>
            {resv.map((r) => (
              <div key={r.id} className="text-sm rounded-md border border-slate-200 px-3 py-2">
                <span className="font-semibold">Vorgemerkt: </span>{String(r.d.speditionName || model.carriers.find((c) => c.id === Number(r.d.carrierId))?.d.name || model.spedName(r.d.speditionId) || "-")} / {String(r.d.relation ?? "")} / {String(r.d.termin ?? "")}{r.d.note ? ` - ${r.d.note}` : ""}
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
  const [status, setStatus] = useState<StatusFilter>("");
  const [orders, setOrders] = useState(false);
  const [returns, setReturns] = useState(false);
  const [q, setQ] = useState("");
  const [hideFull, setHideFull] = useState(state.settings.hideFull);
  const [sel, setSel] = useState<Rec | null>(null);
  const [action, setAction] = useState<ShelfAction | null>(null);
  const preference = useShelfPlanPreference();
  const { view, contentMode } = preference;
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [fs, setFs] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const jumpFocus = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const occ = useMemo(() => new Map(state.occupancy.map((o) => [o.shelf, o])), [state.occupancy]);
  const assigned = useMemo(() => {
    const byShelf = new Map<number, Art[]>();
    for (const rule of model.rules) {
      if (rule.d.active === false) continue;
      const article = model.articleById.get(Number(rule.d.articleId));
      if (!article || article.d.active === false) continue;
      const shelfId = Number(rule.d.shelfId);
      const list = byShelf.get(shelfId) ?? [];
      const group = model.groupById.get(Number(rule.d.groupId));
      list.push({ id: rule.id, number: String(article.d.number), name: String(article.d.name ?? ""),
        priority: Number(rule.d.priority), color: String(group?.d.color ?? "#e2e8f0"), group: String(group?.d.name ?? "") });
      byShelf.set(shelfId, list);
    }
    for (const list of byShelf.values()) list.sort((a, b) => a.priority - b.priority || a.number.localeCompare(b.number, "de", { numeric: true }));
    return byShelf;
  }, [model.rules, model.articleById, model.groupById]);
  const ds = { ist: datasetOf(state.datasets, "istbestand"), ret: datasetOf(state.datasets, "retouren"), auf: datasetOf(state.datasets, "auftraege") };
  const reservations = useMemo(() => openReservationsByShelf(model.reservations, model.carriers, model.spedName),
    [model.reservations, model.carriers, model.spedName]);
  const loadParams = { mode: "lagerplan" } as const;
  const loadsQ = useSearchEinlagerung(loadParams, { query: {
    queryKey: getSearchEinlagerungQueryKey(loadParams), enabled: contentMode === "orders" || contentMode === "returns",
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  } });
  const loads = useMemo(() => new Map((loadsQ.data?.locations ?? []).map((loc) =>
    [loc.shelf.id, { orders: loc.orders, retouren: loc.retouren }])), [loadsQ.data]);
  const loadView: LoadView = { mode: contentMode, byShelf: loads, carriers: model.carriers, reservations,
    imported: !!(contentMode === "orders" ? ds.auf : ds.ret),
    loading: loadsQ.isLoading, error: loadsQ.isError };

  const aisles = model.aisles.filter((a) => a.d.active !== false && (!hall || String(a.d.hallId) === hall));
  const groups = useMemo(() => model.aisles
    .filter((a) => a.d.active !== false && (!hall || String(a.d.hallId) === hall) && (!aisle || String(a.id) === aisle))
    .map((a) => ({ aisle: a, hall: model.hallById.get(Number(a.d.hallId)),
      shelves: model.shelves.filter((s) => Number(s.d.aisleId) === a.id && s.d.active !== false).sort(compareShelvesDescending) }))
    .filter((g) => g.shelves.length > 0 && g.hall?.d.active !== false), [model.aisles, model.shelves, model.hallById, hall, aisle]);

  const filters: MatrixFilters = { status, orders, returns, hideFull, q };
  const active = filtersActive(filters);
  const all = useMemo(() => orderedShelves(groups), [groups]);
  const matches = useMemo(() => all.filter((s) => shelfMatches(s, occ.get(String(s.d.name)),
    contentMode === "planned" ? assigned.get(s.id) ?? [] : [],
    { status, orders, returns, hideFull, q },
    contentMode === "planned" ? "" : loadSearchText(contentRows(loadView, s.id)))),
    [all, occ, assigned, status, orders, returns, hideFull, q, contentMode, loads, reservations]);
  const matchIds = useMemo(() => (active ? new Set(matches.map((s) => s.id)) : null), [active, matches]);
  const matchIdList = useMemo(() => matches.map((s) => s.id), [matches]);
  const counts = useMemo(() => matrixCounts(all, occ, assigned), [all, occ, assigned]);
  const target = targetId != null && matchIdList.includes(targetId) ? targetId : null;
  const targetPos = target != null ? matchIdList.indexOf(target) + 1 : 0;
  const idsRef = useRef(matchIdList); idsRef.current = matchIdList;

  const jump = useCallback((dir: 1 | -1, focus = true) => {
    setTargetId((cur) => nextTarget(idsRef.current, cur != null && idsRef.current.includes(cur) ? cur : null, dir));
    jumpFocus.current = focus; setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (nonce === 0 || target == null) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-shelf-id="${target}"]`);
    if (!el) return;
    if (view === "matrix" && scroller.current) scrollToShelf(scroller.current, el);
    else el.scrollIntoView({ block: "center", inline: "center" });
    if (jumpFocus.current) el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, contentMode]);

  // Typing a search jumps to the first hit without stealing input focus.
  useEffect(() => {
    if (!q.trim()) { setTargetId(null); return; }
    setTargetId(null);
    if (idsRef.current.length > 0) jump(1, false);
  }, [q, contentMode, jump]);
  useEffect(() => {
    if (contentMode !== "planned" && q.trim() && target == null && (contentMode === "reservations" || loadsQ.data) && matchIdList.length > 0) jump(1, false);
  }, [contentMode, q, target, loadsQ.data, matchIdList, jump]);

  useEffect(() => {
    if (!fs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return;
      setFs(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey, true); };
  }, [fs]);

  const reset = () => { setHall(""); setAisle(""); setStatus(""); setOrders(false); setReturns(false); setHideFull(false); setQ(""); setTargetId(null); };
  const openAction = (s: Rec, full: boolean) => setAction({ shelfId: s.id, full });

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

  const tog = (on: boolean, set: (v: boolean) => void, label: string, id: string) => (
    <button type="button" aria-pressed={on} onClick={() => set(!on)} data-testid={id}
      className={`h-9 px-3 rounded-md border text-sm ${on ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`}>{label}</button>
  );
  const stat = (label: string, n: number, id: string) => (
    <div className="px-2.5 py-1 rounded-md border border-slate-200 bg-white" data-testid={id}><span className="font-semibold text-slate-900 tabular-nums">{n}</span> <span className="text-xs text-slate-500">{label}</span></div>
  );

  return (
    <div ref={root} className={fs ? "fixed inset-0 z-40 bg-slate-50 p-3 flex flex-col gap-2 overflow-y-auto" : "min-w-0 space-y-3"} data-testid="shelf-plan" data-fullscreen={fs || undefined}>
      <div className="flex flex-wrap gap-2">
        {chip(DATASET_LABELS.istbestand, ds.ist)}{chip(DATASET_LABELS.retouren, ds.ret)}{chip(DATASET_LABELS.auftraege, ds.auf)}
      </div>
      <div className="flex flex-wrap gap-1.5 text-sm" aria-label="Kennzahlen" data-testid="matrix-counts">
        {stat("Regale", counts.total, "count-total")}{stat("frei", counts.free, "count-free")}{stat("belegt", counts.occupied, "count-occupied")}
        {stat("voll", counts.full, "count-full")}{stat("mit Aufträgen", counts.orders, "count-orders")}{stat("mit Retouren", counts.returns, "count-returns")}{stat("nicht verplant", counts.unplanned, "count-unplanned")}
      </div>
      <div className="app-filter-bar border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-center">
        <SimpleSelect value={hall} onChange={(v) => { setHall(v); setAisle(""); }} allLabel="Alle Hallen" options={model.halls.map((h) => ({ value: String(h.id), label: String(h.d.name) }))} testId="filter-hall" />
        <SimpleSelect value={aisle} onChange={setAisle} allLabel="Alle Gänge" options={aisles.map((a) => ({ value: String(a.id), label: String(a.d.name) }))} testId="filter-aisle" />
        <SimpleSelect value={status} onChange={(v) => setStatus(v as StatusFilter)} allLabel="Alle Status" options={[{ value: "free", label: "Frei" }, { value: "occupied", label: "Belegt" }, { value: "full", label: "Voll" }]} testId="filter-status" />
        <div className="flex items-center gap-2">
          <Switch id="hf" checked={hideFull} onCheckedChange={setHideFull} data-testid="switch-hide-full" />
          <Label htmlFor="hf" className="text-sm">Volle abblenden</Label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-2">{tog(orders, setOrders, "Mit Aufträgen", "filter-orders")}{tog(returns, setReturns, "Mit Retouren", "filter-returns")}</div>
        <div className="flex min-w-0 items-center gap-1.5 sm:col-span-2 lg:col-span-2">
          <Input type="search" className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)}
            aria-label={contentMode === "planned" ? "Regal oder Artikel suchen" : contentMode === "orders" ? "Regal oder Auftrag suchen" : contentMode === "reservations" ? "Regal oder Reservierung suchen" : "Regal oder Retoure suchen"}
            placeholder={contentMode === "planned" ? "Regal oder Artikel suchen" : contentMode === "orders" || contentMode === "reservations" ? "Regal, Spedition, Relation oder Termin" : "Regal, Kunde oder Parcours"}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); jump(e.shiftKey ? -1 : 1); } }} data-testid="filter-shelf-q" />
          <Button type="button" variant="outline" size="icon" aria-label="Vorheriger Treffer" disabled={matches.length === 0} onClick={() => jump(-1)} data-testid="button-match-prev"><ChevronUp className="w-4 h-4" /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Nächster Treffer" disabled={matches.length === 0} onClick={() => jump(1)} data-testid="button-match-next"><ChevronDown className="w-4 h-4" /></Button>
          <span className="text-xs text-slate-600 whitespace-nowrap tabular-nums" aria-live="polite" data-testid="text-match-count">{active ? `${targetPos ? `${targetPos} von ` : ""}${matches.length} Treffer` : ""}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Regalinhalt">
          {([["planned", "Geplante Artikel"], ["orders", "Aufträge"], ["returns", "Retouren"], ["reservations", "Offene Reservierungen"]] as const).map(([mode, label]) =>
            <button key={mode} type="button" aria-pressed={contentMode === mode} data-testid={`content-${mode}`}
              disabled={preference.disabled} onClick={() => preference.update({ contentMode: mode })}
              className={`px-3 py-1 rounded ${contentMode === mode ? "bg-slate-900 text-white" : "text-slate-700"}`}>{label}</button>)}
        </div>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Ansicht">
          {([["matrix", "Matrix"], ["tiles", "Kacheln"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} disabled={preference.disabled} onClick={() => preference.update({ view: v })} data-testid={`view-${v}`}
              className={`px-3 py-1 rounded ${view === v ? "bg-slate-900 text-white" : "text-slate-700"}`}>{l}</button>
          ))}
        </div>
        {view === "matrix" && (
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5" role="group" aria-label="Zoom">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Verkleinern" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} data-testid="button-zoom-out"><Minus className="w-4 h-4" /></Button>
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} value={zoom} onChange={(e) => setZoom(clampZoom(Number(e.target.value)))} aria-label="Zoom in Prozent" aria-valuetext={`${zoom} Prozent`} className="w-24 accent-slate-900" data-testid="range-zoom" />
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Vergrößern" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} data-testid="button-zoom-in"><Plus className="w-4 h-4" /></Button>
            <button type="button" className="px-1.5 text-xs tabular-nums text-slate-700 min-w-[3rem]" onClick={() => setZoom(ZOOM_DEFAULT)} aria-label="Zoom auf 100 Prozent zurücksetzen" data-testid="button-zoom-reset">{zoom}%</button>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={!active && !hall && !aisle} data-testid="button-reset-filters"><RotateCcw className="w-4 h-4 mr-1.5" />Filter zurücksetzen</Button>
        <Button type="button" variant="outline" size="sm" className="ml-auto" aria-pressed={fs} onClick={() => setFs((v) => !v)} data-testid="button-fullscreen">
          {fs ? <Minimize2 className="w-4 h-4 mr-1.5" /> : <Maximize2 className="w-4 h-4 mr-1.5" />}{fs ? "Vollbild beenden" : "Vollbild"}
        </Button>
      </div>
      {(preference.loading || preference.saving) && <p role="status" className="text-sm text-slate-500">
        {preference.saving ? "Lageransicht wird gespeichert …" : "Gespeicherte Lageransicht wird geladen …"}
      </p>}
      {(preference.loadError || preference.saveError) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {preference.loadError || preference.saveError}
        {preference.loadError && <Button size="sm" variant="outline" className="ml-2" onClick={preference.retry}>Erneut versuchen</Button>}
      </div>}
      <ShelfLegend colors={state.settings.colors} mode={contentMode} />
      {(contentMode === "orders" || contentMode === "returns") && loadsQ.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        Aufträge und Retouren konnten nicht geladen werden: {errMsg(loadsQ.error)}
        <Button size="sm" variant="outline" className="ml-2" onClick={() => loadsQ.refetch()}>Erneut versuchen</Button>
      </div>}
      {(contentMode === "orders" || contentMode === "returns") && !loadView.imported && <p className="text-sm text-slate-500">
        {contentMode === "orders" ? "Aufträge" : "Retouren"} wurden noch nicht importiert.
      </p>}
      {contentMode === "reservations" && <p className="text-sm text-slate-500" data-testid="reservation-notice">
        Nur offene Reservierungen: vorgemerkt, noch nicht eingelagert. Belegung und Palettenzahlen bleiben unverändert.
        {!all.some((s) => reservations.has(s.id)) && " Keine offenen Reservierungen in dieser Hallen- und Gangauswahl."}
      </p>}

      {groups.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500" data-testid="empty-groups">Keine Regale für diese Hallen- und Gangauswahl.</div>}
      {groups.length > 0 && active && matches.length === 0 && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center gap-3" data-testid="empty-matches">
          Kein Regal entspricht den Filtern. Die Matrix bleibt unverändert, alle Regale sind abgeblendet.
          <Button type="button" size="sm" variant="outline" onClick={reset}>Filter zurücksetzen</Button>
        </div>
      )}
      {view === "matrix" && groups.length > 0 && (
        <div className={fs ? "flex-1 min-h-0" : ""}>
          <ShelfMatrix groups={groups} occ={occ} assigned={assigned} colors={state.settings.colors} istImported={!!ds.ist} retImported={!!ds.ret} aufImported={!!ds.auf}
            zoom={zoom} matchIds={matchIds} targetId={target} has={has} onSelect={setSel} onAction={openAction} scrollerRef={scroller} fullscreen={fs} loadView={loadView} />
        </div>
      )}
      {view === "tiles" && groups.length > 0 && (
        <ShelfTiles groups={groups} occ={occ} assigned={assigned} colors={state.settings.colors} imported={{ ist: !!ds.ist, ret: !!ds.ret, auf: !!ds.auf }}
          matchIds={matchIds} targetId={target} has={has} onSelect={setSel} onAction={openAction} loadView={loadView} />
      )}
      <ShelfDetail shelf={sel} model={model} state={state} has={has} onClose={() => setSel(null)} />
      <ShelfStatusDialog action={action} model={model} has={has} onClose={() => setAction(null)} />
    </div>
  );
}
