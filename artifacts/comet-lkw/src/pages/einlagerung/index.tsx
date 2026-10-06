import { useLocation, useParams } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScanLine, Warehouse } from "lucide-react";
import { errMsg, P, useEinlagerungAccess, useModel } from "./lib";
import { useEinlagerungState } from "./use-einlagerung";
import { ShelfPlan } from "./components/shelf-plan";
import { ArticleLookup } from "./components/article-lookup";
import { OrdersTab } from "./components/orders-tab";
import { StrategyTab } from "./components/strategy-tab";
import { MasterTab } from "./components/master-tab";
import { ImportTab } from "./components/import-tab";
import { DeliveryDeadlinesTab } from "./components/delivery-deadlines-tab";
import { SettingsTab } from "./components/settings-tab";

export default function EinlagerungPage() {
  const { tab } = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
  const { has } = useEinlagerungAccess();
  const { data: state, isLoading, isError, error, refetch } = useEinlagerungState();
  const model = useModel(state);

  const tabs = [
    { id: "lagerplan", label: "Lagerübersicht", ok: has(P.view) },
    { id: "artikel", label: "Artikelsuche", ok: has(P.view) || has(P.scan) },
    { id: "auftraege", label: "Aufträge", ok: has(P.view) || has(P.resCreate) || has(P.resEdit) },
    { id: "liefertermine", label: "Liefertermine", ok: has(P.view) },
    { id: "strategie", label: "Strategie", ok: has(P.strategy) },
    { id: "stammdaten", label: "Stammdaten", ok: has(P.master) },
    { id: "import", label: "Import", ok: has(P.import) },
    { id: "einstellungen", label: "Einstellungen und Verlauf", ok: has(P.settings) },
  ].filter((t) => t.ok);
  const active = tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id;

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Warehouse className="w-6 h-6 text-slate-500" />Einlagerung</h1>
          <p className="text-sm text-slate-500 mt-1">Lagerplätze nach Strategie finden und die gemeinsame Lagerstrategie pflegen</p>
        </div>
        {has(P.scan) && <Button variant="outline" className="ml-auto" onClick={() => setLocation("/scanner/einlagerung")} data-testid="link-scanner-einlagerung"><ScanLine className="w-4 h-4 mr-2" />Artikel-Scanner</Button>}
        {(has(P.scan) || has(P.view) || has(P.resCreate) || has(P.resEdit)) && <Button variant="outline" onClick={() => setLocation("/scanner/einlagerung-auftraege")} data-testid="link-scanner-einlagerung-auftraege"><ScanLine className="w-4 h-4 mr-2" />Aufträge-Scanner</Button>}
      </div>

      {tabs.length > 1 && (
        <Tabs value={active} onValueChange={(v) => setLocation(`/einlagerung/${v}`)}>
          <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1.5">
            {tabs.map((t) => <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 py-1.5" data-testid={`tab-${t.id}`}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      )}

      {isLoading && <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></div>}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>Daten konnten nicht geladen werden: {errMsg(error)}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Erneut versuchen</Button>
        </div>
      )}
      {state && active === "lagerplan" && <ShelfPlan state={state} model={model} has={has} />}
      {state && active === "artikel" && <div className="max-w-3xl"><ArticleLookup has={has} /></div>}
      {state && active === "auftraege" && <OrdersTab state={state} model={model} has={has} />}
      {state && active === "liefertermine" && <DeliveryDeadlinesTab state={state} />}
      {state && active === "strategie" && <StrategyTab state={state} model={model} has={has} />}
      {state && active === "stammdaten" && <MasterTab state={state} model={model} has={has} />}
      {state && active === "import" && <ImportTab state={state} has={has} />}
      {state && active === "einstellungen" && <SettingsTab state={state} />}
    </div>
  );
}
