import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboard, customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { LiveAlerts, type LiveAlert } from "./dashboard/live-alerts";
import { Empty, FlowChart, HBar, Kpi, Panel, Punctuality, STATUS_COLORS } from "./dashboard/panels";
import { PRESETS, fmtRange, resolvePreset, validateRange, type Preset } from "./dashboard/range";

const TOP_N = 10;

export default function DashboardPage() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [preset, setPreset] = useState<Preset>("today");
  const [applied, setApplied] = useState(() => resolvePreset("today"));
  const [draft, setDraft] = useState(applied);
  const draftError = validateRange(draft.from, draft.to);
  const effective = preset === "custom" ? applied : resolvePreset(preset);

  const pick = (p: Preset) => {
    setPreset(p);
    const r = p === "custom" ? effective : resolvePreset(p);
    setApplied(r); setDraft(r);
  };
  const params = { dateFrom: effective.from, dateTo: effective.to };

  const dash = useGetDashboard(params, {
    query: {
      queryKey: ["dashboard", uid, params.dateFrom, params.dateTo],
      staleTime: 5 * 60_000, refetchOnWindowFocus: false, enabled: uid !== null,
    },
  });
  const live = useQuery<{ alerts: LiveAlert[]; checkedAt: string }>({
    queryKey: ["dashboard-live-alerts", uid],
    queryFn: ({ signal }) => customFetch("/api/dashboard/live-alerts", { signal }),
    refetchInterval: 30_000, enabled: uid !== null,
  });

  const data = dash.data;
  const a = data?.analytics;
  const refresh = () => { void dash.refetch(); void live.refetch(); };
  const spedTop = (data?.bySpedition ?? []).map((s) => ({ name: s.speditionName, count: s.count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, "de")).slice(0, TOP_N);
  const spedCut = (data?.bySpedition.length ?? 0) > TOP_N;
  const statusData = (data?.byStatus ?? []).map((s) => ({ name: s.status, count: s.count }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 overflow-x-hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-effective-range">
            Zeitraum: {fmtRange(effective.from, effective.to)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Verladungen mit ETA oder ATA im Zeitraum; Status zum aktuellen Stand.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zeitraum">
          {PRESETS.map((p) => (
            <Button key={p.id} size="sm" variant={preset === p.id ? "default" : "outline"} aria-pressed={preset === p.id}
              onClick={() => pick(p.id)} data-testid={`button-range-${p.id}`}>{p.label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={refresh} data-testid="button-refresh" aria-label="Aktualisieren">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${dash.isFetching || live.isFetching ? "animate-spin" : ""}`} />Aktualisieren
          </Button>
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3" data-testid="panel-custom-range">
          <label className="text-xs text-muted-foreground">Von
            <Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="mt-1 w-40" data-testid="input-range-from" />
          </label>
          <label className="text-xs text-muted-foreground">Bis
            <Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="mt-1 w-40" data-testid="input-range-to" />
          </label>
          <Button size="sm" disabled={!!draftError} onClick={() => setApplied({ ...draft })} data-testid="button-range-apply">Anwenden</Button>
          {draftError && <p role="alert" className="basis-full text-xs text-red-600" data-testid="error-range">{draftError}</p>}
        </div>
      )}

      <LiveAlerts alerts={live.data?.alerts} checkedAt={live.data?.checkedAt} loading={live.isLoading}
        fetching={live.isFetching} error={live.isError} onRetry={() => void live.refetch()} />

      {dash.isError && (
        <div role="alert" data-testid="error-dashboard" className="flex flex-wrap items-center gap-2 rounded-md border border-red-300/70 bg-red-50/50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          <TriangleAlert className="h-4 w-4" />
          {data ? "Aktualisierung der Auswertung fehlgeschlagen – letzter erfolgreicher Stand wird angezeigt." : "Die Auswertung konnte nicht geladen werden."}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void dash.refetch()} data-testid="button-retry-dashboard">Erneut versuchen</Button>
        </div>
      )}

      {dash.isLoading && (
        <div className="space-y-3" data-testid="loading-dashboard">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      )}
      {data && !a && (
        <div role="alert" data-testid="error-dashboard-contract" className="rounded-md border border-amber-300 p-3 text-sm">
          Die API liefert keine Auswertungsdaten. Bitte Frontend und API gemeinsam aktualisieren.
        </div>
      )}

      {data && a && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi testid="card-kpi-total" label="Gesamt" value={data.totalShipments} />
            <Kpi testid="card-kpi-expected" label="Erwartet" value={data.expectedShipments} tone="text-blue-700 dark:text-blue-400" />
            <Kpi testid="card-kpi-arrived" label="Angekommen" value={data.arrivedShipments} tone="text-emerald-700 dark:text-emerald-400" />
            <Kpi testid="card-kpi-open" label="Offen" value={data.openShipments} />
            <Kpi testid="card-kpi-late" label="Verspätet" value={data.lateShipments} tone="text-red-700 dark:text-red-400" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel testid="chart-flow" className="lg:col-span-2"
              title={a.grain === "hour" ? "ETA und ATA nach Uhrzeit" : "ETA und ATA nach Tag"}
              desc="Getrennte Ereigniszählung: ETA am erwarteten Tag, ATA am Ankunftstag. Eine Verladung kann in beiden Reihen erscheinen.">
              <FlowChart data={a.activity} hourly={a.grain === "hour"} />
              {a.grain === "hour" && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="text-unplaced">
                  Ohne Uhrzeit nicht im Diagramm: {a.unplacedEta} ETA, {a.unplacedAta} ATA.
                </p>
              )}
            </Panel>
            <Panel testid="chart-punctuality" title="Pünktlichkeit der Ankünfte"
              desc="Nicht stornierte Ankünfte im Zeitraum, ATA gegen ETA.">
              <Punctuality p={a.punctuality} />
            </Panel>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Panel testid="chart-status" title="Status" desc="Aktueller Status im Zeitraum">
              <HBar testid="status" data={statusData} color={(n) => STATUS_COLORS[n] ?? STATUS_COLORS.Angemeldet} />
            </Panel>
            <Panel testid="chart-lkw-art" title="LKW-Arten" desc="Verladungen inkl. stornierter; ohne Angabe separat">
              <HBar testid="lkw-art" data={a.byLkwArt} />
            </Panel>
            <Panel testid="chart-spedition" title="Nach Spedition"
              desc={`Nur zugeordnete Speditionen${spedCut ? `; Top ${TOP_N} von ${data.bySpedition.length}` : ""}`}>
              <HBar testid="spedition" data={spedTop} />
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel testid="card-pallets" className="lg:col-span-2" title="Palettensalden"
              desc="Aktueller Stand, unabhängig vom gewählten Zeitraum">
              <div className="mb-2 flex justify-end">
                <Button asChild size="sm" variant="outline"><Link href="/paletten" data-testid="link-paletten">Alle ansehen</Link></Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Spedition</TableHead><TableHead>Kürzel</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.palletBalances.length ? data.palletBalances.slice(0, 5).map((b) => (
                      <TableRow key={b.speditionId}>
                        <TableCell className="font-medium">{b.speditionName}</TableCell>
                        <TableCell>{b.kuerzel || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={b.balance < 0 ? "font-semibold text-red-600" : b.balance > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground"}>
                            {b.balance > 0 ? "+" : ""}{b.balance}
                          </span>
                        </TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Keine Salden vorhanden</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </Panel>
            <Panel testid="card-reconciliations" title="Offene Abstimmungen" desc="Aktueller Stand, unabhängig vom Zeitraum">
              <div className="flex items-center justify-between gap-3">
                <span className="text-4xl font-semibold tabular-nums" data-testid="text-open-reconciliations">{data.openReconciliations}</span>
                <Button asChild variant="outline" size="sm"><Link href="/abstimmungen" data-testid="link-abstimmungen">Zu den Abstimmungen</Link></Button>
              </div>
              {data.openReconciliations === 0 && <div className="mt-3"><Empty testid="empty-reconciliations" text="Keine offenen Abstimmungen." /></div>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
