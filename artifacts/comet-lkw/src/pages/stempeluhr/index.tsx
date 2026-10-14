import { useState } from "react";
import { Link } from "wouter";
import { useGetStempeluhrState } from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Timer } from "lucide-react";
import { P, berlinDate, errMsg, sel, useClockAccess } from "./lib";
import { Attendance } from "./attendance";
import { Employees } from "./employees";
import { AuditList } from "./audit";
import { SettingsPanel, TerminalPanel } from "./settings";
import { ImportPanel } from "./import";

export default function StempeluhrPage() {
  const { has, any } = useClockAccess();
  const today = berlinDate(new Date());
  const [from, setFrom] = useState(() => berlinDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(today);
  const [emp, setEmp] = useState("");

  const showState = any(P.view, P.employees, P.correct, P.delete, P.export, P.import);
  const showEntries = any(P.view, P.correct, P.export, P.delete);
  const showEmployees = any(P.view, P.employees, P.correct, P.export, P.import);
  const showAudit = any(P.view, P.correct, P.delete);
  const tabs = [
    { id: "anwesenheit", label: "Anwesenheit", ok: showEntries },
    { id: "mitarbeiter", label: "Mitarbeiter", ok: showEmployees },
    { id: "verlauf", label: "Verlauf", ok: showAudit },
    { id: "terminal", label: "Terminal", ok: has(P.terminal) },
    { id: "einstellungen", label: "Einstellungen", ok: has(P.settings) },
    { id: "import", label: "Import", ok: has(P.import) },
  ].filter((t) => t.ok);
  const [tab, setTab] = useState<string>("");
  const active = tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id;

  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const q = useGetStempeluhrState({ from, to, ...(emp ? { employeeId: Number(emp) } : {}) },
    { query: { enabled: showState && validRange, queryKey: ["/api/stempeluhr/state", { from, to, ...(emp ? { employeeId: Number(emp) } : {}) }], staleTime: 10_000, refetchInterval: 15_000, refetchOnWindowFocus: true } });
  const s = q.data;
  const needsRange = active === "anwesenheit" || active === "mitarbeiter" || active === "verlauf";
  const selectWeek = (offset: number) => {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7 + offset * 7);
    setFrom(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 6);
    setTo(day.toISOString().slice(0, 10));
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Timer className="w-6 h-6 text-slate-500" />Stempeluhr</h1>
          <p className="text-sm text-slate-500 mt-1">Anwesenheit, Pausen und Arbeitszeiten (Zeiten in Berlin)</p>
        </div>
        <Link href="/stempeluhr-terminal" className="ml-auto inline-flex items-center rounded-md border px-3 py-2 text-sm bg-white" data-testid="link-terminal">Terminal-Ansicht</Link>
      </div>

      {tabs.length === 0 && <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Für die Stempeluhr sind keine Bereiche für Ihr Konto freigegeben.</div>}
      {tabs.length > 0 && (
        <Tabs value={active} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1.5">
            {tabs.map((t) => <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 py-1.5" data-testid={`tab-${t.id}`}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      )}

      {needsRange && showState && (
        <div className="flex flex-wrap gap-2 items-end">
          <div><Label>Von</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" /></div>
          <div><Label>Bis</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" /></div>
          <div className="min-w-[12rem]"><Label>Mitarbeiter</Label>
            <select className={sel} value={emp} onChange={(e) => setEmp(e.target.value)} data-testid="select-employee-filter">
              <option value="">Alle</option>{s?.employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</select></div>
          {!validRange && <span className="text-sm text-red-700">Ungültiger Zeitraum</span>}
          <Button variant="outline" onClick={() => selectWeek(0)}>Diese Woche</Button>
          <Button variant="outline" onClick={() => selectWeek(-1)}>Vorige Woche</Button>
          <p className="w-full text-xs text-slate-500">Anwesenheiten nach Kommen-Datum; Nachtschichten werden vollständig dem Starttag zugeordnet. Das Protokoll zeigt höchstens die letzten 500 Änderungen im Zeitraum.</p>
        </div>
      )}

      {needsRange && q.isLoading && <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></div>}
      {needsRange && q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>Daten konnten nicht geladen werden: {errMsg(q.error)}</span><Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>
      )}
      {s && active === "anwesenheit" && <Attendance entries={s.entries} employees={s.employees} has={has} from={from} to={to} />}
      {s && active === "mitarbeiter" && <Employees employees={s.employees} entries={s.entries} canEdit={has(P.employees)} />}
      {s && active === "verlauf" && <AuditList audit={s.audit} />}
      {active === "terminal" && <TerminalPanel />}
      {active === "einstellungen" && <SettingsPanel />}
      {active === "import" && <ImportPanel />}
    </div>
  );
}
