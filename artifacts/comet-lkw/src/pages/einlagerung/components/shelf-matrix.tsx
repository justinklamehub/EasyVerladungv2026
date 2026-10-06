import { useMemo, type RefObject } from "react";
import type { Rec } from "../lib";
import { nf } from "../lib";
import { ArticleStrip, articleTextColor } from "./article-strip";
import { buildShelfMatrix, shelfPosition, type ShelfAisle } from "./shelf-layout";
import { shelfStatus, type Art, type Occ } from "./matrix-model";
import { ShelfActionMenu } from "./shelf-action-menu";
import { ShelfLoadContent, type LoadView } from "./shelf-load-content";

const HALL_H = 30, AISLE_H = 26, POS_W = 44;

export function ShelfMatrix({ groups, occ, assigned, colors, istImported, retImported = true, aufImported = true, zoom = 100, matchIds, targetId, has, onSelect, onAction, scrollerRef, fullscreen = false, loadView }: {
  groups: ShelfAisle[]; occ: Map<string, Occ>; assigned: Map<number, Art[]>;
  colors: { free: string; occupied: string; full: string }; istImported: boolean; retImported?: boolean; aufImported?: boolean;
  zoom?: number; matchIds?: Set<number> | null; targetId?: number | null; has: (k: string) => boolean;
  onSelect: (s: Rec) => void; onAction: (s: Rec, full: boolean) => void; scrollerRef?: RefObject<HTMLDivElement | null>; fullscreen?: boolean;
  loadView?: LoadView;
}) {
  const { halls, positions } = useMemo(() => buildShelfMatrix(groups), [groups]);
  const total = halls.reduce((n, h) => n + h.columns.length, 0);
  const z = zoom / 100;
  const showLoads = !!loadView && loadView.mode !== "planned";
  const colW = Math.round((showLoads ? 130 : 92) * z), minH = Math.round((showLoads ? 76 : 54) * z);
  const fs = (n: number) => `${Math.round(n * z * 10) / 10}px`;
  let col = 2;
  return (
    <div ref={scrollerRef} tabIndex={0} aria-label="Lagerplan Matrix, scrollbar" data-testid="shelf-matrix" data-zoom={zoom}
      className="overflow-auto rounded-xl border border-slate-300 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
      style={{ maxHeight: fullscreen ? "100%" : "calc(100dvh - 14rem)", minHeight: "16rem" }}>
      <div className="grid" style={{ gridTemplateColumns: `${POS_W}px repeat(${total}, ${colW}px)`, gridTemplateRows: `${HALL_H}px ${AISLE_H}px`, width: POS_W + total * colW }}>
        <div data-matrix-corner className="sticky left-0 top-0 z-30 bg-slate-900" style={{ gridRow: "1 / span 2", gridColumn: 1, height: HALL_H + AISLE_H, width: POS_W }} />
        {halls.map((h, hi) => {
          const start = col; col += h.columns.length;
          const border = hi > 0 ? "border-l-2 border-l-slate-100" : "";
          return [
            <div key={`h${hi}`} data-testid={`matrix-hall-${h.hall?.id ?? hi}`} className={`sticky top-0 z-20 min-w-0 truncate px-1 bg-slate-900 text-white text-center font-bold text-sm flex items-center justify-center ${border}`} style={{ gridRow: 1, gridColumn: `${start} / span ${h.columns.length}`, height: HALL_H }}>{String(h.hall?.d.name ?? "Ohne Halle")}</div>,
            ...h.columns.map((c, ci) => (
              <div key={`a${hi}-${c.aisle.id}`} data-testid={`matrix-aisle-${c.aisle.id}`} className={`sticky z-20 min-w-0 truncate px-1 bg-slate-700 text-white text-center text-xs font-semibold flex items-center justify-center ${ci === 0 ? border : ""}`} style={{ gridRow: 2, gridColumn: start + ci, top: HALL_H, height: AISLE_H }}>Gang {String(c.aisle.d.name)}</div>
            )),
          ];
        })}
        {positions.map((p, ri) => {
          let c0 = 2;
          return [
            <div key={`p${p}`} data-testid={`matrix-position-${p}`} title={p === 0 ? "Sonderposition 0" : `Position ${p}`} className="sticky left-0 z-10 bg-slate-100 border-t border-slate-300 flex items-center justify-center font-bold text-slate-700" style={{ gridRow: ri + 3, gridColumn: 1, fontSize: fs(12) }}>{p}</div>,
            ...halls.flatMap((h, hi) => h.columns.map((c, ci) => {
              const cellCol = c0++;
              const shelves = c.shelvesByPosition.get(p) ?? [];
              return (
                <div key={`c${p}-${hi}-${c.aisle.id}`} className={`border-t border-slate-300 p-0.5 space-y-0.5 ${shelves.length === 0 ? "bg-slate-50" : ""} ${ci === 0 && hi > 0 ? "border-l-2 border-l-slate-900" : "border-l border-l-slate-200"}`} style={{ gridRow: ri + 3, gridColumn: cellCol }}>
                  {shelves.map((s) => {
                    const o = occ.get(String(s.d.name));
                    const st = shelfStatus(s, o);
                    const bg = colors[st];
                    const fg = articleTextColor(bg);
                    const arts = assigned.get(s.id) ?? [];
                    const dim = !!matchIds && !matchIds.has(s.id);
                    const isTarget = targetId === s.id;
                    const name = String(s.d.name);
                    return (
                      <div key={s.id} data-shelf-cell={s.id} data-dimmed={dim || undefined}
                        className={`relative rounded transition-opacity ${dim ? "opacity-30" : ""} ${isTarget ? "ring-4 ring-amber-400 ring-offset-1 z-[5]" : matchIds && !dim ? "ring-2 ring-sky-500" : ""}`}>
                        <button type="button" onClick={() => onSelect(s)} data-testid={`matrix-shelf-${s.id}`} data-shelf-id={s.id} data-state={st}
                          aria-label={`Regal ${name}, Position ${shelfPosition(s)}, ${st === "full" ? "voll" : st === "occupied" ? "belegt" : "frei"}${o && istImported ? `, IST ${o.ist} Paletten` : ""}${arts.length === 0 ? ", nicht verplant" : ""}${dim ? ", ausgeblendet durch Filter" : ""}`}
                          className={`w-full text-left rounded border p-0.5 pr-5 space-y-0.5 flex flex-col ${st === "full" ? "border-red-600 border-2" : "border-slate-400"} hover:border-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900`}
                          style={{ backgroundColor: bg, color: fg, minHeight: minH,
                            ...((showLoads ? !(loadView.byShelf.get(s.id)?.[loadView.mode === "orders" ? "orders" : "retouren"].length) : arts.length === 0) ? { backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(100,116,139,0.14) 4px, rgba(100,116,139,0.14) 8px)" } : {}) }}>
                          <span className="block font-bold leading-tight truncate" style={{ fontSize: fs(11) }}>{name}{st === "full" && <span className="ml-1 uppercase" style={{ fontSize: fs(8) }}>voll</span>}</span>
                          {showLoads ? <ShelfLoadContent shelfId={s.id} view={loadView} scale={z} /> : <>
                            {arts.length === 0 && <span className="block leading-tight" style={{ fontSize: fs(8), opacity: 0.8 }}>nicht verplant</span>}
                            {arts.map((a) => <ArticleStrip key={a.id} {...a} compact scale={z} />)}
                          </>}
                          {!showLoads && <span className="flex flex-wrap justify-end gap-0.5 mt-auto">
                            {istImported && o && o.ist > 0 && <span className="rounded-full bg-blue-700 text-white font-bold px-1" style={{ fontSize: fs(9), lineHeight: 1.3 }} title="IST-Paletten">{nf(o.ist)}</span>}
                            {retImported && o && o.retouren > 0 && <span className="rounded-full bg-amber-500 text-slate-900 font-bold px-1" style={{ fontSize: fs(9), lineHeight: 1.3 }} title="Retouren-Paletten">R{nf(o.retouren)}</span>}
                            {aufImported && o && o.auftraege > 0 && <span className="rounded-full bg-violet-700 text-white font-bold px-1" style={{ fontSize: fs(9), lineHeight: 1.3 }} title="Auftrags-Paletten">A{nf(o.auftraege)}</span>}
                          </span>}
                        </button>
                        <ShelfActionMenu shelf={s} has={has} onDetails={() => onSelect(s)} onAction={onAction} className="absolute top-0.5 right-0.5 w-4 h-5" />
                      </div>
                    );
                  })}
                </div>
              );
            })),
          ];
        })}
      </div>
    </div>
  );
}
