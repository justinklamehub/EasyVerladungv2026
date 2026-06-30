import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, RefreshCw, Package, ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";

interface LeitgebietRow { leitgebiet: string; anzahl: number; }

interface SpedResult {
  spediteurNr: string;
  csvName: string;
  speditionId: number | null;
  speditionDbName: string | null;
  matched: boolean;
  auftraege: number;
  paletten: number;
  kartons: number;
  leitgebiete: LeitgebietRow[];
  liefertermine: string[];
}

interface AnalyseResult {
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

export default function AuftragsauswertungPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [filename, setFilename] = useState("");

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Bitte eine CSV-Datei auswählen", variant: "destructive" });
      return;
    }
    setFilename(file.name);
    setIsLoading(true);
    setResult(null);
    try {
      const text = await file.text();
      const r = await fetch(`${API_BASE}/auftragsauswertung/upload`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: data.error ?? "Fehler bei der Auswertung", variant: "destructive" });
        setFilename("");
      } else {
        setResult(data);
        toast({
          title: `${data.results.length} Speditionen ausgewertet`,
          description: `${data.totalRows} Zeilen verarbeitet`,
        });
      }
    } catch {
      toast({ title: "Netzwerkfehler", variant: "destructive" });
      setFilename("");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const reset = () => {
    setResult(null);
    setFilename("");
    if (fileRef.current) fileRef.current.value = "";
  };

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
        {result && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Neue Auswertung
          </Button>
        )}
      </div>

      {!result && (
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
            isDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          )}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          />
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <p className="text-sm font-medium">Wird ausgewertet…</p>
              {filename && <p className="text-xs text-slate-400">{filename}</p>}
            </div>
          ) : (
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
          )}
        </div>
      )}

      {result && (
        <div className="space-y-4">
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
              <FileSpreadsheet className="h-4 w-4" />
              <span className="font-medium text-slate-700">{filename}</span>
              <span>— {result.totalRows} Zeilen</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Spediteur-Nr.</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Speditionsname</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Aufträge</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Paletten</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600 whitespace-nowrap">Kartons</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Leitgebiete</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Liefertermin(e)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.results.map((s) => (
                    <tr key={s.spediteurNr} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                        {s.spediteurNr}
                      </td>
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
                      <td className="px-4 py-3 text-center text-slate-600">
                        {s.kartons > 0 ? s.kartons : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {s.leitgebiete.map((lg) => (
                            <Badge
                              key={lg.leitgebiet}
                              variant="secondary"
                              className="text-xs font-mono px-1.5 py-0"
                            >
                              {lg.leitgebiet}
                              {lg.anzahl > 1 && (
                                <span className="ml-1 text-slate-400">×{lg.anzahl}</span>
                              )}
                            </Badge>
                          ))}
                          {s.leitgebiete.length === 0 && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">
                        {s.liefertermine.map((lt) => (
                          <div key={lt}>{formatLfdat(lt)}</div>
                        ))}
                        {s.liefertermine.length === 0 && <span className="text-slate-300">—</span>}
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
        </div>
      )}
    </div>
  );
}
