import { useMemo, useState } from "react";
import { useSearchEinlagerung, getSearchEinlagerungQueryKey } from "@workspace/api-client-react";
import type { EinlagerungState, SearchEinlagerungParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SimpleSelect } from "./simple-select";
import { RecordDialog, type FieldSpec } from "./record-dialog";
import { ConfirmDelete } from "./confirm-delete";
import { useRecordActions } from "../use-einlagerung";
import { datasetOf, errMsg, nf, P, toRec, type D, type Model, type Rec } from "../lib";

const STATUS = [{ value: "offen", label: "Offen" }, { value: "erledigt", label: "Erledigt" }, { value: "storniert", label: "Storniert" }];

export function OrdersTab({ state, model, has, reservationsOnly = false }: {
  state: EinlagerungState; model: Model; has: (k: string) => boolean; reservationsOnly?: boolean;
}) {
  const [draft, setDraft] = useState({ q: "", spedition: "", relation: "", termin: "", shelfId: "" });
  const [applied, setApplied] = useState(draft);
  const [resFilter, setResFilter] = useState("offen");
  const [edit, setEdit] = useState<Rec | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Rec | null>(null);
  const { save, remove } = useRecordActions();
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
  const q = useSearchEinlagerung(params, { query: { queryKey: getSearchEinlagerungQueryKey(params), refetchInterval: 30_000, refetchIntervalInBackground: false } });
  const imported = !!datasetOf(state.datasets, "auftraege");
  const canCreate = has(P.resCreate), canEdit = has(P.resEdit);

  const fields: FieldSpec[] = [
    { key: "shelfId", label: "Regal", type: "select", numeric: true, required: true, options: model.shelves.map((s) => ({ value: String(s.id), label: model.shelfLabel(s) })) },
    { key: "carrierId", label: "Spedition", type: "select", numeric: true, required: true, options: model.carriers.filter((r) => r.d.active).map((r) => ({ value: String(r.id), label: String(r.d.name) })) },
    { key: "relation", label: "Relation", type: "text" },
    { key: "termin", label: "Termin (Datum / KW.Jahr)", type: "text", required: true },
    { key: "plusKw", label: "Plus-KW", type: "text" },
    { key: "note", label: "Hinweis", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: STATUS, required: true },
  ];

  const resv = (q.data?.reservations ?? []).map(toRec).filter((r) => !resFilter || r.d.status === resFilter);
  const setStatus = async (r: Rec, status: string) => {
    try { await save("reservation", r, { ...r.d, status }); toast({ title: `Reservierung ${status}` }); }
    catch (e) { toast({ title: "Statuswechsel fehlgeschlagen", description: errMsg(e), variant: "destructive" }); }
  };
  const orders = (q.data?.orders ?? []) as D[];

  return (
    <div className="space-y-6">
      <form className="app-filter-bar border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2" onSubmit={(e) => {
        e.preventDefault();
        const unchanged = (["q", "spedition", "relation", "termin", "shelfId"] as const)
          .every((key) => draft[key].trim() === applied[key].trim());
        setApplied({ ...draft });
        if (unchanged) void q.refetch();
      }}>
        <Input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          placeholder={reservationsOnly ? "Vormerkung, Regal, Hinweis oder ID" : "Suche"}
          aria-label={reservationsOnly ? "Vormerkungen suchen" : "Aufträge und Vormerkungen suchen"} data-testid="input-orders-q" />
        <SimpleSelect value={draft.spedition} onChange={(v) => setDraft({ ...draft, spedition: v })} allLabel="Alle Speditionen" options={model.carriers.map((r) => ({ value: String(r.d.name), label: String(r.d.name) }))} testId="filter-spedition" />
        <Input value={draft.relation} onChange={(e) => setDraft({ ...draft, relation: e.target.value })} placeholder="Relation" data-testid="input-orders-relation" />
        <Input placeholder="Datum oder KW.Jahr" value={draft.termin} onChange={(e) => setDraft({ ...draft, termin: e.target.value })} data-testid="input-orders-termin" />
        <SimpleSelect value={draft.shelfId} onChange={(v) => setDraft({ ...draft, shelfId: v })} allLabel="Alle Regale" options={model.shelves.map((s) => ({ value: String(s.id), label: String(s.d.name) }))} testId="filter-orders-shelf" />
        <Button type="submit" data-testid="button-orders-search"><Search className="w-4 h-4 mr-2" />Suchen</Button>
      </form>

      {!reservationsOnly && <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-900">Aufträge</div>
        {!imported ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="orders-not-imported">Auftragsdaten nicht importiert.</p>
        ) : q.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div>
        : q.isError ? (
          <div className="p-6 text-sm text-red-700 flex items-center gap-3">{errMsg(q.error)}<Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>
        ) : orders.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Keine Aufträge für diese Filter.</p> : (
          <div className="overflow-x-auto">
            <Table className="app-table">
              <TableHeader><TableRow><TableHead>Regal</TableHead><TableHead>Spedition</TableHead><TableHead>Relation</TableHead><TableHead>Termin</TableHead><TableHead>Kalenderwoche</TableHead><TableHead>Plus-KW</TableHead><TableHead className="text-right">Paletten</TableHead></TableRow></TableHeader>
              <TableBody>
                {orders.map((o, i) => (
                  <TableRow key={i} data-testid={`row-order-${i}`}>
                    <TableCell className="font-medium">{String(o.shelf ?? "")}</TableCell><TableCell>{String(o.spedition ?? "")}</TableCell>
                    <TableCell>{String(o.relation ?? "")}</TableCell><TableCell>{String(o.termin ?? "")}</TableCell><TableCell>{String(o.calendarWeek ?? "")}</TableCell>
                    <TableCell>{String(o.plusKw ?? "")}</TableCell><TableCell className="text-right">{nf(Number(o.paletten) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 mr-auto">Vormerkungen</span>
          <div className="w-40"><SimpleSelect value={resFilter} onChange={setResFilter} allLabel="Alle Status" options={STATUS} testId="filter-res-status" /></div>
          {canCreate && <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }} data-testid="button-new-reservation"><Plus className="w-4 h-4 mr-1" />Neue Vormerkung</Button>}
        </div>
        {q.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div>
        : q.isError ? <div className="p-6 text-sm text-red-700 flex items-center gap-3">{errMsg(q.error)}<Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>
        : resv.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Keine Vormerkungen für diese Suche und diesen Status.</p> : (
          <div className="overflow-x-auto">
            <Table className="app-table">
              <TableHeader><TableRow><TableHead>Regal</TableHead><TableHead>Spedition</TableHead><TableHead>Relation</TableHead><TableHead>Termin</TableHead><TableHead>Hinweis</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {resv.map((r) => (
                  <TableRow key={r.id} data-testid={`row-reservation-${r.id}`}>
                    <TableCell className="font-medium">{String(model.shelfById.get(Number(r.d.shelfId))?.d.name ?? "-")}</TableCell>
                    <TableCell>{String(r.d.speditionName || model.spedName(r.d.speditionId) || "-")}</TableCell>
                    <TableCell>{String(r.d.relation ?? "")}</TableCell>
                    <TableCell>{String(r.d.termin ?? "")}{r.d.plusKw ? ` (+${r.d.plusKw} KW)` : ""}</TableCell>
                    <TableCell className="max-w-[16rem] truncate">{String(r.d.note ?? "")}</TableCell>
                    <TableCell>{canEdit ? <div className="w-32"><SimpleSelect value={String(r.d.status)} onChange={(v) => setStatus(r, v)} options={STATUS} testId={`select-res-status-${r.id}`} /></div> : <Badge variant="secondary">{String(r.d.status)}</Badge>}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {canEdit && <Button size="icon" variant="ghost" aria-label="Vormerkung bearbeiten" title="Bearbeiten" onClick={() => { setEdit(r); setOpen(true); }} data-testid={`button-edit-reservation-${r.id}`}><Pencil className="w-4 h-4" /></Button>}
                      {canEdit && <Button size="icon" variant="ghost" aria-label="Vormerkung löschen" title="Löschen" onClick={() => setDel(r)} data-testid={`button-delete-reservation-${r.id}`}><Trash2 className="w-4 h-4" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <RecordDialog open={open} onOpenChange={setOpen} title={edit ? "Vormerkung bearbeiten" : "Neue Vormerkung"} kind="reservation" record={edit} fields={fields} defaults={{ status: "offen", plusKw: "" }} />
      <ConfirmDelete open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Vormerkung löschen?" description="Die Vormerkung wird dauerhaft entfernt."
        onConfirm={async () => { if (!del) return; try { await remove("reservation", del.id); toast({ title: "Vormerkung gelöscht" }); setDel(null); } catch (e) { toast({ title: "Löschen fehlgeschlagen", description: errMsg(e), variant: "destructive" }); } }} />
    </div>
  );
}
