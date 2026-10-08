import { useMemo, useRef, useState } from "react";
import type { SearchEinlagerungParams } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ScanLine, Search } from "lucide-react";
import { LocationCard } from "./location-card";
import { datasetOf, DATASET_LABELS, errMsg, useModel } from "../lib";
import { useEinlagerungState, useWarehouseSearch } from "../use-einlagerung";

export function ArticleLookup({ has, large, scannerMode = false }: { has: (k: string) => boolean; large?: boolean; scannerMode?: boolean }) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const { data: state } = useEinlagerungState();
  const model = useModel(state);
  const params = useMemo<SearchEinlagerungParams>(() => ({ mode: "artikel", q: submitted }), [submitted]);
  const q = useWarehouseSearch(params, !!submitted);
  const imported = {
    ist: !!datasetOf(state?.datasets, "istbestand"),
    retouren: !!datasetOf(state?.datasets, "retouren"),
    auftraege: !!datasetOf(state?.datasets, "auftraege"),
  };
  const stale = ["istbestand", "retouren", "auftraege"].filter((type) => {
    const d = datasetOf(state?.datasets, type);
    return d && Date.now() - new Date(d.importedAt).getTime() > (state?.settings.staleHours ?? 24) * 3_600_000;
  });

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setSubmitted(v);
    if (v === submitted) q.refetch();
    if (scannerMode) {
      setText("");
      ref.current?.focus();
    } else {
      ref.current?.select();
    }
  };

  const res = q.data;
  return (
    <div className="space-y-4">
      {!scannerMode && stale.length > 0 && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Bestandsdaten veraltet: {stale.map((type) => DATASET_LABELS[type]).join(", ")}. Bitte den CSV-Stand aktualisieren.
      </p>}
      <form onSubmit={go} className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            ref={ref} autoFocus type="text" inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
            value={text} onChange={(e) => setText(e.target.value)} placeholder="EAN oder Artikelnummer scannen"
            className={`pl-9 font-mono tracking-wide ${large ? "h-14 text-xl" : "h-10"}`} data-testid="input-article-scan"
          />
        </div>
        <Button type="submit" className={large ? "h-14 px-6" : ""} disabled={!text.trim() || q.isFetching} data-testid="button-article-search">
          {q.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Suchen</span>
        </Button>
      </form>

      {!submitted && <p className="text-sm text-slate-500">Führende Nullen bleiben erhalten. Eingabe mit Enter bestätigen.</p>}
      {submitted && q.isLoading && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{errMsg(q.error)}</span>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button>
        </div>
      )}
      {res && (
        <div className="space-y-3" data-testid="result-article">
          {res.article && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500">Artikel</div>
              <div className="text-lg font-bold text-slate-900">{String((res.article.data as any).name ?? "")}</div>
              <div className="text-sm text-slate-600 font-mono">{String((res.article.data as any).number ?? "")}{(res.article.data as any).ean ? ` / EAN ${(res.article.data as any).ean}` : ""}</div>
            </div>
          )}
          {res.message && <p className="text-sm text-slate-700">{res.message}</p>}
          {res.locations.length === 0 && !q.isFetching && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Kein Lagerplatz für diese Eingabe gefunden.</div>
          )}
          {res.locations.map((loc, i) => (
            <LocationCard key={loc.shelf.id} loc={loc} has={has} imported={imported} highlight={i === 0} scannerDetails={scannerMode}
              label={`${i === 0 ? "Erste Wahl - " : ""}${model.shelfLabel(model.shelfById.get(loc.shelf.id))}`} />
          ))}
        </div>
      )}
    </div>
  );
}
