import { useState, useRef, useEffect, useMemo } from "react";
import { useBulkCreateShipments, useListSpeditionen, getListShipmentsQueryKey, ShipmentInputLkwArt, ShipmentInputStatus } from "@workspace/api-client-react";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertCircle, Upload, Download, TriangleAlert } from "lucide-react";
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

function normalizeStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const opt of STATUS_OPTIONS) {
    if (opt.toLowerCase() === lower) return opt;
  }
  return "";
}

// Parsed CSV rows may carry a temporary spedition name before ID resolution
type ParsedRow = Partial<RowData> & { _speditionName?: string };

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

function parseCsv(text: string, isCometUser: boolean): ParsedRow[] {
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
  const colStatus       = idx(["status"]);
  const colSpedition    = isCometUser ? idx(["spedition"]) : -1;
  const colSubSpedition = isCometUser ? idx(["sub-spedition", "subspedition", "sub_spedition"]) : -1;
  const colRelation     = idx(["relation", "route", "strecke"]);
  const colTelefon      = idx(["telefon", "phone", "tel"]);
  const colBemerkungen  = idx(["bemerkung", "remark", "notiz", "note", "comment"]);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep);
    const get = (col: number) => (col >= 0 ? (cells[col] ?? "").trim() : "");

    const kz = get(colKennzeichen);
    if (!kz) continue;

    const speditionName = isCometUser ? get(colSpedition) : "";

    rows.push({
      kennzeichen:  kz,
      bezeichnung:  get(colBezeichnung),
      lkwArt:       normalizeLkwArt(get(colLkwArt)),
      etaDate:      parseDate(get(colEtaDate)),
      etaTime:      get(colEtaTime),
      tor:          isCometUser ? normalizeTor(get(colTor)) : "",
      status:       normalizeStatus(get(colStatus)) || "Angemeldet",
      subSpedition: isCometUser ? get(colSubSpedition) : "",
      relation:     get(colRelation),
      telefon:      get(colTelefon),
      bemerkungen:  get(colBemerkungen),
      ...(speditionName ? { _speditionName: speditionName } : {}),
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
    const cometSpedName = speditionen?.[0]?.name ?? "Mustermann Spedition GmbH";

    const columns = isCometUser
      ? [
          "Kennzeichen",
          "Bezeichnung",
          "LKW-Art",
          "ETA Datum (JJJJ-MM-TT)",
          "ETA Zeit (HH:MM)",
          "Tor",
          "Status",
          "Spedition",
          "Sub-Spedition",
          "Relation",
          "Telefon",
          "Bemerkungen",
        ]
      : [
          "Kennzeichen",
          "Bezeichnung",
          "LKW-Art",
          "ETA Datum (JJJJ-MM-TT)",
          "ETA Zeit (HH:MM)",
          "Relation",
          "Telefon",
          "Bemerkungen",
        ];

    const example = isCometUser
      ? [
          "M-AB 1234",
          "Wöchentliche Lieferung",
          "Container",
          "2025-07-01",
          "08:00",
          "Tor 3",
          "Angemeldet",
          cometSpedName,
          "",
          "MUC → HH",
          "+49 89 12345",
          "Bitte Kühlung beachten",
        ]
      : [
          "M-AB 1234",
          "Wöchentliche Lieferung",
          "Container",
          "2025-07-01",
          "08:00",
          "MUC → HH",
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

  // ── Relationen-Vorschläge ────────────────────────────────────────────────────
  const uniqueSpedIds = useMemo(() => {
    const ids = new Set<number>();
    if (isSpedUser && user?.speditionId) ids.add(user.speditionId);
    if (isCometUser) {
      rows.forEach((r) => { if (r.speditionId) ids.add(parseInt(r.speditionId, 10)); });
    }
    return [...ids];
  }, [rows, isSpedUser, isCometUser, user?.speditionId]);

  const relationenQueries = useQueries({
    queries: uniqueSpedIds.map((spedId) => ({
      queryKey: ["spedition-relationen", spedId],
      queryFn: () => customFetch(`/api/speditionen/${spedId}/relationen`) as Promise<{ id: number; name: string; kuerzel: string | null }[]>,
      enabled: open,
      staleTime: 60_000,
    })),
  });

  const relationenBySpedId = useMemo(() => {
    const map = new Map<number, { id: number; name: string; kuerzel: string | null }[]>();
    uniqueSpedIds.forEach((spedId, i) => {
      const data = relationenQueries[i]?.data;
      if (data) map.set(spedId, data);
    });
    return map;
  }, [uniqueSpedIds, relationenQueries]);

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

      // Resolve spedition names → IDs for COMET users
      let unmatchedSped = 0;
      const resolved: Partial<RowData>[] = parsed.map((row) => {
        const { _speditionName, ...rest } = row as ParsedRow & Record<string, unknown>;
        if (isCometUser && _speditionName && speditionen) {
          const needle = (_speditionName as string).toLowerCase();
          const match =
            speditionen.find((s) => s.name.toLowerCase() === needle) ??
            speditionen.find((s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()));
          if (match) return { ...rest, speditionId: String(match.id) };
          unmatchedSped++;
        }
        return rest as Partial<RowData>;
      });

      setRows(resolved.map((partial) => emptyRow(rowCounter++, partial)));
      setFieldErrors(new Map());

      const msg = unmatchedSped > 0
        ? `${resolved.length} Zeile${resolved.length !== 1 ? "n" : ""} importiert — ${unmatchedSped} Spedition${unmatchedSped !== 1 ? "en" : ""} nicht gefunden, bitte manuell auswählen.`
        : `${resolved.length} Zeile${resolved.length !== 1 ? "n" : ""} importiert`;
      toast({
        title: msg,
        variant: unmatchedSped > 0 ? "destructive" : "default",
      });
    };
    reader.readAsText(file, "utf-8");
  };

  const [unknownRelWarning, setUnknownRelWarning] = useState<
    { rowNum: number; relation: string }[] | null
  >(null);

  const handleSubmit = () => {
    const invalid = new Map<number, Set<keyof RowData>>();
    for (const row of rows) {
      const missing = new Set<keyof RowData>();
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
        description: `LKW-Art, Relation, ETA Datum & Uhrzeit${isCometUser ? " sowie Spedition" : ""} sind erforderlich.`,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors(new Map());

    // Check for unknown relations
    const unknownRows: { rowNum: number; relation: string }[] = [];
    rows.forEach((row, idx) => {
      const rel = row.relation.trim();
      if (!rel) return;
      const spedId = row.speditionId
        ? parseInt(row.speditionId, 10)
        : isSpedUser && user?.speditionId
        ? user.speditionId
        : null;
      if (!spedId) return;
      const known = relationenBySpedId.get(spedId);
      if (!known || known.length === 0) return; // no data loaded yet — skip check
      const relLower = rel.toLowerCase();
      const isKnown = known.some(
        (r) => (r.kuerzel ?? "").toLowerCase() === relLower || r.name.toLowerCase() === relLower
      );
      if (!isKnown) unknownRows.push({ rowNum: idx + 1, relation: rel });
    });

    if (unknownRows.length > 0) {
      setUnknownRelWarning(unknownRows);
      return;
    }

    doSubmit();
  };

  const doSubmit = () => {

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
    <>
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

        {/* Datalists for relation suggestions, one per unique speditionId */}
        {[...relationenBySpedId.entries()].map(([spedId, rels]) =>
          rels.length > 0 ? (
            <datalist key={spedId} id={`relation-datalist-${spedId}`}>
              {rels.map((r) => <option key={r.id} value={r.kuerzel ?? r.name} />)}
            </datalist>
          ) : null
        )}

        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 w-6">#</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[130px]">
                    Kennzeichen
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
                  return (
                    <tr key={row.id} className={cn("group", idx % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                      <td className="px-2 py-1.5 text-xs text-slate-400 border-b border-slate-100">{idx + 1}</td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.kennzeichen}
                          onChange={(e) => updateRow(row.id, "kennzeichen", e.target.value)}
                          placeholder="M-AB 1234"
                          className="h-8 text-sm"
                        />
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
                        {(() => {
                          const spedId = isCometUser
                            ? (row.speditionId ? parseInt(row.speditionId, 10) : null)
                            : (user?.speditionId ?? null);
                          const listId = spedId ? `relation-datalist-${spedId}` : undefined;
                          return (
                            <Input
                              value={row.relation}
                              onChange={(e) => updateRow(row.id, "relation", e.target.value)}
                              placeholder="Start → Ziel"
                              className={cn("h-8 text-sm", rowErrors?.has("relation") && "border-red-400 ring-1 ring-red-400")}
                              list={listId}
                            />
                          );
                        })()}
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

    {/* Unbekannte-Relation WarnDialog */}
    <Dialog open={!!unknownRelWarning} onOpenChange={(o) => { if (!o) setUnknownRelWarning(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="w-5 h-5 text-amber-500" />
            Unbekannte Relationen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-slate-600">
            Folgende Zeilen enthalten Relationen, die nicht in den Stammdaten hinterlegt sind:
          </p>
          <ul className="text-sm space-y-1">
            {unknownRelWarning?.map((r) => (
              <li key={r.rowNum} className="flex items-center gap-2">
                <span className="text-slate-400 w-16 shrink-0">Zeile {r.rowNum}:</span>
                <span className="font-mono font-medium text-slate-800">{r.relation}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-500">Sollen die Verladungen trotzdem angelegt werden?</p>
        </div>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button className="w-full" onClick={() => { setUnknownRelWarning(null); doSubmit(); }}>
            Trotzdem anlegen
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setUnknownRelWarning(null)}>
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
