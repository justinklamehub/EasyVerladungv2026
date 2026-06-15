import { useState, useMemo } from "react";
import { useListShipments, useListSpeditionen, useUpdateShipment, Shipment } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, Plus, Lock, ArrowRight, ArrowUp, ArrowDown, ChevronsUpDown, X } from "lucide-react";
import { ShipmentDrawer } from "./components/shipment-drawer";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListShipmentsQueryKey } from "@workspace/api-client-react";

const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "Verladen", "Abgefertigt", "Storniert"];
const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Sattelzug", "Wechselbrücke", "Sonstige"];
const TOR_OPTIONS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2"];

type SortField = "kennzeichen" | "etaDate" | "status" | "tor" | "speditionName";
type SortDir = "asc" | "desc";

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
  "Verladen": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Abgefertigt": "bg-teal-50 text-teal-700 border-teal-200",
  "Storniert": "bg-red-50 text-red-700 border-red-200",
};

export default function ShipmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const role = user?.role ?? "";
  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);
  const isViewer = role === "comet_viewer" || role === "speditions_viewer";

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("__none__");
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
    const visible = (!showAbgefertigt && filterStatus === "__all__")
      ? shipments.filter((s) => s.status !== "Abgefertigt")
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
  }, [shipments, sortField, sortDir]);

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Verladungen</h1>
          <p className="text-sm text-slate-500">Verwalten und verfolgen Sie alle LKW-Bewegungen.</p>
        </div>
        {!isViewer && (
          <Button onClick={() => { setSelectedShipmentId(null); setIsDrawerOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Neue Verladung
          </Button>
        )}
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

          <div className="flex items-center gap-2 ml-auto">
            <Checkbox
              id="show-abgefertigt"
              checked={showAbgefertigt}
              onCheckedChange={(v) => setShowAbgefertigt(!!v)}
            />
            <label htmlFor="show-abgefertigt" className="text-sm text-slate-600 cursor-pointer select-none">
              Abgefertigte anzeigen
            </label>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500 h-8">
              <X className="w-3 h-3 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && !isViewer && isCometUser && (
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
              {!isViewer && isCometUser && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={sorted.length > 0 && selectedIds.size === sorted.length}
                    onCheckedChange={toggleAll}
                    aria-label="Alle auswählen"
                  />
                </TableHead>
              )}
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("kennzeichen")}>
                Kennzeichen <SortIcon field="kennzeichen" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("speditionName")}>
                Spedition <SortIcon field="speditionName" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead>Art</TableHead>
              <TableHead>Relation</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("etaDate")}>
                ETA / ATA <SortIcon field="etaDate" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("tor")}>
                Tor <SortIcon field="tor" sortField={sortField} sortDir={sortDir} />
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={!isViewer && isCometUser ? 8 : 7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={!isViewer && isCometUser ? 8 : 7} className="text-center py-8 text-slate-500">
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
                  {!isViewer && isCometUser && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(shipment.id)}
                        onCheckedChange={() => toggleRow(shipment.id)}
                        aria-label={`Zeile ${shipment.id} auswählen`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{shipment.kennzeichen || "-"}</TableCell>
                  <TableCell>{shipment.speditionName || "-"}</TableCell>
                  <TableCell>{shipment.lkwArt || "-"}</TableCell>
                  <TableCell className="text-slate-600 text-sm">{shipment.relation || "-"}</TableCell>
                  <TableCell>
                    <div className="text-xs">
                      {shipment.etaDate && shipment.etaTime ? (
                        <div className="text-slate-600">
                          ETA: <span className="font-medium">{format(new Date(shipment.etaDate), "dd.MM.yy")} {shipment.etaTime}</span>
                        </div>
                      ) : null}
                      {shipment.ataDate && shipment.ataTime ? (
                        <div className="text-green-700">
                          ATA: <span className="font-medium">{format(new Date(shipment.ataDate), "dd.MM.yy")} {shipment.ataTime}</span>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLOR[shipment.status] ?? "bg-slate-100 text-slate-700"}>
                      {shipment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{shipment.tor || "-"}</TableCell>
                  <TableCell>
                    {shipment.gesperrtFuerSpedition ? (
                      <Lock className="w-4 h-4 text-red-500" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                    )}
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
    </div>
  );
}
