import { useState } from "react";
import { Link } from "wouter";
import { useGetWvvnScannerState, useGetWvvnState, getGetWvvnScannerStateQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageX } from "lucide-react";
import { P, berlinDate, errMsg, useWvvnAccess } from "./lib";
import { History } from "./history";
import { Articles, Audit, Devices, ImportPanel, Reports, SettingsPanel } from "./admin";
import { ScanWorkspace } from "./scanner-core";

function Scan({ canDelete, canFinish }: { canDelete: boolean; canFinish: boolean }) {
  const q = useGetWvvnScannerState({ query: { queryKey: getGetWvvnScannerStateQueryKey(), refetchInterval: 30_000 } });
  if (q.isLoading) return <Skeleton className="h-48" />;
  if (q.isError || !q.data) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex justify-between gap-3"><span>{errMsg(q.error)}</span><Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>;
  if (!q.data.unlocked) return <div className="rounded-lg border bg-white p-6 text-sm text-slate-600">Erfassung nicht freigegeben.</div>;
  return <div className="max-w-2xl"><ScanWorkspace state={q.data} canScan canDelete={canDelete || !!q.data.device} canFinish={canFinish || !!q.data.device} /></div>;
}

export default function WvvnPage() {
  const { has, any } = useWvvnAccess();
  const today = berlinDate(new Date());
  const [from, setFrom] = useState(() => berlinDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(today);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const allowed = any();
  const params = { from, to };
  const q = useGetWvvnState(params, { query: { enabled: allowed && valid, queryKey: ["/api/wvvn/state", params], staleTime: 10_000, refetchInterval: 30_000 } });
  const s = q.data;
  const tabs = [
    { id: "scan", label: "Erfassen", ok: has(P.scan) },
    { id: "protokoll", label: "Protokoll", ok: has(P.view) || has(P.export) },
    { id: "artikel", label: "Artikel", ok: has(P.articles) || has(P.view) },
    { id: "berichte", label: "Berichte", ok: has(P.view) || has(P.settings) || has(P.export) },
    { id: "geraete", label: "Geräte", ok: has(P.devices) },
    { id: "einstellungen", label: "Einstellungen", ok: has(P.settings) },
    { id: "import", label: "Import", ok: has(P.import) },
    { id: "verlauf", label: "Verlauf", ok: has(P.view) },
  ].filter((t) => t.ok);
  const [tab, setTab] = useState("");
  const active = tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id;

  if (!allowed) return <div className="p-6 max-w-3xl mx-auto"><div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500" data-testid="text-denied">Für Werksverkauf / Vernichtung sind keine Bereiche für Ihr Konto freigegeben.</div></div>;
  const stateTab = active !== "scan" && active !== "import";

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><PackageX className="w-6 h-6 text-slate-500" />Werksverkauf / Vernichtung</h1>
          <p className="text-sm text-slate-500 mt-1">Erfasste Stückzahlen aus Werksverkauf und Vernichtung (Zeiten in Berlin)</p>
        </div>
        <Link href="/scanner/werksverkauf-vernichtung" className="ml-auto inline-flex items-center rounded-md border px-3 py-2 text-sm bg-white" data-testid="link-scanner">Scanner-Ansicht</Link>
      </div>
      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1.5">
          {tabs.map((t) => <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 py-1.5" data-testid={`tab-${t.id}`}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {stateTab && q.isError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3"><span>Daten konnten nicht geladen werden: {errMsg(q.error)}</span><Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>}
      {stateTab && q.isLoading && <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></div>}
      {active === "scan" && <Scan canDelete={has(P.delete)} canFinish={has(P.finish)} />}
      {active === "protokoll" && <History sessions={s?.sessions ?? []} truncated={!!s?.truncated} from={from} to={to} setFrom={setFrom} setTo={setTo} canExport={has(P.export)} loading={q.isLoading} />}
      {s && active === "artikel" && <Articles articles={s.articles} canEdit={has(P.articles)} />}
      {s && active === "berichte" && <Reports reports={s.reports} canSend={has(P.settings)} canExport={has(P.export)} />}
      {s && active === "geraete" && <Devices devices={s.devices} canRevoke={has(P.devices)} />}
      {s && active === "einstellungen" && <SettingsPanel settings={s.settings} />}
      {active === "import" && <ImportPanel />}
      {s && active === "verlauf" && <Audit events={s.events} />}
      {!valid && stateTab && <p className="text-sm text-red-700">Ungültiger Zeitraum</p>}
    </div>
  );
}
