import type { SystemUpdateProgress } from "@workspace/api-client-react";

export function UpdateFailureDetails({ update }: { update: SystemUpdateProgress }) {
  if (update.status !== "failed" || !update.diagnostic) return null;
  return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2 text-sm text-red-900"
    data-testid="alert-update-diagnostic">
    <p className="font-semibold">Ursache des Update-Abbruchs</p>
    <p>{update.diagnostic.cause}</p>
    <p className="text-xs">Abbruchphase: {update.phase || "nicht bekannt"} · Fehlercode: {update.diagnostic.code}</p>
    {update.recovery === "failed" && <p className="font-semibold">
      Zuerst Dienst und öffentliche Auslieferung prüfen: Auch die automatische Rückkehr ist fehlgeschlagen.
    </p>}
    <p className="font-semibold">Nächste Schritte</p>
    <ol className="list-decimal pl-5 space-y-1">
      {update.diagnostic.nextSteps.map((step, index) => <li key={index}>{step}</li>)}
    </ol>
    <p className="text-xs">Die Datenbank wurde nicht zurückgesetzt. Rohprotokolle bleiben privat auf dem Server.</p>
  </div>;
}
