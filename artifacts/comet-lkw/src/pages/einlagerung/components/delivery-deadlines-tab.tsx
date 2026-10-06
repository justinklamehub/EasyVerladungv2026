import { useEffect, useMemo, useState } from "react";
import { useSearchEinlagerung, getSearchEinlagerungQueryKey } from "@workspace/api-client-react";
import type { EinlagerungState } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Download, Loader2, Printer, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEADLINE_LABELS, deadlineExcel, deadlinePrintHtml, filterDeadlineRows } from "./delivery-deadlines-output";
import { errMsg, datasetOf, nf, type D } from "../lib";
import {
  DEFAULT_DEADLINE_THRESHOLDS, DEADLINE_TIME_ZONE, classifyDeliveryOrders, deadlineSummary, validDeadlineThresholds,
  type DeadlineStatus,
} from "./delivery-deadlines";

const META: Record<DeadlineStatus, { label: string; cls: string }> = {
  critical: { label: DEADLINE_LABELS.critical, cls: "bg-red-100 text-red-800" },
  soon: { label: DEADLINE_LABELS.soon, cls: "bg-orange-100 text-orange-800" },
  upcoming: { label: DEADLINE_LABELS.upcoming, cls: "bg-yellow-100 text-yellow-800" },
  safe: { label: DEADLINE_LABELS.safe, cls: "bg-green-100 text-green-800" },
  week: { label: DEADLINE_LABELS.week, cls: "bg-blue-100 text-blue-800" },
  unknown: { label: DEADLINE_LABELS.unknown, cls: "bg-slate-200 text-slate-700" },
};
const ORDER: DeadlineStatus[] = ["critical", "soon", "upcoming", "safe", "week", "unknown"];

export function DeliveryDeadlinesTab({ state }: { state: EinlagerungState }) {
  const { toast } = useToast();
  const params = { mode: "auftraege" } as const;
  const q = useSearchEinlagerung(params, { query: { queryKey: getSearchEinlagerungQueryKey(params), refetchInterval: 30000, refetchIntervalInBackground: false } });
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<DeadlineStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const saved = state.settings.deadlineThresholds;
  const th = saved && validDeadlineThresholds(saved) ? saved : DEFAULT_DEADLINE_THRESHOLDS;
  const { criticalDays, soonDays, upcomingDays } = th;
  const orders = q.data?.orders as D[] | undefined;
  const rows = useMemo(() => classifyDeliveryOrders(orders ?? [], { criticalDays, soonDays, upcomingDays }, now),
    [orders, criticalDays, soonDays, upcomingDays, now]);
  const sum = useMemo(() => deadlineSummary(rows), [rows]);
  const kwRows = rows.filter((r) => r.dateLabel.startsWith("KW "));
  const kwSum = { orders: kwRows.length, pallets: kwRows.reduce((n, r) => n + (Number(r.order.paletten) || 0), 0) };
  const shown = filterDeadlineRows(rows, filter, search);
  const outputDisabled = q.isLoading || q.isError || shown.length === 0;
  const printShown = () => {
    if (outputDisabled) return;
    const popup = window.open("", "_blank", "width=1100,height=800");
    if (!popup) {
      toast({ title: "Druckfenster blockiert", description: "Bitte Pop-ups für diese App erlauben und erneut auf Drucken klicken.", variant: "destructive" });
      return;
    }
    try {
      popup.opener = null;
      popup.document.open();
      popup.document.write(deadlinePrintHtml(shown, filter, search));
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (error) {
      popup.close();
      toast({ title: "Drucken fehlgeschlagen", description: errMsg(error), variant: "destructive" });
    }
  };
  const exportShown = async () => {
    if (outputDisabled || exporting) return;
    setExporting(true);
    try {
      const buffer = await deadlineExcel(shown);
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `liefertermine-${new Date().toLocaleDateString("sv-SE", { timeZone: DEADLINE_TIME_ZONE })}.xlsx`;
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

  const ds = datasetOf(state.datasets, "auftraege");
  const ageH = ds ? (now.getTime() - new Date(ds.importedAt).getTime()) / 3600000 : 0;
  const stale = !!ds && ageH > state.settings.staleHours;
  const urgent = sum.critical.orders + sum.soon.orders;
  const overdue = rows.filter((r) => r.days != null && r.days < 0).length;

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white" data-testid="panel-delivery-deadlines">
      <div className="px-4 py-3 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Kritische Liefertermine</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={outputDisabled} onClick={printShown}
              title="Aktuell gefilterte Liefertermine drucken" data-testid="button-deadlines-print"><Printer className="w-4 h-4 mr-2" />Drucken</Button>
            <Button type="button" size="sm" variant="outline" disabled={outputDisabled || exporting} onClick={exportShown}
              title="Aktuell gefilterte Liefertermine als Excel-Datei exportieren" data-testid="button-deadlines-export">
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Exportieren</Button>
          </div>
        </div>
        {urgent > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="alert-deadline-warning">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{sum.critical.orders > 0 && <>{nf(sum.critical.orders)} kritische Aufträge ({nf(sum.critical.pallets)} Pal.){overdue > 0 ? `, davon ${nf(overdue)} überfällig` : ""}. </>}
              {sum.soon.orders > 0 && <>{nf(sum.soon.orders)} Aufträge bald fällig ({nf(sum.soon.pallets)} Pal.).</>}</span>
          </div>
        )}
         {sum.unknown.orders > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
           Bei {nf(sum.unknown.orders)} Aufträgen fehlt ein gültiger Liefertermin. Diese Termine bitte prüfen; eine Tageswarnung ist nicht möglich.
         </p>}
        <div className="flex flex-wrap gap-2">
          {ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(filter === s ? "all" : s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${META[s].cls} ${filter === s ? "ring-2 ring-slate-900" : ""}`} data-testid={`filter-deadline-${s}`}>
              {META[s].label}: {nf((s === "week" ? kwSum : sum[s]).pallets)} Pal. ({nf((s === "week" ? kwSum : sum[s]).orders)})
            </button>
          ))}
          {filter !== "all" && <Button size="sm" variant="ghost" onClick={() => setFilter("all")} data-testid="button-deadline-filter-reset">Alle anzeigen</Button>}
        </div>
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input aria-label="Regal, Spedition oder Relation suchen" placeholder="Regal, Spedition, Relation" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-deadline-search" />
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Kritisch bei {criticalDays} Tagen oder weniger (inkl. überfällig), bald fällig bis {soonDays}, demnächst bis {upcomingDays} Tage. Schwellen unter Einstellungen änderbar. Tage zählen als Kalendertage ({DEADLINE_TIME_ZONE}).</p>
          <p>Die Einstufung nutzt den Liefertermin laut Import. Plus-KW wird nur angezeigt und verschiebt Termine nicht automatisch. Die Liefertermin-Mail hat eine eigene Tagesfrist unter Einstellungen → E-Mail bzw. Berichte; die Warnfarben bleiben unabhängig davon.</p>
           <p>Bei KW-Terminen ist der Montag (KW-Beginn) maßgeblich für Resttage und Überfälligkeit. Auch diese Termine nutzen die eingestellten Warnstufen.</p>
          {ds ? <p data-testid="text-deadline-freshness" className={stale ? "text-amber-700 font-medium" : ""}>Auftragsimport: {new Date(ds.importedAt).toLocaleString("de-DE", { timeZone: DEADLINE_TIME_ZONE })} ({ds.filename}){stale && ` – veraltet (über ${state.settings.staleHours} Std.)`}</p>
            : <p data-testid="text-deadline-no-import" className="text-amber-700 font-medium">Noch kein Auftragsimport vorhanden.</p>}
        </div>
      </div>
      {q.isLoading ? <div className="p-4 space-y-2"><Skeleton className="h-8" /><Skeleton className="h-32" /></div>
        : q.isError ? (
          <div className="p-4 flex items-center justify-between gap-3 text-sm text-red-700" data-testid="error-deadlines">
            <span>Aufträge konnten nicht geladen werden: {errMsg(q.error)}</span>
            <Button size="sm" variant="outline" onClick={() => q.refetch()} data-testid="button-deadlines-retry">Erneut versuchen</Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500" data-testid="empty-deadlines">{rows.length === 0 ? "Keine Aufträge vorhanden." : "Keine Aufträge für diese Auswahl."}</p>
        ) : (
           <div className="min-w-0 [&>div]:max-h-[60vh]">
            <Table className="app-table">
              <caption className="sr-only">Aufträge nach Liefertermin aufsteigend sortiert</caption>
               <TableHeader className="sticky top-0 z-10"><TableRow>
                <TableHead scope="col">Status</TableHead><TableHead scope="col">Termin</TableHead><TableHead scope="col">Rest</TableHead><TableHead scope="col">Regal</TableHead>
                <TableHead scope="col">Spedition</TableHead><TableHead scope="col">Relation</TableHead><TableHead scope="col">Plus-KW</TableHead><TableHead scope="col" className="text-right">Paletten</TableHead>
              </TableRow></TableHeader>
              <TableBody>{shown.map((r, i) => (
                <TableRow key={`${r.order.shelf}-${r.order.speditionId}-${i}`} data-testid={`row-deadline-${i}`}>
                  <TableCell><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${META[r.status].cls}`}>{META[r.status].label}</span></TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{r.dateLabel}</TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">{r.days == null ? "–" : r.days < 0 ? `${-r.days} Tg. überfällig` : r.days === 0 ? "Heute" : `${r.days} Tg.`}
                    {r.dateLabel.startsWith("KW ") && <span className="block text-[10px]">KW-Beginn (Montag)</span>}</TableCell>
                  <TableCell>{String(r.order.shelf ?? "")}</TableCell>
                  <TableCell>{String(r.order.spedition ?? "")}</TableCell>
                  <TableCell>{String(r.order.relation ?? "")}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.order.plusKw ? String(r.order.plusKw) : "–"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{nf(Number(r.order.paletten) || 0)} Pal.</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
    </section>
  );
}
