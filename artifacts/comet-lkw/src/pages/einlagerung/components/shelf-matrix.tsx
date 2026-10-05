import { useMemo } from "react";
import type { Rec } from "../lib";
import { nf } from "../lib";
import { ArticleStrip, articleTextColor } from "./article-strip";
import { buildShelfMatrix, shelfPosition, type ShelfAisle } from "./shelf-layout";

type Art = { id: number; number: string; name: string; priority: number; color: string; group: string };
type Occ = { shelf: string; ist: number; retouren: number; auftraege: number };

export function ShelfMatrix({ groups, occ, assigned, colors, istImported, onSelect }: {
  groups: ShelfAisle[]; occ: Map<string, Occ>; assigned: Map<number, Art[]>;
  colors: { free: string; occupied: string; full: string }; istImported: boolean; onSelect: (s: Rec) => void;
}) {
  const { halls, positions } = useMemo(() => buildShelfMatrix(groups), [groups]);
  const total = halls.reduce((n, h) => n + h.columns.length, 0);
  const colW = "minmax(3.6rem,1fr)";
  let col = 2;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white" data-testid="shelf-matrix">
      <div className="grid text-[10px]" style={{ gridTemplateColumns: `3rem repeat(${total}, ${colW})`, minWidth: `${3 + total * 3.6}rem` }}>
        <div className="sticky left-0 z-20 bg-slate-900 row-span-2" style={{ gridRow: "1 / span 2", gridColumn: 1 }} />
        {halls.map((h, hi) => {
          const start = col; col += h.columns.length;
          const border = hi > 0 ? "border-l-2 border-l-slate-900" : "";
          return [
            <div key={`h${hi}`} data-testid={`matrix-hall-${h.hall?.id ?? hi}`} className={`min-w-0 break-words px-0.5 bg-slate-900 text-white text-center font-bold py-1.5 text-sm ${border}`} style={{ gridRow: 1, gridColumn: `${start} / span ${h.columns.length}` }}>{String(h.hall?.d.name ?? "Ohne Halle")}</div>,
            ...h.columns.map((c, ci) => (
              <div key={`a${hi}-${c.aisle.id}`} data-testid={`matrix-aisle-${c.aisle.id}`} className={`min-w-0 break-words px-0.5 bg-slate-800 text-white text-center font-semibold py-1 ${ci === 0 ? border : ""}`} style={{ gridRow: 2, gridColumn: start + ci }}>{String(c.aisle.d.name)}</div>
            )),
          ];
        })}
        {positions.map((p, ri) => {
          let c0 = 2;
          return [
            <div key={`p${p}`} data-testid={`matrix-position-${p}`} className="sticky left-0 z-10 bg-slate-100 border-t border-slate-300 flex items-center justify-center font-bold text-slate-700" style={{ gridRow: ri + 3, gridColumn: 1 }}>{p}</div>,
            ...halls.flatMap((h, hi) => h.columns.map((c, ci) => {
              const cellCol = c0++;
              const shelves = c.shelvesByPosition.get(p) ?? [];
              return (
                <div key={`c${p}-${hi}-${c.aisle.id}`} className={`border-t border-slate-300 p-0.5 space-y-0.5 ${ci === 0 && hi > 0 ? "border-l-2 border-l-slate-900" : "border-l border-l-slate-200"}`} style={{ gridRow: ri + 3, gridColumn: cellCol }}>
                  {shelves.map((s) => {
                    const o = occ.get(String(s.d.name));
                    const used = !!o && (o.ist > 0 || o.retouren > 0 || o.auftraege > 0);
                    const st = s.d.full ? "full" : used ? "occupied" : "free";
                    const bg = colors[st];
                    const fg = articleTextColor(bg);
                    const arts = assigned.get(s.id) ?? [];
                    return (
                      <button key={s.id} type="button" onClick={() => onSelect(s)} data-testid={`matrix-shelf-${s.id}`}
                        aria-label={`Regal ${String(s.d.name)}, Position ${shelfPosition(s)}${s.d.full ? ", voll" : ""}`}
                        title={String(s.d.name)} className={`w-full min-h-[2.4rem] text-left rounded border p-0.5 space-y-0.5 ${s.d.full ? "border-red-500 border-2" : "border-slate-300"} hover:border-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900`}
                        style={{ backgroundColor: bg, color: fg,
                          ...(arts.length === 0 ? { backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(148,163,184,0.12) 4px, rgba(148,163,184,0.12) 8px)" } : {}) }}>
                        <span className="sr-only">{String(s.d.name)}</span>
                        {shelfPosition(s) === 0 && <span className="block text-[9px] font-semibold">{String(s.d.name)}</span>}
                        {arts.length === 0 && <span className="block text-[7px] leading-3" style={{ color: fg, opacity: 0.75 }}>nicht verplant</span>}
                        {arts.map((a) => <ArticleStrip key={a.id} {...a} compact />)}
                        {istImported && o && o.ist > 0 && (
                          <span className="flex justify-end"><span className="rounded-full bg-blue-600 text-white text-[9px] leading-3 font-bold px-1" title="IST-Paletten" aria-label={`IST-Paletten ${o.ist}`}>{nf(o.ist)}</span></span>
                        )}
                      </button>
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
