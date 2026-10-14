import type { ClockAudit } from "@workspace/api-client-react";
import { fmtDateTime } from "./lib";

const show = (v: unknown) => (v == null ? "–" : JSON.stringify(v, null, 1));

export function AuditList({ audit }: { audit: ClockAudit[] }) {
  if (!audit.length) return <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Keine Änderungen im gewählten Zeitraum.</div>;
  return (
    <div className="space-y-3">
      {audit.map((a) => (
        <div key={a.id} className="rounded-lg border bg-white p-3 text-sm" data-testid={`audit-${a.id}`}>
          <div className="flex flex-wrap gap-x-3 gap-y-1"><b>{a.action}</b><span className="text-slate-500">{fmtDateTime(a.createdAt)}</span><span>von {a.actor}</span></div>
          <div className="mt-1">Grund: {a.reason}</div>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {([["Vorher", a.before], ["Nachher", a.after]] as const).map(([l, v]) => (
              <div key={l}><div className="text-xs text-slate-500">{l}</div><pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{show(v)}</pre></div>))}
          </div>
        </div>))}
    </div>
  );
}
