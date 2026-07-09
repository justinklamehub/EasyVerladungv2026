import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2,
  ClipboardList, Eye, EyeOff, User, Filter, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";

interface LeitgebietRow {
  leitgebiet: string;
  auftraege: number;
  paletten: number;
  punkte: number;
}

interface LieferterminRow {
  lfdat: string;
  auftraege: number;
  paletten: number;
  punkte: number;
  leitgebiete: LeitgebietRow[];
}

interface SpedResult {
  spediteurNr: string;
  csvName: string;
  speditionId: number | null;
  speditionDbName: string | null;
  matched: boolean;
  auftraege: number;
  paletten: number;
  punkte: number;
  freigegeben: boolean;
  liefertermine: LieferterminRow[];
}

interface AnalyseResult {
  uploadedAt?: string;
  filename?: string | null;
  uploadedByUsername?: string | null;
  totalRows: number;
  totalPaletten: number;
  totalAuftraege: number;
  totalPunkte: number;
  results: SpedResult[];
}

function formatLfdat(s: string): string {
  if (!s) return "—";
  const m = s.match(/^(\d+)\.(\d{4})$/);
  if (m) return `KW\u00a0${m[1]}\u00a0/\u00a0${m[2]}`;
  const d = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (d) return `${d[1]}.${d[2]}.${d[3]}`;
  return s;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

const SPED_ROLES = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"];

/** Renders the nested Liefertermin → Leitgebiet hierarchy */
function LieferterminBlock({ liefertermine }: { liefertermine: LieferterminRow[] }) {
  if (liefertermine.length === 0) return <span className="text-slate-300 text-xs">—</span>;

  return (
    <div className="space-y-3">
      {liefertermine.map((lt, i) => (
        <div key={lt.lfdat || i}>
          {/* Liefertermin header row */}
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              {formatLfdat(lt.lfdat)}
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
              {lt.auftraege}&thinsp;A&thinsp;/&thinsp;{lt.paletten}&thinsp;Pal.
            </span>
            {(lt.punkte ?? 0) > 0 && (
              <span className="text-[11px] font-medium text-violet-600 tabular-nums whitespace-nowrap">
                {lt.punkte.toLocaleString("de-DE", { maximumFractionDigits: 2 })}&thinsp;Pkt.
              </span>
            )}
          </div>

          {/* Leitgebiet sub-rows */}
          {(lt.leitgebiete ?? []).length > 0 && (
            <div className="pl-3 border-l-2 border-slate-100 space-y-0.5">
              {(lt.leitgebiete ?? []).map((lg, j) => (
                <div key={lg.leitgebiet || j} className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-600 whitespace-nowrap min-w-[100px]">
                    {lg.leitgebiet || "—"}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                    {lg.auftraege}&thinsp;A&thinsp;/&thinsp;{lg.paletten}&thinsp;Pal.
                  </span>
                  {(lg.punkte ?? 0) > 0 && (
                    <span className="text-[11px] font-medium text-violet-500 tabular-nums whitespace-nowrap">
                      {lg.punkte.toLocaleString("de-DE", { maximumFractionDigits: 2 })}&thinsp;Pkt.
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AuftragsauswertungPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileZlthu2Ref = useRef<HTMLInputElement>(null);
  const fileDarkRef = useRef<HTMLInputElement>(null);
  const [pendingZlthu2, setPendingZlthu2] = useState<File | null>(null);
  const [pendingDark, setPendingDark] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingLatest, setIsLoadingLatest] = useState(true);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [togglingNr, setTogglingNr] = useState<string | null>(null);
  const [filterSpedition, setFilterSpedition] = useState("");
  const [filterLiefertermin, setFilterLiefertermin] = useState("");
  const [filterRelation, setFilterRelation] = useState("");

  const isSpedUser = SPED_ROLES.includes(user?.role ?? "");
  const isCometUser = !isSpedUser;
  const mySpeditionId = user?.speditionId ?? null;

  useEffect(() => {
    let cancelled = false;
    setIsLoadingLatest(true);
    fetch(`${API_BASE}/auftragsauswertung/latest`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setResult(data ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingLatest(false); });
    return () => { cancelled = true; };
  }, []);

  const processFiles = useCallback(async (zlthu2: File, dark: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("zlthu2", zlthu2, zlthu2.name);
      formData.append("dark", dark, dark.name);
      const r = await fetch(`${API_BASE}/auftragsauswertung/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: data.error ?? "Fehler bei der Auswertung", variant: "destructive" });
      } else {
        setResult({ ...data, uploadedByUsername: user?.username ?? null });
        setPendingZlthu2(null);
        setPendingDark(null);
        toast({
          title: `${data.results.length} Speditionen ausgewertet`,
          description: `${data.totalRows} Zeilen verarbeitet`,
        });
      }
    } catch {
      toast({ title: "Netzwerkfehler", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileZlthu2Ref.current) fileZlthu2Ref.current.value = "";
      if (fileDarkRef.current) fileDarkRef.current.value = "";
    }
  }, [toast, user?.username]);

  const toggleFreigabe = useCallback(async (spediteurNr: string, freigegeben: boolean) => {
    setTogglingNr(spediteurNr);
    try {
      const r = await fetch(`${API_BASE}/auftragsauswertung/freigaben`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spediteurNr, freigegeben }),
      });
      if (!r.ok) {
        const d = await r.json();
        toast({ title: d.error ?? "Fehler beim Freigeben", variant: "destructive" });
        return;
      }
      setResult((prev) => prev ? {
        ...prev,
        results: prev.results.map((e) =>
          e.spediteurNr === spediteurNr ? { ...e, freigegeben } : e
        ),
      } : prev);
    } catch {
      toast({ title: "Netzwerkfehler", variant: "destructive" });
    } finally {
      setTogglingNr(null);
    }
  }, [toast]);

  // ── Derived filter data ────────────────────────────────────────────────────
  const allSpeditionen = useMemo(() =>
    Array.from(new Set((result?.results ?? []).map(s => s.speditionDbName ?? s.csvName))).sort(),
    [result]
  );
  const allLfdat = useMemo(() => {
    const set = new Set<string>();
    (result?.results ?? [])
      .filter(s => !filterSpedition || (s.speditionDbName ?? s.csvName) === filterSpedition)
      .forEach(s => s.liefertermine.forEach(lt => { if (lt.lfdat) set.add(lt.lfdat); }));
    return Array.from(set).sort();
  }, [result, filterSpedition]);
  const allRelationen = useMemo(() => {
    const set = new Set<string>();
    (result?.results ?? [])
      .filter(s => !filterSpedition || (s.speditionDbName ?? s.csvName) === filterSpedition)
      .forEach(s => s.liefertermine
        .filter(lt => !filterLiefertermin || lt.lfdat === filterLiefertermin)
        .forEach(lt => lt.leitgebiete.forEach(lg => { if (lg.leitgebiet) set.add(lg.leitgebiet); })));
    return Array.from(set).sort();
  }, [result, filterSpedition, filterLiefertermin]);

  // Auto-reset dependent filters when parent filter changes and value no longer exists
  useEffect(() => {
    if (filterLiefertermin && !allLfdat.includes(filterLiefertermin)) setFilterLiefertermin("");
  }, [allLfdat, filterLiefertermin]);
  useEffect(() => {
    if (filterRelation && !allRelationen.includes(filterRelation)) setFilterRelation("");
  }, [allRelationen, filterRelation]);

  const hasActiveFilter = !!(filterSpedition || filterLiefertermin || filterRelation);

  const filteredResults = useMemo(() => {
    if (!result) return [];
    return result.results.filter(s => {
      if (isCometUser && filterSpedition && (s.speditionDbName ?? s.csvName) !== filterSpedition) return false;
      if (filterLiefertermin || filterRelation) {
        const hasMatch = s.liefertermine.some(lt => {
          if (filterLiefertermin && lt.lfdat !== filterLiefertermin) return false;
          if (filterRelation) return lt.leitgebiete.some(lg => (lg.leitgebiet ?? "").toLowerCase().includes(filterRelation.toLowerCase()));
          return true;
        });
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [result, filterSpedition, filterLiefertermin, filterRelation, isCometUser]);

  const filteredTotals = useMemo(() => ({
    auftraege: filteredResults.reduce((s, r) => s + r.auftraege, 0),
    paletten:  filteredResults.reduce((s, r) => s + r.paletten, 0),
    punkte:    Math.round(filteredResults.reduce((s, r) => s + r.punkte, 0) * 100) / 100,
  }), [filteredResults]);

  const bothReady = !!(pendingZlthu2 && pendingDark);

  if (isLoadingLatest) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Auftragsauswertung</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {isSpedUser ? "Freigegebene Auswertung" : "SAP-Export (CSV) je Spedition"}
            </p>
          </div>
        </div>
        {!isSpedUser && result && !isUploading && (
          <Button
            variant="outline" size="sm"
            onClick={() => { setPendingZlthu2(null); setPendingDark(null); setResult(null); }}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Neue Auswertung
          </Button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={fileZlthu2Ref} type="file" accept=".csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingZlthu2(f); }} />
      <input ref={fileDarkRef} type="file" accept=".csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingDark(f); }} />

      {/* Dual-file upload panel (shown when no result yet, or after "Neue Auswertung") */}
      {!result && !isSpedUser && (
        <div className="space-y-4">
          {isUploading ? (
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-14 text-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-sm font-medium text-blue-600">Wird ausgewertet…</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {/* ZLTHU2 upload box */}
                <div
                  className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer select-none transition-all",
                    pendingZlthu2
                      ? "border-green-300 bg-green-50/60"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                  )}
                  onClick={() => fileZlthu2Ref.current?.click()}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className={cn("p-3 rounded-full", pendingZlthu2 ? "bg-green-100" : "bg-slate-100")}>
                      {pendingZlthu2
                        ? <CheckCircle2 className="h-6 w-6 text-green-600" />
                        : <FileSpreadsheet className="h-6 w-6 text-slate-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-700">ZLTHU2.csv</p>
                      <p className="text-xs text-slate-400 mt-0.5">Aufträge mit Lieferungsnummern</p>
                      {pendingZlthu2
                        ? <p className="text-xs font-medium text-green-600 mt-2 truncate max-w-[200px]">{pendingZlthu2.name}</p>
                        : <p className="text-xs text-slate-300 mt-2">klicken zum Auswählen</p>}
                    </div>
                  </div>
                </div>

                {/* DownloadDark upload box */}
                <div
                  className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer select-none transition-all",
                    pendingDark
                      ? "border-green-300 bg-green-50/60"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                  )}
                  onClick={() => fileDarkRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className={cn("p-3 rounded-full", pendingDark ? "bg-green-100" : "bg-slate-100")}>
                      {pendingDark
                        ? <CheckCircle2 className="h-6 w-6 text-green-600" />
                        : <FileSpreadsheet className="h-6 w-6 text-slate-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-700">DownloadDark.csv</p>
                      <p className="text-xs text-slate-400 mt-0.5">Punkte (NTGEW14G) je Lieferung</p>
                      {pendingDark
                        ? <p className="text-xs font-medium text-green-600 mt-2 truncate max-w-[200px]">{pendingDark.name}</p>
                        : <p className="text-xs text-slate-300 mt-2">klicken zum Auswählen</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  size="sm"
                  disabled={!bothReady}
                  onClick={() => { if (pendingZlthu2 && pendingDark) processFiles(pendingZlthu2, pendingDark); }}
                  className="gap-2 px-8"
                >
                  <Upload className="h-4 w-4" />
                  {bothReady ? "Auswertung starten" : "Beide Dateien auswählen"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {!result && isSpedUser && (
        <div className="border border-slate-200 rounded-xl p-14 text-center">
          <FileSpreadsheet className="h-9 w-9 mx-auto mb-3 text-slate-200" />
          <p className="text-sm text-slate-400">Noch keine Auswertung verfügbar</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={cn("space-y-4", !isSpedUser && isUploading && "opacity-40 pointer-events-none transition-opacity")}>
          {/* Summary cards */}
          {!isSpedUser && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Speditionen",          value: (hasActiveFilter ? filteredResults.length : result.results.length).toLocaleString("de-DE"), accent: false },
                { label: "Aufträge gesamt",      value: (hasActiveFilter ? filteredTotals.auftraege : result.totalAuftraege).toLocaleString("de-DE"), accent: false },
                { label: "Paletten (HU) gesamt", value: (hasActiveFilter ? filteredTotals.paletten  : result.totalPaletten).toLocaleString("de-DE"),  accent: false },
                { label: "Punkte gesamt",        value: (hasActiveFilter ? filteredTotals.punkte    : result.totalPunkte ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 2 }), accent: true },
              ].map(({ label, value, accent }) => (
                <div key={label} className={cn("bg-white border rounded-lg px-5 py-4", accent ? "border-violet-200 bg-violet-50/40" : "border-slate-200")}>
                  <p className={cn("text-xs font-medium uppercase tracking-wide mb-1", accent ? "text-violet-500" : "text-slate-400")}>{label}</p>
                  <p className={cn("text-2xl font-bold tabular-nums", accent ? "text-violet-700" : "text-slate-800")}>{value}</p>
                  {hasActiveFilter && <p className="text-[11px] text-slate-400 mt-0.5">gefiltert</p>}
                </div>
              ))}
            </div>
          )}

          {/* Main table card */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {/* Meta bar */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 flex-wrap">
              <FileSpreadsheet className="h-4 w-4 text-slate-400 shrink-0" />
              {result.filename && (
                <span className="text-sm font-medium text-slate-700">{result.filename}</span>
              )}
              {!isSpedUser && result.totalRows > 0 && (
                <span className="text-xs text-slate-400 bg-slate-200 rounded px-2 py-0.5 font-mono">
                  {result.totalRows.toLocaleString("de-DE")} Zeilen
                </span>
              )}
              <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
                {result.uploadedByUsername && (
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {result.uploadedByUsername}
                  </span>
                )}
                {result.uploadedAt && <span>{formatDate(result.uploadedAt)}</span>}
              </div>
            </div>

            {/* Filter bar */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap bg-white">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {isCometUser && (
                <Select value={filterSpedition} onValueChange={setFilterSpedition}>
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Spedition…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {allSpeditionen.map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={filterLiefertermin} onValueChange={setFilterLiefertermin}>
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="Liefertermin…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {allLfdat.map(d => (
                    <SelectItem key={d} value={d} className="text-xs">{formatLfdat(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterRelation} onValueChange={setFilterRelation}>
                <SelectTrigger className="h-8 text-xs w-[180px]">
                  <SelectValue placeholder="Relation…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {allRelationen.map(r => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilter && (
                <Button
                  variant="ghost" size="sm"
                  className="h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-800"
                  onClick={() => { setFilterSpedition(""); setFilterLiefertermin(""); setFilterRelation(""); }}
                >
                  <X className="h-3.5 w-3.5" />
                  Filter zurücksetzen
                </Button>
              )}
              {hasActiveFilter && (
                <span className="ml-auto text-xs text-slate-400">
                  {filteredResults.length} von {result.results.length} Speditionen
                </span>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Spedition
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      Aufträge
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      Paletten
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-violet-500 uppercase tracking-wide whitespace-nowrap">
                      Punkte
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Liefertermin / Leitgebiet
                    </th>
                    {!isSpedUser && (
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        Freigabe
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredResults.map((s) => {
                    const isOwn = s.speditionId === mySpeditionId;
                    const displayedLiefertermine = (filterLiefertermin || filterRelation)
                      ? s.liefertermine
                          .filter(lt => !filterLiefertermin || lt.lfdat === filterLiefertermin)
                          .map(lt => ({
                            ...lt,
                            leitgebiete: filterRelation
                              ? lt.leitgebiete.filter(lg => (lg.leitgebiet ?? "").toLowerCase().includes(filterRelation.toLowerCase()))
                              : lt.leitgebiete,
                          }))
                          .filter(lt => !filterRelation || lt.leitgebiete.length > 0)
                      : s.liefertermine;
                    return (
                      <tr
                        key={s.spediteurNr}
                        className={cn(
                          "align-top hover:bg-slate-50/70 transition-colors",
                          isSpedUser && isOwn && "bg-blue-50/30"
                        )}
                      >
                        {/* Spedition name */}
                        <td className="px-5 py-4 min-w-[180px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">
                              {s.speditionDbName ?? s.csvName}
                            </span>
                            {!isSpedUser && (
                              s.matched
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" title="In Stammdaten gefunden" />
                                : <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" title="Nicht zugeordnet" />
                            )}
                            {isSpedUser && isOwn && (
                              <span className="text-[11px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full leading-none">
                                Ihre Spedition
                              </span>
                            )}
                          </div>
                          {!isSpedUser && s.matched && s.csvName && s.speditionDbName !== s.csvName && (
                            <div className="text-xs text-slate-400 mt-1">{s.csvName}</div>
                          )}
                          {!isSpedUser && !s.matched && (
                            <div className="text-xs text-amber-500 mt-1">Keine Zuordnung</div>
                          )}
                        </td>

                        {/* Aufträge total */}
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-blue-50 text-blue-700 font-bold text-sm tabular-nums min-w-[2.5rem] h-9 px-2">
                            {s.auftraege}
                          </span>
                        </td>

                        {/* Paletten total */}
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-slate-700 tabular-nums text-base">
                            {s.paletten.toLocaleString("de-DE")}
                          </span>
                        </td>

                        {/* Punkte total */}
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-violet-50 text-violet-700 font-bold text-sm tabular-nums min-w-[3rem] h-9 px-2">
                            {(s.punkte ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Liefertermin → Leitgebiet (nested) */}
                        <td className="px-5 py-4 min-w-[280px]">
                          <LieferterminBlock liefertermine={displayedLiefertermine} />
                        </td>

                        {/* Freigabe toggle */}
                        {!isSpedUser && (
                          <td className="px-4 py-4 text-center">
                            {togglingNr === s.spediteurNr ? (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-300 mx-auto" />
                            ) : (
                              <div className="flex flex-col items-center gap-1.5">
                                <Switch
                                  checked={s.freigegeben}
                                  onCheckedChange={(v) => toggleFreigabe(s.spediteurNr, v)}
                                  disabled={togglingNr !== null}
                                />
                                {s.freigegeben
                                  ? <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600"><Eye className="h-3 w-3" />freigegeben</span>
                                  : <span className="flex items-center gap-1 text-[10px] text-slate-400"><EyeOff className="h-3 w-3" />gesperrt</span>
                                }
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unmatched warning */}
          {!isSpedUser && result.results.some((r) => !r.matched) && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Einige Speditionen konnten nicht zugeordnet werden. Bitte die{" "}
                <strong>Speditionsnummer (SAP)</strong> in den Stammdaten hinterlegen.
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
