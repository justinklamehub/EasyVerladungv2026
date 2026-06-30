import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Package, ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";

interface LeitgebietRow { leitgebiet: string; auftraege: number; paletten: number; }
interface LieferterminRow { lfdat: string; auftraege: number; paletten: number; }

interface SpedResult {
  spediteurNr: string;
  csvName: string;
  speditionId: number | null;
  speditionDbName: string | null;
  matched: boolean;
  auftraege: number;
  paletten: number;
  leitgebiete: LeitgebietRow[];
  liefertermine: LieferterminRow[];
}

interface AnalyseResult {
  uploadedAt?: string;
  filename?: string | null;
  totalRows: number;
  totalPaletten: number;
  totalAuftraege: number;
  results: SpedResult[];
}

function formatLfdat(s: string): string {
  const m = s.match(/^(\d+)\.(\d{4})$/);
  if (m) return `KW\u00a0${m[1]}\u00a0/\u00a0${m[2]}`;
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

export default function AuftragsauswertungPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingLatest, setIsLoadingLatest] = useState(true);
  const [result, setResult] = useState<AnalyseResult | null>(null);

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

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Bitte eine CSV-Datei auswählen", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const text = await file.text();
      const r = await fetch(`${API_BASE}/auftragsauswertung/upload`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, filename: file.name }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: data.error ?? "Fehler bei der Auswertung", variant: "destructive" });
      } else {
        setResult(data);
        toast({
          title: `${data.results.length} Speditionen ausgewertet`,
          description: `${data.totalRows} Zeilen verarbeitet`,
        });
      }
    } catch {
      toast({ title: "Netzwerkfehler", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const triggerUpload = () => fileRef.current?.click();

  if (isLoadingLatest) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Auftragsauswertung</h1>
            <p className="text-sm text-slate-500">SAP-Export (CSV) je Spedition auswerten</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUploading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          <Button variant="outline" size="sm" onClick={triggerUpload} disabled={isUploading}>
            <Upload className="h-4 w-4 mr-2" />
            {result ? "Neue CSV hochladen" : "CSV hochladen"}
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
      />

      {!result && !isUploading && (
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
            isDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          )}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={triggerUpload}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-blue-50">
              <Upload className="h-8 w-8 text-blue-500" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-700">CSV-Datei hier ablegen</p>
              <p className="text-sm text-slate-400 mt-1">oder klicken zum Auswählen</p>
            </div>
            <p className="text-xs text-slate-400">SAP-Export, semikolongetrennt</p>
          </div>
        </div>
      )}

      {!result && isUploading && (
        <div className="border-2 border-dashed border-blue-200 bg-blue-50 rounded-xl p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-slate-600">Wird ausgewertet…</p>
          </div>
        </div>
      )}

      {result && (
        <div
          className={cn("space-y-4", isUploading && "opacity-50 pointer-events-none")}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Speditionen</p>
              <p className="text-2xl font-bold text-slate-900">{result.results.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Aufträge gesamt</p>
              <p className="text-2xl font-bold text-slate-900">{result.totalAuftraege}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Paletten (HU) gesamt</p>
              <p className="text-2xl font-bold text-slate-900">{result.totalPaletten}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-sm text-slate-500">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              {result.filename && (
                <span className="font-medium text-slate-700 truncate max-w-xs">{result.filename}</span>
              )}
              <span className="shrink-0">{result.totalRows} Zeilen</span>
              {result.uploadedAt && (
                <span className="shrink-0 ml-auto text-xs text-slate-400">
                  Hochgeladen: {formatDate(result.uploadedAt)}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Speditionsname</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Aufträge</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Paletten</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Pro Leitgebiet</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Pro Liefertermin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.results.map((s) => (
                    <tr key={s.spediteurNr} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">
                            {s.speditionDbName ?? s.csvName}
                          </span>
                          {s.matched ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" title="In Speditionsstammdaten gefunden" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" title="Nicht in Stammdaten — Speditionsnummer hinterlegen" />
                          )}
                        </div>
                        {s.matched && s.csvName && s.speditionDbName !== s.csvName && (
                          <div className="text-xs text-slate-400 mt-0.5">{s.csvName}</div>
                        )}
                        {!s.matched && (
                          <div className="text-xs text-amber-500 mt-0.5">Keine Zuordnung</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-semibold text-sm">
                          {s.auftraege}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-800">{s.paletten}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.leitgebiete.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {s.leitgebiete.map((lg) => (
                              <div key={lg.leitgebiet} className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-slate-700 w-10 shrink-0">
                                  {lg.leitgebiet}
                                </span>
                                <span className="text-xs text-slate-500 whitespace-nowrap">
                                  {lg.auftraege ?? 0}&nbsp;Auft.&nbsp;/&nbsp;{lg.paletten}&nbsp;Pal.
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.liefertermine.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {s.liefertermine.map((lt) => {
                              const lfdat = typeof lt === "string" ? lt : (lt as LieferterminRow).lfdat;
                              const auft  = typeof lt === "string" ? null : (lt as LieferterminRow).auftraege;
                              const pal   = typeof lt === "string" ? null : (lt as LieferterminRow).paletten;
                              return (
                                <div key={lfdat} className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                    {formatLfdat(lfdat)}
                                  </span>
                                  {auft !== null && (
                                    <span className="text-xs text-slate-500 whitespace-nowrap">
                                      {auft}&nbsp;Auft.&nbsp;/&nbsp;{pal}&nbsp;Pal.
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.results.some((r) => !r.matched) && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Einige Speditionen konnten nicht zugeordnet werden. Bitte{" "}
                <strong>Speditionsnummer (SAP)</strong> in den Speditionsstammdaten hinterlegen.
              </span>
            </div>
          )}

          {isDragging && (
            <div className="fixed inset-0 bg-blue-500/10 border-4 border-blue-400 border-dashed rounded-xl z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-xl px-8 py-6 shadow-xl flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-blue-500" />
                <p className="text-lg font-semibold text-slate-700">CSV ablegen zum Ersetzen</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
