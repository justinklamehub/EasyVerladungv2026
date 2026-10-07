import { useEffect, useMemo, useState } from "react";
import { useSearchEinlagerung, getSearchEinlagerungQueryKey } from "@workspace/api-client-react";
import type { EinlagerungState, SearchEinlagerungParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Loader2, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SimpleSelect } from "./simple-select";
import { RecordDialog, type FieldSpec } from "./record-dialog";
import { ConfirmDelete } from "./confirm-delete";
import { OrderMultiFilter } from "./order-multi-filter";
import { emptyOrderFilters, matchesOrderFilters, orderFacetOptions, orderFilterRow, summarizeOrders, type FilterRow, type OrderFilters } from "./orders-filters";
import { ordersExcel, ordersPrintHtml } from "./orders-output";
import { useRecordActions } from "../use-einlagerung";
import { datasetOf, errMsg, nf, P, toRec, type D, type Model, type Rec } from "../lib";

const STATUS = [{ value: "offen", label: "Offen" }, { value: "erledigt", label: "Erledigt" }, { value: "storniert", label: "Storniert" }];

export function OrdersTab({ state, model, has, reservationsOnly = false }: {
  state: EinlagerungState; model: Model; has: (k: string) => boolean; reservationsOnly?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filters, setFilters] = useState<OrderFilters>(emptyOrderFilters);
  const [exporting, setExporting] = useState(false);
  const [resFilter, setResFilter] = useState("offen");
  const [edit, setEdit] = useState<Rec | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Rec | null>(null);
  const { save, remove } = useRecordActions();
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  const params = useMemo<SearchEinlagerungParams>(() => {
    const p: SearchEinlagerungParams = { mode: "auftraege", groupByDelivery: true };
    if (appliedSearch) p.q = appliedSearch;
    return p;
  }, [appliedSearch]);
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

  const reservationFilterRow = (r: Rec): FilterRow => ({
    shelf: String(model.shelfById.get(Number(r.d.shelfId))?.d.name ?? ""),
    spedition: String(r.d.speditionName || model.carriers.find((c) => c.id === Number(r.d.carrierId) ||
      (r.d.speditionId != null && c.d.speditionId === r.d.speditionId))?.d.name || ""),
    relation: String(r.d.relation ?? ""), termin: String(r.d.termin ?? ""), plusKw: String(r.d.plusKw ?? ""),
  });
  const allReservations = (q.data?.reservations ?? []).map(toRec).filter((r) => !resFilter || r.d.status === resFilter);
  const allOrders = (q.data?.orders ?? []) as D[];
  const orders = allOrders.filter((o) => matchesOrderFilters(orderFilterRow(o), filters));
  const resv = allReservations.filter((r) => matchesOrderFilters(reservationFilterRow(r), filters));
  const facetRows = [
    ...(!reservationsOnly ? allOrders.map(orderFilterRow) : []),
    ...(reservationsOnly ? allReservations.map(reservationFilterRow) : []),
  ];
  const stats = summarizeOrders(orders);
  const outputDisabled = !imported || q.isLoading || q.isError || q.isFetching ||
    searchText.trim() !== appliedSearch || orders.length === 0;
  const printOrders = () => {
    if (outputDisabled) return;
    const popup = window.open("", "_blank", "width=1100,height=800");
    if (!popup) {
      toast({ title: "Druckfenster blockiert", description: "Bitte Pop-ups für diese App erlauben und erneut auf Drucken klicken.", variant: "destructive" });
      return;
    }
    try {
      popup.opener = null;
      popup.document.open();
      popup.document.write(ordersPrintHtml(orders, filters, appliedSearch));
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (error) {
      popup.close();
      toast({ title: "Drucken fehlgeschlagen", description: errMsg(error), variant: "destructive" });
    }
  };
  const exportOrders = async () => {
    if (outputDisabled || exporting) return;
    setExporting(true);
    try {
      const buffer = await ordersExcel(orders, filters, appliedSearch);
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `auftraege-${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast({ title: "Export fehlgeschlagen", description: errMsg(error), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };
  const activeFilterCount = Object.values(filters).reduce((n, values) => n + values.length, 0) + (searchText.trim() ? 1 : 0);
  const setStatus = async (r: Rec, status: string) => {
    try { await save("reservation", r, { ...r.d, status }); toast({ title: `Reservierung ${status}` }); }
    catch (e) { toast({ title: "Statuswechsel fehlgeschlagen", description: errMsg(e), variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <form className="app-filter-bar border p-3 space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (searchText.trim() === appliedSearch) void q.refetch();
        else setAppliedSearch(searchText.trim());
      }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 items-start">
        <Input value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder={reservationsOnly ? "Vormerkung, Regal, Hinweis oder ID" : "Suche"}
          aria-label={reservationsOnly ? "Vormerkungen suchen" : "Aufträge suchen"} data-testid="input-orders-q" />
        {([
          ["spedition", "Speditionen", "filter-spedition"],
          ["relation", "Relationen", "input-orders-relation"],
          ["termin", "Termine / KW", "input-orders-termin"],
          ["shelf", "Regale", "filter-orders-shelf"],
        ] as const).map(([key, label, testId]) =>
          <OrderMultiFilter key={key} label={label} value={filters[key]}
            onChange={(value) => setFilters((previous) => ({ ...previous, [key]: value }))}
            options={orderFacetOptions(facetRows, filters, key)}
            allowCustom={key === "relation" || key === "termin"} testId={testId} />
        )}
        <Button type="submit" data-testid="button-orders-search"><Search className="w-4 h-4 mr-2" />Suchen</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Mehrfachauswahl möglich · Filter werden automatisch angewendet</span>
          {activeFilterCount > 0 && <Button type="button" size="sm" variant="ghost" data-testid="button-orders-reset" onClick={() => {
            setFilters(emptyOrderFilters()); setSearchText(""); setAppliedSearch("");
          }}>Alle Filter zurücksetzen ({activeFilterCount})</Button>}
          {q.isFetching && <span role="status">Wird aktualisiert …</span>}
        </div>
      </form>

      {!q.isLoading && !q.isError && <div className={`grid grid-cols-2 ${reservationsOnly ? "md:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4"} gap-3`} data-testid="orders-summary">
        {(!reservationsOnly ? [
          ["Aufträge", stats.orders, "orders"],
          ["Paletten", stats.pallets, "pallets"],
          ["Regale", stats.shelves, "shelves"],
          ["Speditionen", stats.carriers, "carriers"],
        ] : [["Vormerkungen", resv.length, "reservations"]]).map(([label, count, key]) =>
          <div key={key} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-2xl font-semibold text-slate-900 tabular-nums" data-testid={`orders-count-${key}`}>{nf(Number(count))}</div>
          </div>
        )}
        {!reservationsOnly && <p className="col-span-full text-xs text-slate-500">
          Aktuelles Filterergebnis · {nf(stats.positions)} Auftragspositionen.
          {stats.unidentified > 0 && <> {nf(stats.unidentified)} Positionen ohne Liefernummer werden separat als Auftrag gezählt.</>}
          {" "}Paletten mit HU-Nummer werden nur einmal gezählt.
        </p>}
      </div>}

      {!reservationsOnly && <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-900">Aufträge</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={outputDisabled}
              onClick={printOrders} title="Aktuell gefilterte Aufträge drucken" data-testid="button-orders-print">
              <Printer className="w-4 h-4 mr-2" />Drucken
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={outputDisabled || exporting}
              onClick={exportOrders} title="Aktuell gefilterte Aufträge als Excel-Datei exportieren" data-testid="button-orders-export">
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Exportieren
            </Button>
          </div>
        </div>
        {!imported ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="orders-not-imported">Auftragsdaten nicht importiert.</p>
        ) : q.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div>
        : q.isError ? (
          <div className="p-6 text-sm text-red-700 flex items-center gap-3">{errMsg(q.error)}<Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>
        ) : orders.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Keine Aufträge für diese Filter.</p> : (
          <div className="overflow-x-auto">
            <Table className="app-table">
              <TableHeader><TableRow><TableHead>Liefernummer</TableHead><TableHead>Regal</TableHead><TableHead>Spedition</TableHead><TableHead>Relation</TableHead><TableHead>Termin</TableHead><TableHead>Kalenderwoche</TableHead><TableHead>Plus-KW</TableHead><TableHead className="text-right">Paletten</TableHead></TableRow></TableHeader>
              <TableBody>
                {orders.map((o, i) => (
                  <TableRow key={i} data-testid={`row-order-${i}`}>
                    <TableCell>{String(o.deliveryNumber || "—")}</TableCell>
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

      {reservationsOnly && <section className="rounded-xl border border-slate-200 bg-white">
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
      </section>}

      {reservationsOnly && <RecordDialog open={open} onOpenChange={setOpen} title={edit ? "Vormerkung bearbeiten" : "Neue Vormerkung"} kind="reservation" record={edit} fields={fields} defaults={{ status: "offen", plusKw: "" }} />}
      {reservationsOnly && <ConfirmDelete open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Vormerkung löschen?" description="Die Vormerkung wird dauerhaft entfernt."
        onConfirm={async () => { if (!del) return; try { await remove("reservation", del.id); toast({ title: "Vormerkung gelöscht" }); setDel(null); } catch (e) { toast({ title: "Löschen fehlgeschlagen", description: errMsg(e), variant: "destructive" }); } }} />}
    </div>
  );
}
