import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListShipments, useListSpeditionen, useUpdateShipment, getListShipmentsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Lock, ShieldOff, Search, X, ChevronDown, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const KANBAN_STATUSES = ["Angemeldet", "Angekommen", "in Verladung", "Verladen"] as const;
type KanbanStatus = (typeof KANBAN_STATUSES)[number];

const STATUS_COLORS: Record<KanbanStatus, { column: string; header: string }> = {
  Angemeldet:     { column: "bg-slate-50 border-slate-200",   header: "bg-white border-b border-slate-200 text-slate-700" },
  Angekommen:     { column: "bg-blue-50 border-blue-200",     header: "bg-blue-50 border-b border-blue-200 text-blue-800" },
  "in Verladung": { column: "bg-amber-50 border-amber-200",   header: "bg-amber-50 border-b border-amber-200 text-amber-800" },
  Verladen:       { column: "bg-green-50 border-green-200",   header: "bg-green-50 border-b border-green-200 text-green-800" },
};

const WARE_STATUS_OPTIONS = [
  { value: "__none__",       label: "—" },
  { value: "nicht bereit",   label: "Nicht bereit" },
  { value: "ausgedruckt",    label: "Ausgedruckt" },
  { value: "in bearbeitung", label: "In Bearbeitung" },
  { value: "vorbereitet",    label: "Vorbereitet" },
] as const;

const WARE_STATUS_COLORS: Record<string, string> = {
  "nicht bereit":   "bg-red-100 text-red-700 border-red-200",
  vorbereitet:      "bg-amber-100 text-amber-700 border-amber-200",
  ausgedruckt:      "bg-green-100 text-green-700 border-green-200",
  "in bearbeitung": "bg-blue-100 text-blue-700 border-blue-200",
};

const WARE_STATUS_LABELS: Record<string, string> = {
  "nicht bereit":   "Nicht bereit",
  vorbereitet:      "Vorbereitet",
  ausgedruckt:      "Ausgedruckt",
  "in bearbeitung": "In Bearbeitung",
};

const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Sattelzug", "Wechselbrücke", "Sonstige"];
const TOR_OPTIONS = Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`);

function fmtDate(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y?.slice(2)}`;
}

function sortKey(s: any): string {
  if (s.ataDate) return `${s.ataDate}T${s.ataTime ?? "00:00"}`;
  if (s.etaDate) return `${s.etaDate}T${s.etaTime ?? "00:00"}`;
  return "9999-12-31T99:99";
}

function WareStatusSelect({
  wareStatus,
  canEdit,
  onChange,
}: {
  wareStatus: string | null;
  canEdit: boolean;
  onChange: (value: string | null) => void;
}) {
  const ws = wareStatus || "";
  const cls = WARE_STATUS_COLORS[ws] ?? "bg-slate-100 text-slate-500 border-slate-200";
  const label = WARE_STATUS_LABELS[ws] ?? "—";

  if (!canEdit) {
    return (
      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${ws ? cls : "bg-slate-100 text-slate-400 border-slate-200"}`}>
        {label}
      </span>
    );
  }

  return (
    <Select
      value={ws || "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger
        className={`h-auto px-1.5 py-0.5 text-[10px] font-medium rounded border gap-1 shadow-none focus:ring-0 focus:ring-offset-0 ${ws ? cls : "bg-slate-100 text-slate-500 border-slate-200"}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <SelectValue>{label}</SelectValue>
        <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
      </SelectTrigger>
      <SelectContent>
        {WARE_STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TorSelect({
  tor,
  canEdit,
  onChange,
}: {
  tor: string | null;
  canEdit: boolean;
  onChange: (value: string | null) => void;
}) {
  if (!canEdit) {
    return tor ? (
      <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border-indigo-200">
        {tor}
      </span>
    ) : null;
  }

  return (
    <Select
      value={tor ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger
        className={`h-auto px-1.5 py-0.5 text-[10px] font-semibold rounded border gap-0.5 shadow-none focus:ring-0 focus:ring-offset-0 ${tor ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <SelectValue>{tor ?? "Tor —"}</SelectValue>
        <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        {TOR_OPTIONS.map((t) => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ShipmentCard({
  shipment,
  canDrag,
  canEditWare,
  onWareStatusChange,
  onTorChange,
}: {
  shipment: any;
  canDrag: boolean;
  canEditWare: boolean;
  onWareStatusChange: (id: number, value: string | null) => void;
  onTorChange: (id: number, value: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: shipment.id, disabled: !canDrag });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      className="mb-2"
    >
      <Card className={`shadow-sm ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default"} ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-400">#{shipment.id}</span>
            <div className="flex items-center gap-1.5">
              <TorSelect
                tor={shipment.tor ?? null}
                canEdit={canEditWare}
                onChange={(v) => onTorChange(shipment.id, v)}
              />
              {shipment.gesperrtFuerSpedition && (
                <Lock className="w-3 h-3 text-red-400 shrink-0" />
              )}
            </div>
          </div>
          <div className="font-semibold text-slate-900 text-sm leading-tight truncate">
            {shipment.kennzeichen || (
              <span className="text-slate-400 font-normal italic">Kein Kennzeichen</span>
            )}
          </div>
          {shipment.speditionName && (
            <div className="text-xs text-slate-500 truncate">{shipment.speditionName}</div>
          )}
          {shipment.relation && (
            <div className="text-xs text-slate-400 truncate">{shipment.relation}</div>
          )}
          {shipment.ataDate ? (
            <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>ATA {fmtDate(shipment.ataDate)}{shipment.ataTime ? ` ${shipment.ataTime}` : ""}</span>
            </div>
          ) : shipment.etaDate ? (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Clock className="w-3 h-3 shrink-0" />
              <span>ETA {fmtDate(shipment.etaDate)}{shipment.etaTime ? ` ${shipment.etaTime}` : ""}</span>
            </div>
          ) : null}
          <div className="pt-0.5">
            <WareStatusSelect
              wareStatus={shipment.wareStatus ?? null}
              canEdit={canEditWare}
              onChange={(v) => onWareStatusChange(shipment.id, v)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  canDrag,
  canEditWare,
  isLoading,
  onWareStatusChange,
  onTorChange,
}: {
  status: KanbanStatus;
  items: any[];
  canDrag: boolean;
  canEditWare: boolean;
  isLoading: boolean;
  onWareStatusChange: (id: number, value: string | null) => void;
  onTorChange: (id: number, value: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colors = STATUS_COLORS[status];

  return (
    <div
      className={`flex flex-col w-72 flex-shrink-0 rounded-xl border-2 ${colors.column} ${isOver && canDrag ? "ring-2 ring-primary ring-offset-2" : ""} transition-all`}
      style={{ minHeight: 0 }}
    >
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${colors.header}`}>
        <h3 className="font-semibold text-sm">{status}</h3>
        <Badge variant="secondary" className="bg-white/80 border text-xs tabular-nums">
          {isLoading ? "…" : items.length}
        </Badge>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-2 py-2"
        style={{ minHeight: 80 }}
      >
        <SortableContext
          id={status}
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.length === 0 && !isLoading ? (
            <div className="flex items-center justify-center h-20 text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              Keine Verladungen
            </div>
          ) : (
            items.map((shipment) => (
              <ShipmentCard
                key={shipment.id}
                shipment={shipment}
                canDrag={canDrag}
                canEditWare={canEditWare}
                onWareStatusChange={onWareStatusChange}
                onTorChange={onTorChange}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);

  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [filterLkwArt, setFilterLkwArt] = useState("__all__");
  const [filterTor, setFilterTor] = useState("__all__");
  const [filterSpeditionId, setFilterSpeditionId] = useState("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);

  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);

  const permissions = usePermissions();

  const { data: speditionen } = useListSpeditionen();

  const queryParams = {
    search: search.length > 2 ? search : undefined,
    lkwArt: filterLkwArt !== "__all__" ? filterLkwArt : undefined,
    tor: filterTor !== "__all__" ? filterTor : undefined,
    speditionId: filterSpeditionId !== "__all__" ? Number(filterSpeditionId) : undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
  };

  const { data: rawShipments, isLoading } = useListShipments(queryParams);

  const canDrag     = !!permissions["kanban.use"];
  const canEditWare = !!permissions["shipment.edit"];

  const updateShipment = useUpdateShipment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      },
      onError: () => {
        toast.error("Fehler beim Aktualisieren");
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      },
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const shipments = (rawShipments ?? []) as any[];
  const visibleShipments = shipments
    .filter((s) => (KANBAN_STATUSES as readonly string[]).includes(s.status))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const byStatus: Record<KanbanStatus, any[]> = {
    Angemeldet:     visibleShipments.filter((s) => s.status === "Angemeldet"),
    Angekommen:     visibleShipments.filter((s) => s.status === "Angekommen"),
    "in Verladung": visibleShipments.filter((s) => s.status === "in Verladung"),
    Verladen:       visibleShipments.filter((s) => s.status === "Verladen"),
  };

  const activeShipment = activeId ? visibleShipments.find((s) => s.id === activeId) : null;

  const handleDragStart = (event: any) => setActiveId(event.active.id as number);

  const handleDragEnd = (event: any) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const fromStatus = visibleShipments.find((s) => s.id === active.id)?.status;
    let toStatus: string | undefined;

    if ((KANBAN_STATUSES as readonly string[]).includes(over.id)) {
      toStatus = over.id;
    } else {
      toStatus =
        over.data.current?.sortable?.containerId ??
        visibleShipments.find((s) => s.id === over.id)?.status;
    }

    if (!toStatus || toStatus === fromStatus) return;
    updateShipment.mutate({ id: active.id, data: { status: toStatus as any } });
  };

  const handleWareStatusChange = (id: number, value: string | null) => {
    updateShipment.mutate({ id, data: { wareStatus: value ?? "" } as any });
  };

  const handleTorChange = (id: number, value: string | null) => {
    updateShipment.mutate({ id, data: { tor: value ?? "" } as any });
  };

  function resetFilters() {
    setSearch("");
    setFilterLkwArt("__all__");
    setFilterTor("__all__");
    setFilterSpeditionId("__all__");
    setFilterDateFrom(today);
    setFilterDateTo(today);
  }

  const hasActiveFilters =
    search.length > 0 ||
    filterLkwArt !== "__all__" ||
    filterTor !== "__all__" ||
    filterSpeditionId !== "__all__" ||
    filterDateFrom !== today ||
    filterDateTo !== today;

  if (!permissions["kanban.use"] && Object.keys(permissions).length > 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-slate-500">
        <ShieldOff className="w-10 h-10 text-slate-300" />
        <p className="text-sm font-medium">Keine Berechtigung für das Kanban-Board</p>
        <p className="text-xs text-slate-400">
          Bitte einen Administrator um die Berechtigung <strong>kanban.use</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Kanban-Board</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {canDrag
              ? "Per Drag & Drop zwischen den Spalten verschieben"
              : "Nur-Lesen — kein Drag & Drop"}
            {" · "}Ware-Status per Dropdown auf der Karte ändern
          </p>
        </div>
        <div className="text-xs text-slate-400 tabular-nums">
          {isLoading ? "…" : visibleShipments.length} aktive Verladung
          {visibleShipments.length !== 1 ? "en" : ""}
        </div>
      </div>

      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Kennzeichen, Tor…"
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={filterLkwArt} onValueChange={setFilterLkwArt}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
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
            <SelectTrigger className="w-[110px] h-8 text-sm">
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
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue placeholder="Spedition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Speditionen</SelectItem>
                {speditionen.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 whitespace-nowrap">Von</span>
            <Input
              type="date"
              className="w-[130px] h-8 text-sm"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">Bis</span>
            <Input
              type="date"
              className="w-[130px] h-8 text-sm"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-500 hover:text-slate-700 gap-1"
              onClick={resetFilters}
            >
              <X className="w-3.5 h-3.5" />
              Zurücksetzen
            </Button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2 flex-1 min-h-0">
          {KANBAN_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              items={byStatus[status]}
              canDrag={canDrag}
              canEditWare={canEditWare}
              isLoading={isLoading}
              onWareStatusChange={handleWareStatusChange}
              onTorChange={handleTorChange}
            />
          ))}
        </div>

        <DragOverlay>
          {activeShipment ? (
            <div className="w-72 rotate-1 opacity-90">
              <Card className="shadow-2xl border-primary/40">
                <CardContent className="p-3 space-y-1">
                  <span className="text-xs font-mono text-slate-400">#{activeShipment.id}</span>
                  <div className="font-semibold text-slate-900 text-sm">
                    {activeShipment.kennzeichen || "Kein Kennzeichen"}
                  </div>
                  {activeShipment.speditionName && (
                    <div className="text-xs text-slate-500">{activeShipment.speditionName}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
