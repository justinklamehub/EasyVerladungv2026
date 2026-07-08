import { useState, useRef, useEffect } from "react";
import { useBulkCreateShipments, useListSpeditionen, getListShipmentsQueryKey, ShipmentInputLkwArt, ShipmentInputStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertCircle, Upload, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Retoure", "Sattelzug", "Wechselbrücke", "Sonstige", "Korrektur"];
const TOR_OPTIONS = [...Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`), "Tor A", "Tor B", "Tor C"];
const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen"];

export interface RowData {
  id: number;
  kennzeichen: string;
  bezeichnung: string;
  lkwArt: string;
  etaDate: string;
  etaTime: string;
  tor: string;
  speditionId: string;
  subSpedition: string;
  relation: string;
  telefon: string;
  bemerkungen: string;
  status: string;
}

export function emptyRow(id: number, partial?: Partial<RowData>): RowData {
  return {
    id,
    kennzeichen: "",
    bezeichnung: "",
    lkwArt: "",
    etaDate: "",
    etaTime: "",
    tor: "",
    speditionId: "",
    subSpedition: "",
    relation: "",
    telefon: "",
    bemerkungen: "",
    status: "Angemeldet",
    ...partial,
  };
}

let rowCounter = 1;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialRows?: Partial<RowData>[];
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function normalizeLkwArt(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const opt of LKW_ART_OPTIONS) {
    if (opt.toLowerCase() === lower) return opt;
  }
  return raw.trim();
}

function normalizeTor(raw: string): string {
  const lower = raw.toLowerCase().trim().replace(/\s+/g, " ");
  for (const opt of TOR_OPTIONS) {
    if (opt.toLowerCase() === lower) return opt;
  }
  const m = raw.match(/\d+/);
  if (m) return `Tor ${m[0]}`;
  return raw.trim();
}

function parseDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

function parseCsv(text: string, isCometUser: boolean): Partial<RowData>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^\uFEFF/, "").toLowerCase());

  const idx = (keywords: string[]): number => {
    for (const kw of keywords) {
      const i = headers.findIndex((h) => h.includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };

  const colKennzeichen  = idx(["kennzeichen", "license", "kfz"]);
  const colBezeichnung  = idx(["bezeichnung", "title", "name", "description"]);
  const colLkwArt       = idx(["lkw-art", "lkwart", "art", "type", "fahrzeug"]);
  const colEtaDate      = idx(["datum", "date", "eta dat"]);
  const colEtaTime      = idx(["zeit", "time", "eta z"]);
  const colTor          = isCometUser ? idx(["tor", "gate", "dock"]) : -1;
  const colRelation     = idx(["relation", "route", "strecke"]);
  const colTelefon      = idx(["telefon", "phone", "tel"]);
  const colBemerkungen  = idx(["bemerkung", "remark", "notiz", "note", "comment"]);

  const rows: Partial<RowData>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep);
    const get = (col: number) => (col >= 0 ? (cells[col] ?? "").trim() : "");

    const kz = get(colKennzeichen);
    if (!kz) continue;

    rows.push({
      kennzeichen: kz,
      bezeichnung: get(colBezeichnung),
      lkwArt:      normalizeLkwArt(get(colLkwArt)),
      etaDate:     parseDate(get(colEtaDate)),
      etaTime:     get(colEtaTime),
      tor:         isCometUser ? normalizeTor(get(colTor)) : "",
      relation:    get(colRelation),
      telefon:     get(colTelefon),
      bemerkungen: get(colBemerkungen),
      status:      "Angemeldet",
    });
  }
  return rows;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkCreateDialog({ open, onOpenChange, initialRows }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: speditionen } = useListSpeditionen();
  const fileRef = useRef<HTMLInputElement>(null);

  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(user?.role ?? "");
  const isSpedUser  = ["speditions_admin", "speditions_bearbeiter"].includes(user?.role ?? "");

  const [rows, setRows] = useState<RowData[]>([emptyRow(rowCounter++)]);
  const [fieldErrors, setFieldErrors] = useState<Map<number, Set<keyof RowData>>>(new Map());

  // Muster-CSV: role-aware columns
  function downloadCsvTemplate() {
    const columns = [
      "Kennzeichen",
      "Bezeichnung",
      "LKW-Art",
      "ETA Datum (JJJJ-MM-TT)",
      "ETA Zeit (HH:MM)",
      ...(isCometUser ? ["Tor"] : []),
      "Relation",
      "Telefon",
      "Bemerkungen",
    ];
    const example = [
      "M-AB 1234",
      "Wöchentliche Lieferung",
      "Container",
      "2025-07-01",
      "08:00",
      ...(isCometUser ? ["Tor 3"] : []),
      "München → Hamburg",
      "+49 89 12345",
      "Bitte Kühlung beachten",
    ];
    const blob = new Blob(["\uFEFF" + columns.join(";") + "\r\n" + example.join(";") + "\r\n"], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "verladungen_vorlage.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (open && initialRows && initialRows.length > 0) {
      setRows(initialRows.map((partial) => emptyRow(rowCounter++, partial)));
      setFieldErrors(new Map());
    }
  }, [open, initialRows]);

  const bulkMutation = useBulkCreateShipments({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        toast({ title: `${created.length} Verladung${created.length !== 1 ? "en" : ""} erfolgreich angelegt` });
        setRows([emptyRow(rowCounter++)]);
        setFieldErrors(new Map());
        onOpenChange(false);
      },
      onError: (e: any) => {
        toast({ title: e?.response?.data?.error ?? "Fehler beim Anlegen", variant: "destructive" });
      },
    },
  });

  const updateRow = (id: number, field: keyof RowData, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    if (value.trim()) {
      setFieldErrors((prev) => {
        if (!prev.has(id)) return prev;
        const rowSet = prev.get(id)!;
        if (!rowSet.has(field)) return prev;
        const next = new Map(prev);
        const newRowSet = new Set(rowSet);
        newRowSet.delete(field);
        if (newRowSet.size === 0) next.delete(id); else next.set(id, newRowSet);
        return next;
      });
    }
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow(rowCounter++)]);

  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setFieldErrors((prev) => { if (!prev.has(id)) return prev; const next = new Map(prev); next.delete(id); return next; });
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text, isCometUser);
      if (parsed.length === 0) {
        toast({ title: "Keine Daten gefunden", description: "Bitte prüfen Sie das CSV-Format.", variant: "destructive" });
        return;
      }
      setRows(parsed.map((partial) => emptyRow(rowCounter++, partial)));
      setFieldErrors(new Map());
      toast({ title: `${parsed.length} Zeile${parsed.length !== 1 ? "n" : ""} importiert` });
    };
    reader.readAsText(file, "utf-8");
  };

  const handleSubmit = () => {
    const invalid = new Map<number, Set<keyof RowData>>();
    for (const row of rows) {
      const missing = new Set<keyof RowData>();
      if (!row.kennzeichen.trim()) missing.add("kennzeichen");
      if (!row.lkwArt) missing.add("lkwArt");
      if (!row.relation.trim()) missing.add("relation");
      if (!row.etaDate) missing.add("etaDate");
      if (!row.etaTime) missing.add("etaTime");
      if (isCometUser && !row.speditionId) missing.add("speditionId");
      if (missing.size > 0) invalid.set(row.id, missing);
    }
    if (invalid.size > 0) {
      setFieldErrors(invalid);
      toast({
        title: "Bitte alle Pflichtfelder ausfüllen",
        description: `Kennzeichen, LKW-Art, Relation, ETA Datum & Uhrzeit${isCometUser ? " sowie Spedition" : ""} sind erforderlich.`,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors(new Map());

    const shipments = rows.map((r) => ({
      kennzeichen:  r.kennzeichen.trim(),
      bezeichnung:  r.bezeichnung.trim() || undefined,
      lkwArt:       (r.lkwArt as ShipmentInputLkwArt) || undefined,
      etaDate:      r.etaDate || undefined,
      etaTime:      r.etaTime || undefined,
      tor:          isCometUser ? (r.tor || undefined) : undefined,
      speditionId:  r.speditionId ? parseInt(r.speditionId) : (isSpedUser ? user?.speditionId : undefined),
      subSpedition: isCometUser && r.subSpedition.trim() ? r.subSpedition.trim() : undefined,
      relation:     r.relation.trim() || undefined,
      telefon:      r.telefon.trim() || undefined,
      bemerkungen:  r.bemerkungen.trim() || undefined,
      status:       (r.status as ShipmentInputStatus) || "Angemeldet",
    }));

    bulkMutation.mutate({ data: { shipments } });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setRows([emptyRow(rowCounter++)]);
      setFieldErrors(new Map());
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Massenanlage Verladungen</DialogTitle>
            <div className="flex items-center gap-2 mr-6">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 text-slate-600"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                CSV importieren
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-slate-400 hover:text-slate-600"
                onClick={downloadCsvTemplate}
                title="Muster-CSV herunterladen"
              >
                <Download className="w-3.5 h-3.5" />
                Muster
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 w-6">#</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[130px]">
                    Kennzeichen <span className="text-red-500">*</span>
                  </th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[160px]">Bezeichnung</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[140px]">
                    LKW-Art <span className="text-red-500">*</span>
                  </th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[140px]">
                    ETA Datum <span className="text-red-500">*</span>
                  </th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[110px]">
                    ETA Zeit <span className="text-red-500">*</span>
                  </th>
                  {isCometUser && <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[120px]">Tor</th>}
                  {isCometUser && <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[120px]">Status</th>}
                  {isCometUser && (
                    <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[160px]">
                      Spedition <span className="text-red-500">*</span>
                    </th>
                  )}
                  {isCometUser && (
                    <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[160px]">
                      Sub-Spedition
                    </th>
                  )}
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[130px]">
                    Relation <span className="text-red-500">*</span>
                  </th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[120px]">Telefon</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[180px]">Bemerkungen</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const rowErrors = fieldErrors.get(row.id);
                  const hasError = !!rowErrors?.has("kennzeichen");
                  return (
                    <tr key={row.id} className={cn("group", idx % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                      <td className="px-2 py-1.5 text-xs text-slate-400 border-b border-slate-100">{idx + 1}</td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.kennzeichen}
                          onChange={(e) => updateRow(row.id, "kennzeichen", e.target.value)}
                          placeholder="M-AB 1234"
                          className={cn("h-8 text-sm", hasError && "border-red-400 ring-1 ring-red-400")}
                        />
                        {hasError && <AlertCircle className="w-3 h-3 text-red-500 absolute mt-[-24px] ml-[-18px]" />}
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.bezeichnung}
                          onChange={(e) => updateRow(row.id, "bezeichnung", e.target.value)}
                          placeholder="Bezeichnung"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Select value={row.lkwArt} onValueChange={(v) => updateRow(row.id, "lkwArt", v)}>
                          <SelectTrigger className={cn("h-8 text-sm", rowErrors?.has("lkwArt") && "border-red-400 ring-1 ring-red-400")}><SelectValue placeholder="Art wählen" /></SelectTrigger>
                          <SelectContent>
                            {LKW_ART_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          type="date"
                          value={row.etaDate}
                          onChange={(e) => updateRow(row.id, "etaDate", e.target.value)}
                          className={cn("h-8 text-sm", rowErrors?.has("etaDate") && "border-red-400 ring-1 ring-red-400")}
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          type="time"
                          value={row.etaTime}
                          onChange={(e) => updateRow(row.id, "etaTime", e.target.value)}
                          className={cn("h-8 text-sm", rowErrors?.has("etaTime") && "border-red-400 ring-1 ring-red-400")}
                        />
                      </td>
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Select value={row.tor} onValueChange={(v) => updateRow(row.id, "tor", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tor" /></SelectTrigger>
                            <SelectContent>
                              {TOR_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Select value={row.status} onValueChange={(v) => updateRow(row.id, "status", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Select value={row.speditionId} onValueChange={(v) => updateRow(row.id, "speditionId", v)}>
                            <SelectTrigger className={cn("h-8 text-sm", rowErrors?.has("speditionId") && "border-red-400 ring-1 ring-red-400")}><SelectValue placeholder="Spedition" /></SelectTrigger>
                            <SelectContent>
                              {(speditionen ?? []).map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Input
                            value={row.subSpedition}
                            onChange={(e) => updateRow(row.id, "subSpedition", e.target.value)}
                            placeholder="Optional"
                            className="h-8 text-sm"
                          />
                        </td>
                      )}
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.relation}
                          onChange={(e) => updateRow(row.id, "relation", e.target.value)}
                          placeholder="Start → Ziel"
                          className={cn("h-8 text-sm", rowErrors?.has("relation") && "border-red-400 ring-1 ring-red-400")}
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.telefon}
                          onChange={(e) => updateRow(row.id, "telefon", e.target.value)}
                          placeholder="+49 …"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Textarea
                          value={row.bemerkungen}
                          onChange={(e) => updateRow(row.id, "bemerkungen", e.target.value)}
                          placeholder="Bemerkungen…"
                          className="text-sm min-h-[32px] h-8 resize-none py-1.5 leading-tight"
                          rows={1}
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        {rows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed text-slate-500 hover:text-slate-700">
            <Plus className="w-4 h-4 mr-2" />
            Zeile hinzufügen
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <span className="text-xs text-slate-400 self-center mr-auto">{rows.length} Verladung{rows.length !== 1 ? "en" : ""}</span>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={bulkMutation.isPending}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={bulkMutation.isPending}>
            {bulkMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {rows.length} Verladung{rows.length !== 1 ? "en" : ""} anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
