import * as React from "react";
import { articleTextColor } from "./article-strip";
import { nf, type D, type Rec } from "../lib";
import { reservationDeadline } from "./reservation-deadlines";
import { ReservationDeadlineBadge } from "./reservation-deadline-badge";

export type ContentMode = "planned" | "orders" | "returns" | "reservations";
export type ShelfLoads = { orders: D[]; retouren: D[] };
export type LoadView = {
  mode: ContentMode;
  byShelf: Map<number, ShelfLoads>;
  carriers: Rec[];
  imported: boolean;
  loading: boolean;
  error: boolean;
  reservations?: Map<number, D[]>;
};

export function contentRows(view: LoadView, shelfId: number): D[] {
  if (view.mode === "reservations") return view.reservations?.get(shelfId) ?? [];
  const data = view.byShelf.get(shelfId);
  return (view.mode === "orders" ? data?.orders : data?.retouren) ?? [];
}

export function loadSearchText(rows: D[]) {
  return rows.map((r) => [r.spedition, r.kunde, r.relation, r.termin, r.calendarWeek, r.plusKw,
    ...(Array.isArray(r.belege) ? r.belege : [])].filter(Boolean).join(" ")).join(" ");
}

export function ShelfLoadContent({ shelfId, view, scale = 1 }: { shelfId: number; view: LoadView; scale?: number }) {
  const reserved = view.mode === "reservations";
  if (!reserved && view.loading) return <span className="block text-[10px]">Wird geladen …</span>;
  if (!reserved && view.error) return <span className="block text-[10px]">Daten nicht verfügbar</span>;
  if (!reserved && !view.imported) return <span className="block text-[10px]">Nicht importiert</span>;
  const rows = contentRows(view, shelfId);
  if (!rows.length) return <span className="block opacity-70" style={{ fontSize: 9 * scale }} data-testid={`load-empty-${shelfId}`}>{reserved ? "Keine offenen Reservierungen" : "Leer"}</span>;
  return <span className="block w-full space-y-1" data-testid={`load-content-${shelfId}`}>
    {rows.map((row, i) => {
      const carrier = (reserved ? view.carriers.find((c) => c.id === Number(row.carrierId)) : undefined) ??
        view.carriers.find((c) => c.d.name === row.spedition) ??
        view.carriers.find((c) => row.speditionId && Number(c.d.speditionId) === Number(row.speditionId));
      const bg = view.mode === "orders" || reserved ? String(carrier?.d.color || "#16a34a") : "#f59e0b";
      const fg = (view.mode === "orders" || reserved) && carrier?.d.textColor ? String(carrier.d.textColor) : articleTextColor(bg);
      const title = String(view.mode === "orders" || reserved ? row.spedition || "Ohne Spedition" : row.kunde || "Ohne Kunde / Parcours");
      const meta = view.mode === "orders" || reserved
        ? [row.relation, row.termin || row.calendarWeek, row.plusKw && `+${row.plusKw} KW`].filter(Boolean).join(" · ")
        : String(row.material || "");
      const count = Number(row.paletten) || 0;
      const deadline = reserved ? row.reservationDeadline ?? reservationDeadline(row) : undefined;
      return <span key={i} className="block rounded-lg px-1 py-1 text-left" style={{ backgroundColor: bg, color: fg }}
        title={`${title}${meta ? ` · ${meta}` : ""} · ${reserved ? `Vorgemerkt – kein Bestand · ${deadline?.detail}` : `${nf(count)} Paletten`}`}
        data-testid={`load-row-${shelfId}-${i}`}>
        <span className="flex items-start justify-between gap-1 font-bold" style={{ fontSize: 10 * scale, lineHeight: 1.3 }}>
          <span className="min-w-0 break-words">{title}</span>
          {!reserved && <span className="shrink-0 rounded-full px-1 tabular-nums" style={{ backgroundColor: fg, color: bg }} aria-label={`${nf(count)} Paletten`}>{nf(count)}</span>}
        </span>
        {reserved && <span className="block font-semibold" style={{ fontSize: 8 * scale }}>Vorgemerkt</span>}
        {meta && <span className="block break-words mt-0.5" style={{ fontSize: 8 * scale, lineHeight: 1.3 }}>{meta}</span>}
        {reserved && row.status === "offen" && deadline && <ReservationDeadlineBadge deadline={deadline} scale={scale} />}
      </span>;
    })}
  </span>;
}
