import { Link } from "wouter";
import { format } from "date-fns";
import { AlertTriangle, CircleAlert, CircleCheck, Clock, Loader2, ShieldQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export interface LiveAlert {
  id: number; bezeichnung: string | null; kennzeichen: string | null; status: string; tor: string | null;
  speditionName: string; level: "warn" | "danger"; minutesWaiting: number; alertReason: "timeInStatus" | "etaOverdue";
}
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`);

export function LiveAlerts(p: {
  alerts?: LiveAlert[]; checkedAt?: string; loading: boolean; fetching: boolean; error: boolean; onRetry: () => void;
}) {
  const alerts = p.alerts ?? [];
  const danger = alerts.filter((a) => a.level === "danger").length;
  const warn = alerts.length - danger;
  const known = p.alerts !== undefined;
  const time = p.checkedAt ? format(new Date(p.checkedAt), "HH:mm:ss") : null;
  const tone = p.error ? "border-amber-300/60" : danger ? "border-red-300/70 dark:border-red-800/60" : warn ? "border-orange-300/70 dark:border-orange-800/60" : "";
  return (
    <Card className={`shadow-none ${tone}`} data-testid="card-live-alerts">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {p.loading && !known ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
            p.error ? <ShieldQuestion className="h-4 w-4 text-amber-600" /> :
            danger ? <CircleAlert className="h-4 w-4 text-red-600" /> : warn ? <AlertTriangle className="h-4 w-4 text-orange-500" /> :
            <CircleCheck className="h-4 w-4 text-emerald-600" />}
          <h2 className="text-sm font-semibold">Handlungsbedarf</h2>
          {danger > 0 && <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400">{danger} kritisch</Badge>}
          {warn > 0 && <Badge variant="outline" className="border-orange-300 text-orange-700 dark:text-orange-400">{warn} Warnung</Badge>}
          <span className="text-xs text-muted-foreground sm:ml-auto" data-testid="text-live-meta">
            Live, unabhängig vom Zeitraum · alle 30 Sek.{time ? ` · geprüft ${time} Uhr` : ""}
            {p.fetching && known ? " · aktualisiert…" : ""}
          </span>
        </div>
        {p.error && (
          <div role="alert" data-testid="error-live-alerts" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {known ? "Aktualisierung fehlgeschlagen – angezeigt wird der letzte erfolgreiche Stand (möglicherweise veraltet)." : "Der Live-Status konnte nicht geladen werden. Es ist unbekannt, ob Handlungsbedarf besteht."}
            <Button size="sm" variant="outline" className="ml-auto h-7" onClick={p.onRetry} data-testid="button-retry-live-alerts">Erneut versuchen</Button>
          </div>
        )}
        {p.loading && !known && <div className="h-10 animate-pulse rounded-md bg-muted" data-testid="loading-live-alerts" />}
        {known && alerts.length === 0 && !p.error && (
          <p className="text-sm text-muted-foreground" data-testid="text-live-clear">Keine SLA-Überschreitungen zum letzten Prüfzeitpunkt.</p>
        )}
        {alerts.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>LKW</TableHead><TableHead>Status</TableHead><TableHead>Tor</TableHead>
                <TableHead>Spedition</TableHead><TableHead className="text-right">Wartezeit</TableHead><TableHead>Grund</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id} data-testid={`row-alert-${a.id}`}>
                    <TableCell className="py-2">
                      <Link href="/shipments" className="font-medium hover:underline">{a.bezeichnung || a.kennzeichen || `#${a.id}`}</Link>
                      {a.bezeichnung && a.kennzeichen && <div className="text-xs text-muted-foreground">{a.kennzeichen}</div>}
                    </TableCell>
                    <TableCell className="py-2"><Badge variant="outline" className="text-xs">{a.status}</Badge></TableCell>
                    <TableCell className="py-2 text-sm">{a.tor ?? "–"}</TableCell>
                    <TableCell className="py-2 text-sm">{a.speditionName}</TableCell>
                    <TableCell className="py-2 text-right">
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${a.level === "danger" ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`}>
                        <Clock className="h-3 w-3" />{fmtMin(a.minutesWaiting)}
                        <span className="sr-only">{a.level === "danger" ? "kritisch" : "Warnung"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{a.alertReason === "timeInStatus" ? "Wartezeit" : "nach ETA"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
