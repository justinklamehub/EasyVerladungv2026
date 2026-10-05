import * as React from "react";
import { ChevronDown } from "lucide-react";
import { nf, type D } from "../lib";

type StockKind = "ist" | "retouren" | "auftraege";
const LABELS: Record<StockKind, string> = {
  ist: "IST-Paletten auf diesem Regalplatz",
  retouren: "Retourenpaletten auf diesem Regalplatz",
  auftraege: "Auftragspaletten auf diesem Regalplatz",
};
const EMPTY: Record<StockKind, string> = {
  ist: "Keine IST-Paletten auf diesem Regalplatz.",
  retouren: "Keine Retourenpaletten auf diesem Regalplatz.",
  auftraege: "Keine Aufträge auf diesem Regalplatz.",
};

function StockDrop({ kind, rows, imported, pallets, shelfId }: {
  kind: StockKind; rows: D[]; imported: boolean; pallets?: number; shelfId: number;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50" data-testid={`stock-drop-${kind}-${shelfId}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 px-1.5 text-xs text-white">
          {imported ? rows.length === 0 ? "0" : pallets === undefined ? "…" : nf(pallets) : "–"}
        </span>
        <span className="flex-1">{LABELS[kind]}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="max-h-72 space-y-2 overflow-y-auto px-3 pb-3" data-testid={`stock-list-${kind}-${shelfId}`}>
        {!imported ? <p className="text-xs text-slate-500">Daten noch nicht importiert.</p>
        : rows.length === 0 ? <p className="text-xs text-slate-500">{EMPTY[kind]}</p>
        : rows.map((row, index) => (
          <div key={index} className="rounded-md border border-slate-200 bg-white p-2 text-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words font-medium text-slate-900">
                {kind === "ist" ? String(row.material || "Ohne Artikelnummer")
                  : kind === "retouren" ? String(row.kunde || "Ohne Kundenzuordnung")
                  : String(row.spedition || "Ohne Speditionszuordnung")}
              </span>
              <span className="shrink-0 font-semibold text-slate-900">{nf(Number(row.paletten) || 0)} Pal.</span>
            </div>
            {kind === "retouren" && row.material ? <p className="mt-1 text-slate-600">Artikel {String(row.material)}</p> : null}
            {kind === "auftraege" && (
              <div className="mt-1 space-y-1 text-slate-600">
                <p className="break-words">{[row.relation && `Relation ${row.relation}`, row.termin,
                  row.calendarWeek && `KW ${row.calendarWeek}`, row.plusKw && `+${row.plusKw} KW`].filter(Boolean).join(" · ") || "Ohne Termin / Relation"}</p>
                {Array.isArray(row.belege) && row.belege.length > 0 && <p className="break-all">Belege: {row.belege.join(", ")}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export function ShelfStockDrops({ shelfId, ist, retouren, auftraege, imported, totals }: {
  shelfId: number; ist: D[]; retouren: D[]; auftraege: D[];
  imported: Record<StockKind, boolean>; totals?: { ist: number; retouren: number; auftraege: number };
}) {
  return <div className="space-y-2">
    <StockDrop kind="ist" shelfId={shelfId} rows={ist} imported={imported.ist} pallets={totals?.ist} />
    <StockDrop kind="retouren" shelfId={shelfId} rows={retouren} imported={imported.retouren} pallets={totals?.retouren} />
    <StockDrop kind="auftraege" shelfId={shelfId} rows={auftraege} imported={imported.auftraege} pallets={totals?.auftraege} />
  </div>;
}
