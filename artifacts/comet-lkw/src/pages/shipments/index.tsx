import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useListShipments, useListSpeditionen, useUpdateShipment, Shipment } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Loader2, Plus, Lock, ArrowRight, ArrowUp, ArrowDown, ChevronsUpDown, X, Download, FileSpreadsheet, Wifi, WifiOff, ClipboardCheck, SlidersHorizontal, RotateCcw, GripVertical } from "lucide-react";
import * as XLSX from "xlsx";
import { ShipmentDrawer } from "./components/shipment-drawer";
import { BulkCreateDialog } from "./components/bulk-create-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getListShipmentsQueryKey } from "@workspace/api-client-react";
import { useSocketStatus } from "@/hooks/use-socket";
import { usePermissions } from "@/hooks/use-permissions";

const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];
const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Sattelzug", "Wechselbrücke", "Sonstige"];
const TOR_OPTIONS = Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`);

type SortField = "kennzeichen" | "etaDate" | "status" | "tor" | "speditionName";
type SortDir = "asc" | "desc";

type ColKey =
  | "id" | "kennzeichen" | "spedition" | "subspedition"
  | "art" | "relation" | "bezeichnung"
  | "eta" | "status" | "ware" | "tor"
  | "gesperrt" | "cometBearbeitet" | "telefon" | "bemerkungen"
  | "createdBy" | "createdAt" | "updatedBy" | "updatedAt";

const COLUMN_DEFS: { key: ColKey; label: string }[] = [
  { key: "id",              label: "ID" },
  { key: "kennzeichen",     label: "Kennzeichen" },
  { key: "spedition",       label: "Spedition" },
  { key: "subspedition",    label: "Sub-Spedition" },
  { key: "art",             label: "Art (LKW-Typ)" },
  { key: "relation",        label: "Relation" },
  { key: "bezeichnung",     label: "Bezeichnung" },
  { key: "eta",             label: "ETA / ATA" },
  { key: "status",          label: "Status" },
  { key: "ware",            label: "Ware" },
  { key: "tor",             label: "Tor" },
  { key: "gesperrt",        label: "Gesperrt" },
  { key: "cometBearbeitet", label: "COMET bearbeitet" },
  { key: "telefon",         label: "Telefon" },
  { key: "bemerkungen",     label: "Bemerkungen" },
  { key: "createdBy",       label: "Erstellt von" },
  { key: "createdAt",       label: "Erstellt am" },
  { key: "updatedBy",       label: "Aktualisiert von" },
  { key: "updatedAt",       label: "Aktualisiert am" },
];

const DEFAULT_COLS: Record<ColKey, boolean> = {
  id: true,
  kennzeichen: true,
  spedition: true,
  subspedition: false,
  art: true,
  relation: true,
  bezeichnung: true,
  eta: true,
  status: true,
  ware: true,
  tor: true,
  gesperrt: false,
  cometBearbeitet: false,
  telefon: false,
  bemerkungen: false,
  createdBy: false,
  createdAt: false,
  updatedBy: false,
  updatedAt: false,
};

const DEFAULT_ORDER: ColKey[] = COLUMN_DEFS.map((c) => c.key);

const STORAGE_KEY = "shipments_col_vis_v3";
const SERVER_PREF_KEY = "shipments_col_visibility";

type ColPrefs = { visibility: Record<ColKey, boolean>; order: ColKey[] };

function loadColPrefs(): ColPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const visibility = { ...DEFAULT_COLS, ...(parsed.visibility ?? parsed) };
      const order: ColKey[] = Array.isArray(parsed.order)
        ? [...new Set([...parsed.order.filter((k: string) => DEFAULT_ORDER.includes(k as ColKey)), ...DEFAULT_ORDER])] as ColKey[]
        : [...DEFAULT_ORDER];
      return { visibility, order };
    }
  } catch {}
  return { visibility: { ...DEFAULT_COLS }, order: [...DEFAULT_ORDER] };
}

function saveColPrefsLocal(prefs: ColPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 text-slate-400 inline" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 text-primary inline" />
    : <ArrowDown className="w-3 h-3 ml-1 text-primary inline" />;
}

const STATUS_COLOR: Record<string, string> = {
  "Angemeldet": "bg-slate-100 text-slate-700 border-slate-200",
  "Erwartet": "bg-blue-50 text-blue-700 border-blue-200",
  "Angekommen": "bg-green-50 text-green-700 border-green-200",
  "in Verladung": "bg-orange-50 text-orange-700 border-orange-200",
  "Verladen": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Abgefertigt": "bg-teal-50 text-teal-700 border-teal-200",
  "Storniert": "bg-red-50 text-red-700 border-red-200",
};

export default function ShipmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected } = useSocketStatus();
  const role = user?.role ?? "";
  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);
  const permissions = usePermissions();
  const canCreate = !!permissions["shipment.create"];
  const canEdit   = !!permissions["shipment.edit"];
  const canLock   = !!permissions["shipment.lock"];

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterSpeditionId, setFilterSpeditionId] = useState("__all__");
  const [filterLkwArt, setFilterLkwArt] = useState("__all__");
  const [filterTor, setFilterTor] = useState("__all__");
  const today = new Date().toISOString().slice(0, 10);
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [sortField, setSortField] = useState<SortField>("etaDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showAbgefertigt, setShowAbgefertigt] = useState(false);
  const [showStorniert, setShowStorniert] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("__none__");
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const initPrefs = loadColPrefs();
  const [cols, setCols] = useState<Record<ColKey, boolean>>(initPrefs.visibility);
  const [colOrder, setColOrder] = useState<ColKey[]>(initPrefs.order);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const API_BASE_FOR_PREFS = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

  const savePrefsToServer = useCallback((prefs: ColPrefs) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`${API_BASE_FOR_PREFS}/user-preferences/${SERVER_PREF_KEY}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { visibility: prefs.visibility, order: prefs.order } }),
      }).catch(() => {});
    }, 600);
  }, [API_BASE_FOR_PREFS]);

  useEffect(() => {
    fetch(`${API_BASE_FOR_PREFS}/user-preferences/${SERVER_PREF_KEY}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value && typeof data.value === "object") {
          const v = data.value;
          const visibility = { ...DEFAULT_COLS, ...(v.visibility ?? v) };
          const order: ColKey[] = Array.isArray(v.order)
            ? [...new Set([...v.order.filter((k: string) => DEFAULT_ORDER.includes(k as ColKey)), ...DEFAULT_ORDER])] as ColKey[]
            : [...DEFAULT_ORDER];
          setCols(visibility);
          setColOrder(order);
          saveColPrefsLocal({ visibility, order });
        }
      })
      .catch(() => {});
  }, [API_BASE_FOR_PREFS]);

  function toggleCol(key: ColKey) {
    setCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const prefs = { visibility: next, order: colOrder };
      saveColPrefsLocal(prefs);
      savePrefsToServer(prefs);
      return next;
    });
  }

  function resetCols() {
    const prefs: ColPrefs = { visibility: { ...DEFAULT_COLS }, order: [...DEFAULT_ORDER] };
    setCols(prefs.visibility);
    setColOrder(prefs.order);
    saveColPrefsLocal(prefs);
    savePrefsToServer(prefs);
  }

  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragEnter(index: number) {
    dragOver.current = index;
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      dragItem.current = null;
      dragOver.current = null;
      return;
    }
    const newOrder = [...colOrder];
    const [moved] = newOrder.splice(dragItem.current, 1);
    newOrder.splice(dragOver.current, 0, moved);
    dragItem.current = null;
    dragOver.current = null;
    setColOrder(newOrder);
    const prefs = { visibility: cols, order: newOrder };
    saveColPrefsLocal(prefs);
    savePrefsToServer(prefs);
  }

  const visibleColCount = useMemo(
    () => COLUMN_DEFS.filter((c) => cols[c.key]).length,
    [cols]
  );

  const colSpan = useMemo(() => {
    let n = visibleColCount + 1; // +1 for actions column
    if (canEdit) n += 1; // +1 for checkbox column
    return n;
  }, [visibleColCount, canEdit]);

  const hiddenCount = COLUMN_DEFS.filter((c) => !cols[c.key]).length;

  const queryParams = {
    search: search.length > 2 ? search : undefined,
    status: filterStatus !== "__all__" ? filterStatus : undefined,
    speditionId: filterSpeditionId !== "__all__" ? Number(filterSpeditionId) : undefined,
    lkwArt: filterLkwArt !== "__all__" ? filterLkwArt : undefined,
    tor: filterTor !== "__all__" ? filterTor : undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
  };

  const { data: shipments, isLoading } = useListShipments(queryParams);
  const { data: speditionen } = useListSpeditionen();
  const updateShipment = useUpdateShipment();

  const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
  const { data: gefahrgutStatus } = useQuery({
    queryKey: ["gefahrgut-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/gefahrgut-status`, { credentials: "include" });
      if (!res.ok) return { shipmentIds: [] as number[] };
      return res.json() as Promise<{ shipmentIds: number[] }>;
    },
    enabled: isCometUser,
    staleTime: 30_000,
  });
  const gefahrgutSet = useMemo(
    () => new Set(gefahrgutStatus?.shipmentIds ?? []),
    [gefahrgutStatus]
  );

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setSelectedIds(new Set());
  }

  const sorted = useMemo(() => {
    if (!shipments) return [];
    const visible = filterStatus === "__all__"
      ? shipments.filter((s) => {
          if (!showAbgefertigt && s.status === "Abgefertigt") return false;
          if (!showStorniert && s.status === "Storniert") return false;
          return true;
        })
      : shipments;
    return [...visible].sort((a, b) => {
      let av: string = "";
      let bv: string = "";
      if (sortField === "kennzeichen") { av = a.kennzeichen ?? ""; bv = b.kennzeichen ?? ""; }
      else if (sortField === "etaDate") { av = a.etaDate ?? ""; bv = b.etaDate ?? ""; }
      else if (sortField === "status") { av = a.status ?? ""; bv = b.status ?? ""; }
      else if (sortField === "tor") { av = a.tor ?? ""; bv = b.tor ?? ""; }
      else if (sortField === "speditionName") { av = a.speditionName ?? ""; bv = b.speditionName ?? ""; }
      const cmp = av.localeCompare(bv, "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [shipments, sortField, sortDir, showAbgefertigt, showStorniert, filterStatus]);

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((s) => s.id)));
    }
  }

  async function applyBulkStatus() {
    if (bulkStatus === "__none__" || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => updateShipment.mutateAsync({ id, data: { status: bulkStatus as any } })));
      await queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      toast({ title: `Status auf „${bulkStatus}" gesetzt`, description: `${ids.length} Verladung(en) aktualisiert.` });
      setSelectedIds(new Set());
      setBulkStatus("__none__");
    } catch {
      toast({ title: "Fehler", description: "Status konnte nicht gesetzt werden.", variant: "destructive" });
    }
  }

  function resetFilters() {
    setSearch("");
    setFilterStatus("__all__");
    setFilterSpeditionId("__all__");
    setFilterLkwArt("__all__");
    setFilterTor("__all__");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  function buildExportRows(rows: Shipment[]) {
    return rows.map((s) => ({
      ID: s.id,
      Kennzeichen: s.kennzeichen ?? "",
      Spedition: s.speditionName ?? "",
      "LKW-Art": s.lkwArt ?? "",
      Relation: s.relation ?? "",
      Bezeichnung: s.bezeichnung ?? "",
      "ETA-Datum": s.etaDate ? format(new Date(s.etaDate), "dd.MM.yyyy") : "",
      "ETA-Zeit": s.etaTime ?? "",
      "ATA-Datum": s.ataDate ? format(new Date(s.ataDate), "dd.MM.yyyy") : "",
      "ATA-Zeit": s.ataTime ?? "",
      Status: s.status,
      Ware: (s as any).wareStatus ?? "",
      Tor: s.tor ?? "",
      Gesperrt: s.gesperrtFuerSpedition ? "Ja" : "Nein",
      Bemerkungen: s.bemerkungen ?? "",
    }));
  }

  function exportCsv() {
    const rows = buildExportRows(sorted);
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => String((r as any)[h]).replace(/;/g, ",")).join(";")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verladungen_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx() {
    const rows = buildExportRows(sorted);
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Verladungen");
    XLSX.writeFile(wb, `verladungen_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  const hasActiveFilters =
    search.length > 0 ||
    filterStatus !== "__all__" ||
    filterSpeditionId !== "__all__" ||
    filterLkwArt !== "__all__" ||
    filterTor !== "__all__" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Verladungen</h1>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${
                isConnected
                  ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              {isConnected ? "Live" : "Getrennt"}
            </span>
          </div>
          <p className="text-sm text-slate-500">Verwalten und verfolgen Sie alle LKW-Bewegungen.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={sorted.length === 0}
            onClick={exportCsv}
            className="h-9"
          >
            <Download className="w-4 h-4 mr-1.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={sorted.length === 0}
            onClick={exportXlsx}
            className="h-9"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Excel
          </Button>
          {canCreate && (
            <>
              <Button variant="outline" onClick={() => setIsBulkOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Massenanlage
              </Button>
              <Button onClick={() => { setSelectedShipmentId(null); setIsDrawerOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Neue Verladung
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Kennzeichen, Tor…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterLkwArt} onValueChange={setFilterLkwArt}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="LKW-Art" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Arten</SelectItem>
              {LKW_ART_OPTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterTor} onValueChange={setFilterTor}>
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Tor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Tore</SelectItem>
              {TOR_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isCometUser && speditionen && (
            <Select value={filterSpeditionId} onValueChange={setFilterSpeditionId}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Spedition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Speditionnen</SelectItem>
                {speditionen.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Column visibility picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 ml-auto">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Spalten
                {hiddenCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] leading-none px-1.5 py-0.5 rounded-full">
                    {hiddenCount} aus
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-3">
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <span className="text-sm font-semibold text-slate-700">Sichtbare Spalten</span>
                {hiddenCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-slate-500 gap-1"
                    onClick={resetCols}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Alle
                  </Button>
                )}
              </div>
              <div className="space-y-0.5">
                {colOrder.map((key, idx) => {
                  const label = COLUMN_DEFS.find((c) => c.key === key)?.label ?? key;
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 select-none group"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 cursor-grab shrink-0" />
                      <Checkbox
                        checked={cols[key]}
                        onCheckedChange={() => toggleCol(key)}
                        className="shrink-0"
                      />
                      <span className="text-sm text-slate-700 cursor-pointer flex-1" onClick={() => toggleCol(key)}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>ETA von:</span>
            <Input
              type="date"
              className="w-[145px] h-8 text-sm"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>bis:</span>
            <Input
              type="date"
              className="w-[145px] h-8 text-sm"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-abgefertigt"
                checked={showAbgefertigt}
                onCheckedChange={(v) => setShowAbgefertigt(!!v)}
              />
              <label htmlFor="show-abgefertigt" className="text-sm text-slate-600 cursor-pointer select-none">
                Abgefertigte anzeigen
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-storniert"
                checked={showStorniert}
                onCheckedChange={(v) => setShowStorniert(!!v)}
              />
              <label htmlFor="show-storniert" className="text-sm text-slate-600 cursor-pointer select-none">
                Stornierte anzeigen
              </label>
            </div>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500 h-8">
              <X className="w-3 h-3 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && canEdit && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-primary">{selectedIds.size} ausgewählt</span>
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="w-[170px] h-8 text-sm">
              <SelectValue placeholder="Status setzen…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Status wählen…</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={bulkStatus === "__none__" || updateShipment.isPending}
            onClick={applyBulkStatus}
          >
            {updateShipment.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Anwenden
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Abbrechen
          </Button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              {canEdit && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={sorted.length > 0 && selectedIds.size === sorted.length ? true : false}
                    onCheckedChange={toggleAll}
                    aria-label="Alle auswählen"
                  />
                </TableHead>
              )}
              {colOrder.filter((k) => cols[k]).map((key) => {
                switch (key) {
                  case "id": return <TableHead key="id" className="w-[60px] text-slate-400 font-normal text-xs">ID</TableHead>;
                  case "kennzeichen": return <TableHead key="kennzeichen" className="cursor-pointer select-none" onClick={() => toggleSort("kennzeichen")}>Kennzeichen <SortIcon field="kennzeichen" sortField={sortField} sortDir={sortDir} /></TableHead>;
                  case "spedition": return <TableHead key="spedition" className="cursor-pointer select-none" onClick={() => toggleSort("speditionName")}>Spedition <SortIcon field="speditionName" sortField={sortField} sortDir={sortDir} /></TableHead>;
                  case "subspedition": return <TableHead key="subspedition">Sub-Spedition</TableHead>;
                  case "art": return <TableHead key="art">Art</TableHead>;
                  case "relation": return <TableHead key="relation">Relation</TableHead>;
                  case "bezeichnung": return <TableHead key="bezeichnung">Bezeichnung</TableHead>;
                  case "eta": return <TableHead key="eta" className="cursor-pointer select-none" onClick={() => toggleSort("etaDate")}>ETA / ATA <SortIcon field="etaDate" sortField={sortField} sortDir={sortDir} /></TableHead>;
                  case "status": return <TableHead key="status" className="cursor-pointer select-none" onClick={() => toggleSort("status")}>Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} /></TableHead>;
                  case "ware": return <TableHead key="ware">Ware</TableHead>;
                  case "tor": return <TableHead key="tor" className="cursor-pointer select-none" onClick={() => toggleSort("tor")}>Tor <SortIcon field="tor" sortField={sortField} sortDir={sortDir} /></TableHead>;
                  case "gesperrt": return <TableHead key="gesperrt">Gesperrt</TableHead>;
                  case "cometBearbeitet": return <TableHead key="cometBearbeitet">COMET bearb.</TableHead>;
                  case "telefon": return <TableHead key="telefon">Telefon</TableHead>;
                  case "bemerkungen": return <TableHead key="bemerkungen">Bemerkungen</TableHead>;
                  case "createdBy": return <TableHead key="createdBy">Erstellt von</TableHead>;
                  case "createdAt": return <TableHead key="createdAt">Erstellt am</TableHead>;
                  case "updatedBy": return <TableHead key="updatedBy">Aktual. von</TableHead>;
                  case "updatedAt": return <TableHead key="updatedAt">Aktual. am</TableHead>;
                  default: return null;
                }
              })}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-slate-500">
                  Keine Verladungen gefunden.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((shipment: Shipment) => (
                <TableRow
                  key={shipment.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="checkbox"]')) return;
                    setSelectedShipmentId(shipment.id);
                    setIsDrawerOpen(true);
                  }}
                >
                  {canEdit && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(shipment.id)}
                        onCheckedChange={() => toggleRow(shipment.id)}
                        aria-label={`Zeile ${shipment.id} auswählen`}
                      />
                    </TableCell>
                  )}
                  {colOrder.filter((k) => cols[k]).map((key) => {
                    const s = shipment as any;
                    switch (key) {
                      case "id": return <TableCell key="id" className="text-xs text-slate-400 font-mono">{shipment.id}</TableCell>;
                      case "kennzeichen": return <TableCell key="kennzeichen" className="font-medium">{shipment.kennzeichen || "-"}</TableCell>;
                      case "spedition": return <TableCell key="spedition">{s.speditionName || "-"}</TableCell>;
                      case "subspedition": return <TableCell key="subspedition">{s.subSpeditionName || "-"}</TableCell>;
                      case "art": return <TableCell key="art">{shipment.lkwArt || "-"}</TableCell>;
                      case "relation": return <TableCell key="relation" className="text-slate-600 text-sm">{shipment.relation || "-"}</TableCell>;
                      case "bezeichnung": return <TableCell key="bezeichnung" className="text-slate-600 text-sm">{shipment.bezeichnung || "-"}</TableCell>;
                      case "eta": return (
                        <TableCell key="eta" className="text-xs">
                          <div className="text-slate-600">
                            {shipment.etaDate ? <div>ETA: <span className="font-medium text-slate-700">{format(new Date(shipment.etaDate), "dd.MM.yy")}{shipment.etaTime ? ` ${shipment.etaTime}` : ""}</span></div> : null}
                            {s.ataDate ? <div className="text-green-700">ATA: <span className="font-medium">{format(new Date(s.ataDate), "dd.MM.yy")}{s.ataTime ? ` ${s.ataTime}` : ""}</span></div> : null}
                            {!shipment.etaDate && !s.ataDate ? "-" : null}
                          </div>
                        </TableCell>
                      );
                      case "status": return (
                        <TableCell key="status">
                          <Badge variant="outline" className={STATUS_COLOR[shipment.status] ?? "bg-slate-100 text-slate-700"}>{shipment.status}</Badge>
                        </TableCell>
                      );
                      case "ware": {
                        const ws = s.wareStatus || "nicht bereit";
                        const cls = ws === "vorbereitet" ? "bg-green-100 text-green-700 border-green-200" : ws === "in bearbeitung" ? "bg-amber-100 text-amber-700 border-amber-200" : ws === "ausgedruckt" ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-red-100 text-red-700 border-red-200";
                        const lbl = ws === "nicht bereit" ? "Nicht bereit" : ws === "ausgedruckt" ? "Ausgedruckt" : ws === "in bearbeitung" ? "In Bearbeitung" : ws === "vorbereitet" ? "Vorbereitet" : ws;
                        return <TableCell key="ware"><Badge variant="outline" className={`text-xs ${cls}`}>{lbl}</Badge></TableCell>;
                      }
                      case "tor": return <TableCell key="tor" className="font-medium">{shipment.tor || "-"}</TableCell>;
                      case "gesperrt": return (
                        <TableCell key="gesperrt">
                          {shipment.gesperrtFuerSpedition ? <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Gesperrt</Badge> : <span className="text-xs text-slate-400">Nein</span>}
                        </TableCell>
                      );
                      case "cometBearbeitet": return (
                        <TableCell key="cometBearbeitet">
                          {s.cometBearbeitet ? <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Ja</Badge> : <span className="text-xs text-slate-400">Nein</span>}
                        </TableCell>
                      );
                      case "telefon": return <TableCell key="telefon" className="text-sm">{s.telefon || "-"}</TableCell>;
                      case "bemerkungen": return <TableCell key="bemerkungen" className="text-xs text-slate-600 max-w-[200px] truncate" title={s.bemerkungen || ""}>{s.bemerkungen || "-"}</TableCell>;
                      case "createdBy": return <TableCell key="createdBy" className="text-xs text-slate-500">{s.createdByName || "-"}</TableCell>;
                      case "createdAt": return <TableCell key="createdAt" className="text-xs text-slate-500">{s.createdAt ? format(new Date(s.createdAt), "dd.MM.yy HH:mm") : "-"}</TableCell>;
                      case "updatedBy": return <TableCell key="updatedBy" className="text-xs text-slate-500">{s.updatedByName || "-"}</TableCell>;
                      case "updatedAt": return <TableCell key="updatedAt" className="text-xs text-slate-500">{s.updatedAt ? format(new Date(s.updatedAt), "dd.MM.yy HH:mm") : "-"}</TableCell>;
                      default: return null;
                    }
                  })}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {isCometUser && gefahrgutSet.has(shipment.id) && (
                        <span title="Gefahrgut-Checkliste vorhanden">
                          <ClipboardCheck className="w-3.5 h-3.5 text-amber-500" />
                        </span>
                      )}
                      {shipment.gesperrtFuerSpedition ? (
                        <Lock className="w-4 h-4 text-red-500" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ShipmentDrawer
        shipmentId={selectedShipmentId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
      <BulkCreateDialog open={isBulkOpen} onOpenChange={setIsBulkOpen} />
    </div>
  );
}
