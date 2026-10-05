import { useState } from "react";
import type { EinlagerungSearchResultLocationsItem } from "@workspace/api-client-react";
import { useSetEinlagerungShelfStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRefreshEinlagerung, useEinlagerungState } from "../use-einlagerung";
import { errMsg, nf, P, type D } from "../lib";

function Count({ label, n, pal, imported }: { label: string; n: number; pal: number; imported: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      {imported ? (
        <div className="text-sm font-semibold text-slate-900">{nf(n)} <span className="text-xs font-normal text-slate-500">Pos. / {nf(pal)} Pal.</span></div>
      ) : (
        <div className="text-sm text-slate-400">nicht importiert</div>
      )}
    </div>
  );
}

export function LocationCard({ loc, label, has, imported, highlight }: {
  loc: EinlagerungSearchResultLocationsItem; label?: string; has: (k: string) => boolean;
  imported: { ist: boolean; retouren: boolean; auftraege: boolean }; highlight?: boolean;
}) {
  const { data: state } = useEinlagerungState();
  const total = state?.occupancy.find((x) => x.shelf === String(loc.shelf.data.name));
  const [note, setNote] = useState("");
  const status = useSetEinlagerungShelfStatus();
  const refresh = useRefreshEinlagerung();
  const { toast } = useToast();
  const sd = loc.shelf.data as D;
  const full = !!sd.full;
  const ist = loc.ist as D[], ret = loc.retouren as D[], ord = loc.orders as D[];

  const run = (isFull: boolean) =>
    status.mutate({ id: loc.shelf.id, data: { full: isFull, note: note.trim() || undefined } }, {
      onSuccess: () => { toast({ title: isFull ? "Regal als voll gemeldet" : "Regal freigegeben" }); setNote(""); refresh(); },
      onError: (e) => toast({ title: "Statuswechsel fehlgeschlagen", description: errMsg(e), variant: "destructive" }),
    });

  return (
    <div className={`rounded-lg border bg-white p-4 space-y-3 ${highlight ? "border-slate-900 shadow-sm" : "border-slate-200"}`} data-testid={`card-location-${loc.shelf.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {loc.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: loc.color }} />}
            <span className="text-lg font-bold text-slate-900 tracking-tight truncate">{String(sd.name ?? "")}</span>
          </div>
          {label && <div className="text-xs text-slate-500 mt-0.5">{label}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {loc.priority > 0 && <Badge variant="secondary">Priorität {loc.priority}</Badge>}
          {loc.group && <Badge variant="outline" style={loc.color ? { borderColor: loc.color, color: loc.color } : undefined}>{loc.group}</Badge>}
          {full && <Badge variant="destructive">Voll</Badge>}
        </div>
      </div>
      {loc.note && <p className="text-sm text-slate-700 bg-slate-50 rounded-md px-3 py-2">{loc.note}</p>}
      {full && sd.fullNote ? <p className="text-xs text-red-700">Vollmeldung: {String(sd.fullNote)}</p> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Count label="IST" n={ist.length} pal={total?.ist ?? 0} imported={imported.ist} />
        <Count label="Retouren" n={ret.length} pal={total?.retouren ?? 0} imported={imported.retouren} />
        <Count label="Aufträge" n={ord.length} pal={total?.auftraege ?? 0} imported={imported.auftraege} />
      </div>
      {(ist.length > 0 || ret.length > 0 || ord.length > 0) && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-900">Details anzeigen</summary>
          <div className="mt-2 space-y-1">
            {ist.map((x, i) => <div key={`i${i}`}>IST: {String(x.material)} - {nf(Number(x.paletten) || 0)} Pal.</div>)}
            {ret.map((x, i) => <div key={`r${i}`}>Retoure: {String(x.kunde)} - {nf(Number(x.paletten) || 0)} Pal.</div>)}
            {ord.map((x, i) => <div key={`o${i}`}>Auftrag: {String(x.spedition)} / {String(x.relation)} / {String(x.termin)} - {nf(Number(x.paletten) || 0)} Pal.</div>)}
          </div>
        </details>
      )}
      {((!full && has(P.full)) || (full && has(P.release))) && (
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {!full && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hinweis zur Vollmeldung" data-testid={`input-full-note-${loc.shelf.id}`} />}
          {full ? (
            <Button variant="outline" disabled={status.isPending} onClick={() => run(false)} data-testid={`button-release-${loc.shelf.id}`}>
              {status.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Regal freigeben
            </Button>
          ) : (
            <Button variant="destructive" disabled={status.isPending} onClick={() => run(true)} data-testid={`button-full-${loc.shelf.id}`}>
              {status.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Regal voll melden
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
