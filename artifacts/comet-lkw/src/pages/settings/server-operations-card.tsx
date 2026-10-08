import { useState } from "react";
import { getGetAdminSystemOperationsQueryKey, useGetAdminSystemOperations, useStartAdminSystemUpdate } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, DatabaseBackup, Loader2, RefreshCw, Server, XCircle } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

const LABEL = { idle: "Bereit", queued: "Angenommen", running: "Läuft …",
  done: "Abgeschlossen", failed: "Fehler", unknown: "Abschluss unbekannt" };

export function ServerOperationsCard() {
  const permissions = usePermissions();
  const canView = !!permissions["system.view"];
  const canUpdate = canView && !!permissions["system.update"];
  const [confirm, setConfirm] = useState(false);
  const [acceptedJob, setAcceptedJob] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const query = useGetAdminSystemOperations({ query: {
    queryKey: getGetAdminSystemOperationsQueryKey(),
    enabled: canView,
    refetchInterval: 5000, refetchIntervalInBackground: false, retry: false, staleTime: 0,
  } });
  const start = useStartAdminSystemUpdate();
  // Don't turn an API restart or a lost POST acknowledgement into "update failed".
  const data = query.isError ? undefined : query.data;
  const current = data?.update;
  const awaitingJob = acceptedJob !== null && current?.jobId !== acceptedJob;
  const busy = start.isPending || awaitingJob || current?.status === "running" || current?.status === "queued";
  const status = query.isError ? "unknown" : awaitingJob ? "queued" : current?.status ?? "idle";
  const backup = data?.backup;
  async function startUpdate() {
    if (!canUpdate) return;
    setConfirm(false);
    setSubmitError(null);
    try {
      const result = await start.mutateAsync({ data: { confirm: true } });
      setAcceptedJob(result.jobId);
      void query.refetch();
    } catch {
      setSubmitError("Start konnte nicht bestätigt werden. Erst den gespeicherten Serverstatus prüfen, bevor du erneut startest.");
      void query.refetch();
    }
  }
  if (!canView) return null;
  return (
    <div className="space-y-4 min-w-0 [overflow-wrap:anywhere]">
      <Card className="shadow-sm" data-testid="card-safe-update">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Server className="w-5 h-5 text-slate-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base">Server sicher aktualisieren</CardTitle>
              <CardDescription className="text-xs mt-1">Getrennter Build, gemeinsame Sicherung, Wiederherstellungsprobe und Auslieferungsprüfung.</CardDescription>
            </div>
            <span role="status" data-testid="text-update-state" className={`text-xs font-semibold ${status === "done" ? "text-emerald-600" : status === "failed" ? "text-red-600" : "text-slate-600"}`}>
              {busy && <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />}
              {LABEL[status]}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading && <p className="text-sm text-slate-500">Serverstatus wird geladen …</p>}
          {(query.isError || submitError) && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="alert-update-connection">
            {submitError || "Verbindung zum Statusdienst unterbrochen. Ein Update kann im Hintergrund weiterlaufen; sein Abschluss ist derzeit unbekannt."}
          </p>}
          {data?.reason && <p className="text-sm text-amber-800" data-testid="text-update-unavailable">{data.reason}</p>}
          {current && <div className="rounded-md border bg-slate-50 p-3 space-y-2 text-sm">
            <p data-testid="text-update-message">{awaitingJob ? "Auf gespeicherten Fortschritt des angenommenen Auftrags warten …" : current.message}</p>
            {current.startedAt && <p className="text-xs text-slate-500">Start: {new Date(current.startedAt).toLocaleString("de-DE")}</p>}
            {current.finishedAt && <p className="text-xs text-slate-500">Abschluss: {new Date(current.finishedAt).toLocaleString("de-DE")}</p>}
            {current.events.length > 0 && <ol className="space-y-1 text-xs text-slate-600" data-testid="list-update-events">
              {current.events.map((event, i) => <li key={`${event.at}-${i}`}>{event.message}</li>)}
            </ol>}
          </div>}
          <p className="text-xs text-slate-500">Der Auftrag läuft unabhängig vom geöffneten Browser weiter. Nur der eigene API-Dienst wird nach den Prüfungen kurz neu gestartet; kein fremder Prozess wird über seinen Port beendet.</p>
          <div className="flex flex-wrap gap-2 items-center">
            {!confirm && canUpdate && <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}
              disabled={!data?.available || busy || query.isError || !!submitError} data-testid="button-prepare-update">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Update vorbereiten
            </Button>}
            {confirm && canUpdate && <>
              <p className="text-sm basis-full">Die API wird kurz neu gestartet. Bei einem Fehler werden vorherige Builds zurückgenommen, nicht die Datenbank. Jetzt starten?</p>
              <Button variant="destructive" size="sm" onClick={() => void startUpdate()} disabled={busy} data-testid="button-confirm-update">Ja, Update starten</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>Abbrechen</Button>
            </>}
            <Button variant="outline" size="sm" onClick={async () => {
              const result = await query.refetch();
              if (result.isSuccess) { setSubmitError(null); setAcceptedJob(null); }
            }} disabled={query.isFetching} data-testid="button-refresh-update">Status aktualisieren</Button>
          </div>
          {!canUpdate && <p className="text-xs text-slate-500" data-testid="text-update-permission">Nur Lesezugriff. Zum Starten eines Updates ist das separate Update-Recht erforderlich.</p>}
        </CardContent>
      </Card>
      <Card className="shadow-sm" data-testid="card-backup-proof">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><DatabaseBackup className="w-4 h-4" />Datenbank und Bilder sichern</CardTitle>
          <CardDescription className="text-xs">Letzte gemeinsame Sicherung dieser Instanz. Vor jedem Update wird eine neue Sicherung geprüft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!backup ? <p className="text-slate-500" data-testid="text-backup-status">Keine verlässlich lesbare gemeinsame Sicherung nachgewiesen.</p> : <>
            <p>Sicherung: {new Date(backup.createdAt).toLocaleString("de-DE")}</p>
            <p>{backup.tableCount} Tabellen · {backup.imageCount} Bild-/Speicherdateien · {backup.backend === "local" ? "Lokale Ablage" : "Cloud-Ablage"}</p>
            <p data-testid="text-backup-status" className={`flex gap-2 items-start ${backup.verifiedAt ? "text-emerald-700" : "text-amber-800"}`}>
              {backup.verifiedAt ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              {backup.verifiedAt ? `Isoliert wiederhergestellt und geprüft: ${new Date(backup.verifiedAt).toLocaleString("de-DE")}` : "Sicherung vorhanden; Wiederherstellungsprüfung noch nicht erfolgreich nachgewiesen."}
            </p>
          </>}
          {query.isError && <p className="text-amber-800 flex gap-1"><XCircle className="w-4 h-4 shrink-0" />Aktueller Sicherungsstatus nicht erreichbar.</p>}
          <p className="text-xs text-slate-500">Die Probe prüft PostgreSQL-Tabellen und Zeilenzahlen sowie die Prüfsummen wiederhergestellter Bilddateien. Keine Rückspielung in die laufende Instanz oder Cloud und keine vollständige App-Funktionsprüfung.</p>
          <p className="text-xs text-slate-500">Sicherungen liegen geschützt auf diesem Server. Eine zusätzliche externe Kopie und regelmäßige Sicherungen außerhalb von Updates bleiben erforderlich.</p>
        </CardContent>
      </Card>
    </div>
  );
}
