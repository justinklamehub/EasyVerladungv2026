import { useCallback, useEffect, useRef, useState } from "react";
import { getGetAdminSystemStatusQueryKey, useGetAdminSystemStatus } from "@workspace/api-client-react";
import type { SystemStatusCheck } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw, XCircle, Info } from "lucide-react";
import { ServerOperationsCard } from "@/pages/settings/server-operations-card";

type Level = "ok" | "warning" | "error" | "unknown" | "pending";

const LEVEL_UI: Record<Level, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "In Ordnung", cls: "border-green-200 bg-green-50 text-green-800", Icon: CheckCircle2 },
  warning: { label: "Warnung", cls: "border-orange-200 bg-orange-50 text-orange-800", Icon: AlertTriangle },
  error: { label: "Fehler", cls: "border-red-200 bg-red-50 text-red-800", Icon: XCircle },
  unknown: { label: "Unbekannt", cls: "border-slate-200 bg-slate-50 text-slate-700", Icon: HelpCircle },
  pending: { label: "Wird geprüft …", cls: "border-slate-200 bg-slate-50 text-slate-700", Icon: Loader2 },
};

const RANK: Record<Level, number> = { ok: 0, unknown: 1, pending: 1, warning: 2, error: 3 };

function worst(levels: Level[]): Level {
  return levels.reduce<Level>((a, b) => (RANK[b] > RANK[a] ? b : a), "ok");
}

function StatusBadge({ level, id }: { level: Level; id: string }) {
  const { label, cls, Icon } = LEVEL_UI[level];
  return (
    <span
      data-testid={`status-${id}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <Icon className={`w-3.5 h-3.5 ${level === "pending" ? "animate-spin" : ""}`} aria-hidden="true" />
      {label}
    </span>
  );
}

interface BrowserResult {
  state: "pending" | "ok" | "error";
  message: string;
  durationMs?: number;
  checkedAt?: Date;
}

async function runBrowserCheck(): Promise<BrowserResult> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(import.meta.env.BASE_URL, {
      cache: "no-store",
      credentials: "same-origin",
      signal: ctrl.signal,
      headers: { Accept: "text/html" },
    });
    const durationMs = Math.round(performance.now() - started);
    const checkedAt = new Date();
    if (!res.ok) {
      return { state: "error", message: `Startseite liefert HTTP ${res.status}.`, durationMs, checkedAt };
    }
    const type = res.headers.get("content-type") ?? "";
    const html = await res.text();
    if (!type.includes("text/html")) {
      return { state: "error", message: "Startseite liefert kein HTML.", durationMs, checkedAt };
    }
    if (!/id=["']root["']/.test(html)) {
      return { state: "error", message: "HTML enthält kein Root-Element der App.", durationMs, checkedAt };
    }
    if (!/<script[^>]+src=/i.test(html)) {
      return { state: "error", message: "HTML enthält kein JavaScript-Bundle.", durationMs, checkedAt };
    }
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    const resources = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
      .map((match) => new URL(match[1], base))
      .filter((url) => url.origin === base.origin && url.pathname.startsWith(base.pathname) &&
        (/\.(?:m?js|css|tsx?)(?:$)/.test(url.pathname) || url.pathname.endsWith("/@vite/client"))).slice(0, 6);
    const failed = (await Promise.all(resources.map(async (url) => {
      const response = await fetch(url, { method: "HEAD", cache: "no-store", credentials: "same-origin", signal: ctrl.signal });
      const mime = response.headers.get("content-type") ?? "";
      const expected = url.pathname.endsWith(".css") ? /text\/css/i : /(?:javascript|ecmascript)/i;
      return response.ok && expected.test(mime) ? null : `Frontend-Datei nicht nutzbar (HTTP ${response.status}): ${url.pathname}`;
    }))).find(Boolean);
    if (failed) return { state: "error", message: failed, durationMs: Math.round(performance.now() - started), checkedAt: new Date() };
    return { state: "ok", message: `Startseite und ${resources.length} lokale Einstiegsskripte/Styles im Browser erreichbar.`,
      durationMs: Math.round(performance.now() - started), checkedAt: new Date() };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      state: "error",
      message: aborted ? "Zeitüberschreitung nach 5 Sekunden." : "Startseite im Browser nicht erreichbar.",
      durationMs: Math.round(performance.now() - started),
      checkedAt: new Date(),
    };
  } finally {
    clearTimeout(timer);
  }
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} T ${h} Std`;
  if (h > 0) return `${h} Std ${m} Min`;
  return `${m} Min`;
}

const MODE_LABEL: Record<string, string> = { development: "Entwicklung", production: "Produktion", test: "Test" };

const COMPONENTS: { id: SystemStatusCheck["id"]; title: string }[] = [
  { id: "frontend", title: "Frontend" },
  { id: "api", title: "API" },
  { id: "database", title: "Datenbank" },
  { id: "storage", title: "Speicher" },
];

export default function SystemStatusPage() {
  const query = useGetAdminSystemStatus({
    query: {
      queryKey: getGetAdminSystemStatusQueryKey(),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
      staleTime: 0,
    },
  });
  const { data, isLoading, isError, isFetching, refetch } = query;

  const [browser, setBrowser] = useState<BrowserResult>({ state: "pending", message: "Browser-Prüfung läuft." });
  const runId = useRef(0);

  const runBrowser = useCallback(async () => {
    const id = ++runId.current;
    setBrowser({ state: "pending", message: "Browser-Prüfung läuft." });
    const r = await runBrowserCheck();
    if (id === runId.current) setBrowser(r);
  }, []);

  useEffect(() => {
    void runBrowser();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void runBrowser();
    }, 30_000);
    return () => { clearInterval(t); runId.current++; };
  }, [runBrowser]);

  const refreshAll = () => {
    void refetch();
    void runBrowser();
  };

  // Never present cached data as current once a request failed.
  const report = isError ? undefined : data;
  const checkOf = (id: string) => report?.checks.find((c) => c.id === id);

  const levels: Record<string, Level> = {};
  const details: Record<string, string[]> = {};
  const messages: Record<string, string> = {};
  const durations: Record<string, number | undefined> = {};

  for (const c of COMPONENTS) {
    const chk = checkOf(c.id);
    if (c.id === "api" && isError) {
      levels.api = "error";
      messages.api = "API nicht erreichbar oder Abfrage fehlgeschlagen.";
      details.api = [];
    } else if (!chk) {
      levels[c.id] = isLoading || (isFetching && !isError) ? "pending" : "unknown";
      messages[c.id] = isError ? "Unbekannt – Statusabfrage fehlgeschlagen." : "Noch keine Daten.";
      details[c.id] = [];
    } else {
      levels[c.id] = chk.status;
      messages[c.id] = chk.message;
      details[c.id] = chk.details;
      durations[c.id] = chk.durationMs;
    }
  }

  // Frontend: combine server file check + browser check
  const bLevel: Level = browser.state === "pending" ? "pending" : browser.state;
  const serverFrontend = levels.frontend;
  levels.frontend = worst([serverFrontend, bLevel]);
  if (levels.frontend === "ok" && (serverFrontend !== "ok" || bLevel !== "ok")) levels.frontend = "unknown";
  details.frontend = [
    `Server-Dateiprüfung: ${LEVEL_UI[serverFrontend].label}${checkOf("frontend") ? " – " + messages.frontend : ""}`,
    `Browser-Prüfung: ${browser.state === "pending" ? "läuft" : browser.state === "ok" ? "In Ordnung" : "Fehler"} – ${browser.message}`,
    ...details.frontend,
  ];
  if (report?.environment === "development") {
    details.frontend.push(
      "Entwicklungsmodus: Der statische Build beweist nicht, dass die Live-Vorschau läuft; die Browser-Prüfung testet die Live-Startseite unabhängig.",
    );
  }
  durations.frontend = browser.durationMs ?? durations.frontend;
  messages.frontend =
    bLevel === "error" ? browser.message : bLevel === "pending" ? "Browser-Prüfung läuft." : messages.frontend;

  const overall: Level = worst(COMPONENTS.map((c) => levels[c.id]));
  const overallLevel: Level = RANK[overall] >= 2 ? overall : COMPONENTS.every((c) => levels[c.id] === "ok") ? "ok" : "unknown";
  const { Icon: OIcon, cls: oCls } = LEVEL_UI[overallLevel];
  const overallText: Record<Level, string> = {
    ok: "Alle Prüfungen bestanden",
    warning: "Mit Warnungen",
    error: "Störung erkannt",
    unknown: "Status unvollständig",
    pending: "Prüfung läuft …",
  };

  return (
    <div className="min-w-0 space-y-6 max-w-[1200px] mx-auto [overflow-wrap:anywhere]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Systemstatus</h1>
          <p className="text-sm text-slate-500 mt-1">Betriebszustand dieser COMET-Instanz</p>
        </div>
        <Button onClick={refreshAll} disabled={isFetching || browser.state === "pending"} data-testid="button-refresh-status" className="self-start sm:self-auto">
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Jetzt prüfen
        </Button>
      </div>

      {isError && (
        <div role="alert" data-testid="status-request-error" className="rounded-lg border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-2 text-sm text-red-800">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Die Statusabfrage ist fehlgeschlagen. Zuvor angezeigte Werte sind nicht mehr aktuell und werden nicht angezeigt.
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} data-testid="button-retry-status">
            Erneut versuchen
          </Button>
        </div>
      )}

      <Card className={`border ${oCls}`} data-testid="card-overall-status">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <OIcon className={`w-12 h-12 shrink-0 ${overallLevel === "pending" ? "animate-spin" : ""}`} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide opacity-80">Gesamtstatus</div>
            <div className="text-2xl font-bold" role="status" data-testid="text-overall-status">
              {LEVEL_UI[overallLevel].label} – {overallText[overallLevel]}
            </div>
            <div className="text-sm opacity-80 mt-1" data-testid="text-checked-at">
              {report ? `Letzte Serverprüfung: ${new Date(report.checkedAt).toLocaleString("de-DE")} Uhr` : isLoading ? "Wird geladen …" : "Keine aktuelle Serverprüfung vorhanden"}
              {" · "}automatische Aktualisierung alle 30 Sek. (nur bei sichtbarem Tab)
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {COMPONENTS.map((c) => (
          <Card key={c.id} className="min-w-0 bg-white shadow-sm border-slate-200" data-testid={`card-check-${c.id}`}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">{c.title}</CardTitle>
                {durations[c.id] !== undefined && (
                  <CardDescription className="text-xs">{durations[c.id]} ms</CardDescription>
                )}
              </div>
              <StatusBadge level={levels[c.id]} id={c.id} />
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && c.id !== "frontend" ? (
                <Skeleton className="h-4 w-3/4" />
              ) : (
                <p className="text-sm text-slate-700" data-testid={`text-message-${c.id}`}>{messages[c.id]}</p>
              )}
              {details[c.id].length > 0 && (
                <ul className="list-disc pl-5 text-xs text-slate-500 space-y-1">
                  {details[c.id].map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Instanz</CardTitle>
        </CardHeader>
        <CardContent>
          {report ? (
            <dl className="grid gap-3 sm:grid-cols-3 text-sm">
              <div><dt className="text-slate-500">Hostname</dt><dd className="font-medium break-all" data-testid="text-hostname">{report.hostname}</dd></div>
              <div><dt className="text-slate-500">Modus</dt><dd className="font-medium" data-testid="text-mode">{MODE_LABEL[report.environment] ?? report.environment}</dd></div>
              <div><dt className="text-slate-500">Laufzeit</dt><dd className="font-medium" data-testid="text-uptime">{fmtUptime(report.uptimeSeconds)}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Nicht verfügbar.</p>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <ul className="space-y-1">
          <li>Die obigen Live-Prüfungen sind rein lesend. Sie prüfen weder Schreibvorgänge noch Backups; vorhandene Sicherungsnachweise werden unten separat angezeigt.</li>
          <li>Angezeigt wird nur diese Instanz – alter und neuer Server werden nicht automatisch verglichen.</li>
          <li><Badge variant="outline" className="mr-1">Hinweis</Badge>Ein grüner Status ersetzt keine Sicherungs- oder Wiederherstellungsprüfung.</li>
        </ul>
      </div>
      <ServerOperationsCard />
    </div>
  );
}
