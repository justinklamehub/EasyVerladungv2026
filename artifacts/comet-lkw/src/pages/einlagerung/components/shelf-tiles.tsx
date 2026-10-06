import type { Rec } from "../lib";
import { nf } from "../lib";
import { ArticleStrip, articleTextColor } from "./article-strip";
import { shelfStatus, type Art, type Occ } from "./matrix-model";
import type { ShelfAisle } from "./shelf-layout";
import { ShelfActionMenu } from "./shelf-action-menu";
import { ShelfLoadContent, type LoadView } from "./shelf-load-content";

export function ShelfTiles({ groups, occ, assigned, colors, imported, matchIds, targetId, has, onSelect, onAction, loadView }: {
  groups: ShelfAisle[]; occ: Map<string, Occ>; assigned: Map<number, Art[]>;
  colors: { free: string; occupied: string; full: string }; imported: { ist: boolean; ret: boolean; auf: boolean };
  matchIds: Set<number> | null; targetId: number | null; has: (k: string) => boolean;
  onSelect: (s: Rec) => void; onAction: (s: Rec, full: boolean) => void;
  loadView?: LoadView;
}) {
  return (
    <div className="space-y-4" data-testid="shelf-tiles">
      {groups.map(({ aisle: a, hall: h, shelves }) => (
        <section key={a.id} className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-slate-500">{String(h?.d.name ?? "")}</span>
            <span className="font-semibold text-slate-900">Gang {String(a.d.name)}</span>
            <span className="text-xs text-slate-400 ml-auto">{shelves.length} Regale</span>
          </div>
          <div className="p-3 grid gap-2 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
            {shelves.map((s) => {
              const o = occ.get(String(s.d.name));
              const st = shelfStatus(s, o);
              const arts = assigned.get(s.id) ?? [];
              const bg = colors[st];
              const fg = articleTextColor(bg);
              const sec = fg === "#ffffff" ? "#e2e8f0" : "#475569";
              const dim = !!matchIds && !matchIds.has(s.id);
              const cell = (label: string, v: number | undefined, on: boolean) => (
                <div className="flex justify-between text-[11px]"><span style={{ color: sec }}>{label}</span><span className={on ? "font-semibold" : ""} style={{ color: on ? fg : sec }}>{on ? nf(v ?? 0) : "-"}</span></div>
              );
              return (
                <div key={s.id} data-shelf-cell={s.id} className={`relative rounded-lg transition-opacity ${dim ? "opacity-30" : ""} ${targetId === s.id ? "ring-4 ring-amber-400 ring-offset-1" : matchIds && !dim ? "ring-2 ring-sky-500" : ""}`}>
                  <button type="button" onClick={() => onSelect(s)} data-testid={`tile-shelf-${s.id}`} data-shelf-id={s.id}
                    className={`w-full text-left rounded-lg border p-2.5 pr-8 hover:border-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900 ${st === "full" ? "border-red-600 border-2" : "border-slate-300"}`}
                    style={{ backgroundColor: bg, color: fg }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm">{String(s.d.name)}</span>
                      {st === "full" && <span className="text-[10px] font-semibold uppercase">Voll</span>}
                    </div>
                    {loadView && loadView.mode !== "planned" ? <ShelfLoadContent shelfId={s.id} view={loadView} /> :
                      arts.length > 0 && <div className="mb-2 space-y-1" data-testid={`articles-shelf-${s.id}`}>{arts.map((x) => <ArticleStrip key={x.id} {...x} />)}</div>}
                    {cell("IST", o?.ist, imported.ist)}{cell("Retouren", o?.retouren, imported.ret)}{cell("Aufträge", o?.auftraege, imported.auf)}
                  </button>
                  <ShelfActionMenu shelf={s} has={has} onDetails={() => onSelect(s)} onAction={onAction} className="absolute top-1.5 right-1 w-6 h-6" />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
