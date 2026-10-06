import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Pencil, Plus, Search, Ban, Check, ScanLine, Loader2 } from "lucide-react";
import type { SearchEinlagerungParams } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SimpleSelect } from "@/pages/einlagerung/components/simple-select";
import { RecordDialog, type FieldSpec } from "@/pages/einlagerung/components/record-dialog";
import { useEinlagerungState, useRecordActions, useWarehouseSearch } from "@/pages/einlagerung/use-einlagerung";
import { errMsg, nf, P, toRec, useEinlagerungAccess, useModel, type D, type Rec } from "@/pages/einlagerung/lib";
import { suggestReservationShelf } from "@/pages/einlagerung/components/reservation-suggestion";

const STATUS = [{ value: "offen", label: "Offen" }, { value: "erledigt", label: "Erledigt" }, { value: "storniert", label: "Storniert" }];

function currentKw() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${w}.${y}`;
}

const EMPTY = { q: "", spedition: "", relation: "", termin: "", shelfId: "" };

export default function ScannerEinlagerungAuftraegePage() {
  const [, setLocation] = useLocation();
  const { has, isLoading: accessLoading } = useEinlagerungAccess();
  const allowed = has(P.view) || has(P.scan) || has(P.resCreate) || has(P.resEdit);
  const stateQ = useEinlagerungState(allowed);
  const model = useModel(stateQ.data);
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [resFilter, setResFilter] = useState("offen");
  const [edit, setEdit] = useState<Rec | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"search" | "reserve">("search");
  const { save, busy } = useRecordActions();
  const { toast } = useToast();

  const params = useMemo<SearchEinlagerungParams>(() => {
    const p: SearchEinlagerungParams = { mode: "auftraege" };
    if (applied.q.trim()) p.q = applied.q.trim();
    if (applied.spedition) p.spedition = applied.spedition;
    if (applied.relation.trim()) p.relation = applied.relation.trim();
    if (applied.termin.trim()) p.termin = applied.termin.trim();
    if (applied.shelfId) p.shelfId = Number(applied.shelfId);
    return p;
  }, [applied]);
  const q = useWarehouseSearch(params, allowed);

  const orders = (q.data?.orders ?? []) as D[];
  const grouped = useMemo(() => {
    const m = new Map<string, { shelf: string; spedition: string; relation: string; termin: string; calendarWeek: string; plusKw: string; paletten: number; n: number }>();
    for (const o of orders) {
      const g = { shelf: String(o.shelf ?? ""), spedition: String(o.spedition ?? ""), relation: String(o.relation ?? ""), termin: String(o.termin ?? ""), calendarWeek: String(o.calendarWeek ?? ""), plusKw: String(o.plusKw ?? "") };
      const k = Object.values(g).join("|");
      const e = m.get(k) ?? { ...g, paletten: 0, n: 0 };
      e.paletten += Number(o.paletten) || 0; e.n += 1;
      m.set(k, e);
    }
    return [...m.values()];
  }, [orders]);
  const totalPal = grouped.reduce((s, g) => s + g.paletten, 0);

  const allRes = useMemo(() => (q.data?.reservations ?? []).map(toRec), [q.data]);
  const resv = allRes.filter((r) => !resFilter || r.d.status === resFilter);
  const openCount = allRes.filter((r) => r.d.status === "offen").length;

  const canCreate = has(P.resCreate), canEdit = has(P.resEdit);
  const activeShelves = model.shelves.filter((s) => {
    const aisle = model.aisleById.get(Number(s.d.aisleId));
    const hall = aisle && model.hallById.get(Number(aisle.d.hallId));
    return s.d.active !== false && aisle?.d.active !== false && hall?.d.active !== false;
  });
  const proposedShelf = suggestReservationShelf(activeShelves, stateQ.data?.occupancy ?? [], model.reservations);
  const shelfOptions = activeShelves.concat(edit && !activeShelves.some((s) => s.id === Number(edit.d.shelfId))
    ? model.shelves.filter((s) => s.id === Number(edit.d.shelfId)) : []);
  const fields: FieldSpec[] = [
    { key: "shelfId", label: "Regal", type: "autocomplete", numeric: true, required: true,
      options: shelfOptions.map((s) => ({ value: String(s.id), label: model.shelfLabel(s),
        inputLabel: shelfOptions.filter((o) => String(o.d.name).toLowerCase() === String(s.d.name).toLowerCase()).length === 1 ? String(s.d.name) : model.shelfLabel(s) })),
      hint: proposedShelf ? `Systemvorschlag: ${model.shelfLabel(proposedShelf)}. Frei überschreibbar; bitte ein gepflegtes Regal verwenden. Voll gemeldete Regale werden nicht vorgeschlagen.` : "Regal frei eingeben oder einen Vorschlag aus den Stammdaten wählen." },
    { key: "carrierId", label: "Spedition (Modul)", type: "select", numeric: true, required: true, options: model.carriers.filter((r) => r.d.active).map((r) => ({ value: String(r.id), label: String(r.d.name) })) },
    { key: "relation", label: "Relation (optional)", type: "text" },
    { key: "termin", label: "Termin (KW.Jahr oder Datum)", type: "text", required: true, hint: "z. B. 47.2026 oder 18.11.2026" },
    { key: "plusKw", label: "Plus-KW", type: "text" },
    { key: "note", label: "Hinweis", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: STATUS, required: true },
  ];

  const setStatus = async (r: Rec, status: string) => {
    try { await save("reservation", r, { ...r.d, status }); toast({ title: `Reservierung ${status}` }); }
    catch (e) { toast({ title: "Statuswechsel fehlgeschlagen", description: errMsg(e), variant: "destructive" }); }
  };

  const header = (
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      <button onClick={() => setLocation("/scanner")} className="flex items-center gap-1 text-sm text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5" data-testid="button-scanner-back">
        <ChevronLeft className="w-4 h-4" />Zurück
      </button>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">COMET LKW - Scanner</div>
        <div className="font-bold">Einlagerung Aufträge</div>
      </div>
      <button onClick={() => setLocation("/scanner/einlagerung")} className="flex items-center gap-1 text-xs text-slate-700 border border-slate-200 rounded-md px-2 py-1.5" data-testid="link-article-scanner">
        <ScanLine className="w-4 h-4" />Artikel
      </button>
    </header>
  );

  if (accessLoading || (allowed && stateQ.isLoading)) {
    return <div className="min-h-[100dvh] bg-slate-100">{header}<main className="max-w-xl mx-auto p-4 space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></main></div>;
  }
  if (!allowed) {
    return <div className="min-h-[100dvh] bg-slate-100">{header}<p className="p-8 text-center text-sm text-slate-600" data-testid="no-access">Keine Berechtigung für die Einlagerung.</p></div>;
  }
  if (stateQ.isError) {
    return <div className="min-h-[100dvh] bg-slate-100">{header}<div className="p-6 text-sm text-red-700 space-y-3">{errMsg(stateQ.error)}<div><Button size="sm" variant="outline" onClick={() => stateQ.refetch()}>Erneut versuchen</Button></div></div></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      {header}
      <main className="max-w-xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 gap-1" role="tablist" aria-label="Auftrags-Scanner">
          {([["search", "Aufträge suchen"], ["reserve", "Vormerkungen"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value}
              tabIndex={view === value ? 0 : -1}
              aria-controls={`scanner-panel-${value}`} id={`scanner-tab-${value}`}
              data-testid={`scanner-tab-${value}`} onClick={() => setView(value)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                const next = e.key === "Home" ? "search" : e.key === "End" ? "reserve" : view === "search" ? "reserve" : "search";
                setView(next);
                document.getElementById(`scanner-tab-${next}`)?.focus();
              }}
              className={`rounded-lg px-3 py-3 text-sm font-semibold ${view === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
        <form className="rounded-xl border border-slate-200 bg-white p-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          const unchanged = (["q", "spedition", "relation", "termin", "shelfId"] as const)
            .every((key) => draft[key].trim() === applied[key].trim());
          setApplied({ ...draft });
          if (unchanged) void q.refetch();
        }}>
          <Input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            placeholder={view === "reserve" ? "Vormerkung: Regal, Spedition, Relation, Hinweis oder ID" : "Auftrag, Lieferung oder HU"}
            aria-label={view === "reserve" ? "Vormerkungen suchen" : "Aufträge suchen"} data-testid="input-orders-q" />
          <div className="grid grid-cols-2 gap-2">
            <SimpleSelect value={draft.spedition} onChange={(v) => setDraft({ ...draft, spedition: v })} allLabel="Alle Speditionen" options={model.carriers.map((r) => ({ value: String(r.d.name), label: String(r.d.name) }))} testId="filter-spedition" />
            <SimpleSelect value={draft.shelfId} onChange={(v) => setDraft({ ...draft, shelfId: v })} allLabel="Alle Regale" options={model.shelves.map((s) => ({ value: String(s.id), label: model.shelfLabel(s) }))} testId="filter-orders-shelf" />
            <Input value={draft.relation} onChange={(e) => setDraft({ ...draft, relation: e.target.value })} placeholder="Relation" data-testid="input-orders-relation" />
            <Input value={draft.termin} onChange={(e) => setDraft({ ...draft, termin: e.target.value })} placeholder="Datum oder KW.Jahr" data-testid="input-orders-termin" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" data-testid="button-orders-search"><Search className="w-4 h-4 mr-2" />Suchen</Button>
            <Button type="button" variant="outline" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}>Zurücksetzen</Button>
          </div>
        </form>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-slate-200 bg-white py-3"><div className="text-2xl font-bold" data-testid="text-total-pallets">{nf(totalPal)}</div><div className="text-[11px] uppercase tracking-wider text-slate-500">Paletten Aufträge</div></div>
          <div className="rounded-xl border border-slate-200 bg-white py-3"><div className="text-2xl font-bold" data-testid="text-open-reservations">{nf(openCount)}</div><div className="text-[11px] uppercase tracking-wider text-slate-500">Offene Vormerkungen</div></div>
        </div>

        {view === "search" && <section id="scanner-panel-search" role="tabpanel" aria-labelledby="scanner-tab-search" className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 font-semibold">Aufträge (gruppiert)</div>
          {q.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div>
          : q.isError ? <div className="p-4 text-sm text-red-700 space-y-2">{errMsg(q.error)}<div><Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div></div>
          : grouped.length === 0 ? <p className="p-6 text-center text-sm text-slate-500" data-testid="orders-empty">Keine Aufträge für diese Suche.</p>
          : <ul className="divide-y divide-slate-100">
              {grouped.map((g, i) => (
                <li key={i} className="px-4 py-3 flex items-center gap-3" data-testid={`row-order-${i}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{g.shelf || "Ohne Regal"} <span className="text-slate-500 font-normal">· {g.spedition || "-"}</span></div>
                    <div className="text-xs text-slate-500">{g.relation || "ohne Relation"} · {g.termin || "-"}{g.calendarWeek ? ` · KW ${g.calendarWeek}` : ""}{g.plusKw ? ` (+${g.plusKw} KW)` : ""} · {g.n} Pos.</div>
                  </div>
                  <div className="text-right"><div className="font-bold">{nf(g.paletten)}</div><div className="text-[10px] uppercase text-slate-500">Pal.</div></div>
                </li>
              ))}
            </ul>}
        </section>}

        {view === "reserve" && <section id="scanner-panel-reserve" role="tabpanel" aria-labelledby="scanner-tab-reserve" className="rounded-xl border border-slate-200 bg-white">
          {!canCreate && <p className="px-4 pt-3 text-sm text-slate-500">Keine Berechtigung für neue Vormerkungen.</p>}
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <span className="font-semibold mr-auto">Vormerkungen</span>
            <div className="w-32"><SimpleSelect value={resFilter} onChange={setResFilter} allLabel="Alle" options={STATUS} testId="filter-res-status" /></div>
            {canCreate && <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }} data-testid="button-new-reservation"><Plus className="w-4 h-4 mr-1" />Vormerken</Button>}
          </div>
          {q.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div>
          : q.isError ? <div className="p-4 text-sm text-red-700 space-y-2">{errMsg(q.error)}<div><Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div></div>
          : resv.length === 0 ? <p className="p-6 text-center text-sm text-slate-500" data-testid="reservations-empty">Keine Vormerkungen für diese Suche und diesen Status.</p>
          : <ul className="divide-y divide-slate-100">
              {resv.map((r) => (
                <li key={r.id} className="px-4 py-3 space-y-2" data-testid={`row-reservation-${r.id}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{model.shelfLabel(model.shelfById.get(Number(r.d.shelfId))) || "-"}</div>
                      <div className="text-xs text-slate-500">{String(r.d.speditionName || model.spedName(r.d.speditionId) || "-")}{r.d.relation ? ` · ${r.d.relation}` : ""}</div>
                      <div className="text-xs text-slate-500">Termin {String(r.d.termin ?? "")}{r.d.plusKw ? ` (+${r.d.plusKw} KW)` : ""}</div>
                      {r.d.note ? <div className="text-xs text-slate-600 mt-0.5">{String(r.d.note)}</div> : null}
                    </div>
                    <span className="text-[11px] uppercase tracking-wider border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{String(r.d.status)}</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEdit(r); setOpen(true); }} data-testid={`button-edit-reservation-${r.id}`}><Pencil className="w-3.5 h-3.5 mr-1" />Ändern</Button>
                      {r.d.status === "offen" ? <>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus(r, "erledigt")} data-testid={`button-complete-${r.id}`}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}Erledigt</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus(r, "storniert")} data-testid={`button-cancel-${r.id}`}><Ban className="w-3.5 h-3.5 mr-1" />Stornieren</Button>
                      </> : <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus(r, "offen")}>Wieder öffnen</Button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>}
        </section>}
      </main>

      <RecordDialog open={open} onOpenChange={setOpen} title={edit ? "Vormerkung bearbeiten" : "Neue Vormerkung"} kind="reservation" record={edit} fields={fields}
        defaults={{ status: "offen", plusKw: "", termin: applied.termin.trim() || currentKw(), relation: applied.relation.trim(),
          shelfId: proposedShelf?.id,
          carrierId: model.carriers.find((c) => c.d.name === applied.spedition)?.id }} />
    </div>
  );
}
