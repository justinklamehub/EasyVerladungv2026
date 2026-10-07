import * as React from "react";

export type IstRow = { material?: unknown; paletten?: unknown };

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

export function ScannerIstDetails({ rows, testId }: { rows: IstRow[]; testId?: string }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + (Number(r.paletten) || 0), 0);
  return (
    <section aria-label="IST-Bestand" className="rounded-md border border-slate-200 bg-slate-50" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">IST-Bestand</h4>
        <span className="text-xs text-slate-600">
          {rows.length} {rows.length === 1 ? "Position" : "Positionen"} / <strong className="text-slate-900">{fmt(total)} Pal.</strong>
        </span>
      </div>
      <ul className="divide-y divide-slate-200">
        {rows.map((r, i) => {
          const pal = Number(r.paletten) || 0;
          return (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dl className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Artikelnummer</dt>
                <dd className="break-all font-mono text-base font-bold tabular-nums text-slate-900">{String(r.material || "Ohne Artikelnummer")}</dd>
              </dl>
              <dl className="shrink-0 text-right">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Paletten</dt>
                <dd className="text-base font-bold tabular-nums text-slate-900">{fmt(pal)} <span className="text-xs font-normal text-slate-500">Pal.</span></dd>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
