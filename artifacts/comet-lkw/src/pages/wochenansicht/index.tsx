import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { customFetch, useListSpeditionen } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, CalendarDays, GripVertical, Clock, Lock, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShipmentDrawer } from "@/pages/shipments/components/shipment-drawer";

const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];

// ── Date helpers ──────────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const dow = copy.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getKW(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_NAMES_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Angemeldet:     "bg-slate-100 text-slate-700 border-slate-200",
  Erwartet:       "bg-blue-50 text-blue-700 border-blue-200",
  Angekommen:     "bg-green-50 text-green-700 border-green-200",
  "in Verladung": "bg-orange-50 text-orange-700 border-orange-200",
  Verladen:       "bg-yellow-50 text-yellow-700 border-yellow-200",
  Abgefertigt:    "bg-teal-50 text-teal-700 border-teal-200",
  Storniert:      "bg-red-50 text-red-600 border-red-200",
};

// ── Shipment card (shared between draggable and overlay) ──────────────────────
interface Shipment {
  id: number;
  bezeichnung?: string | null;
  kennzeichen?: string | null;
  relation?: string | null;
  etaDate?: string | null;
  etaTime?: string | null;
  ataDate?: string | null;
  ataTime?: string | null;
  status: string;
  speditionName?: string | null;
  lkwArt?: string | null;
  tor?: string | null;
  gesperrtFuerSpedition?: boolean;
}

function ShipmentCard({
  shipment,
  compact = false,
  onClick,
}: {
  shipment: Shipment;
  compact?: boolean;
  onClick?: () => void;
}) {
  const statusClass = STATUS_COLORS[shipment.status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const time = shipment.ataTime || shipment.etaTime;
  const isLocked = shipment.gesperrtFuerSpedition;
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg border shadow-sm p-2.5 space-y-1.5 select-none transition-colors",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-md",
        isLocked ? "border-amber-200 bg-amber-50/40" : "border-slate-200",
        compact && "shadow-md ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          {isLocked && <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
          <span className="text-xs font-bold text-slate-800 leading-tight truncate">
            {shipment.kennzeichen || "—"}
          </span>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1 py-0 shrink-0 border", statusClass)}>
          {shipment.status}
        </Badge>
      </div>
      {shipment.bezeichnung && (
        <p className="text-[11px] text-slate-600 leading-tight truncate">{shipment.bezeichnung}</p>
      )}
      {shipment.relation && (
        <p className="text-[10px] text-slate-400 truncate">↔ {shipment.relation}</p>
      )}
      <div className="flex items-center justify-between gap-1 pt-0.5">
        {shipment.speditionName && (
          <span className="text-[9px] text-slate-400 truncate">{shipment.speditionName}</span>
        )}
        {time && (
          <span className="text-[9px] text-slate-400 flex items-center gap-0.5 shrink-0">
            <Clock className="w-2.5 h-2.5" />{time}
          </span>
        )}
      </div>
      {shipment.tor && (
        <div className="text-[9px] text-slate-400">Tor: {shipment.tor}</div>
      )}
    </div>
  );
}

// ── Draggable shipment wrapper ────────────────────────────────────────────────
function DraggableShipment({
  shipment,
  canDrag,
  onSelect,
}: {
  shipment: Shipment;
  canDrag: boolean;
  onSelect: (id: number) => void;
}) {
  const isLocked = !!shipment.gesperrtFuerSpedition;
  const dragEnabled = canDrag && !isLocked;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: shipment.id,
    disabled: !dragEnabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("relative group", isDragging && "opacity-30")}
      {...(dragEnabled ? attributes : {})}
    >
      {dragEnabled && (
        <div
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Verschieben"
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}
      {isLocked && canDrag && (
        <div
          className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Gesperrt – kann nicht verschoben werden"
        >
          <Lock className="w-2.5 h-2.5 text-amber-400" />
        </div>
      )}
      <div className={canDrag ? "pl-4" : ""}>
        <ShipmentCard
          shipment={shipment}
          onClick={() => onSelect(shipment.id)}
        />
      </div>
    </div>
  );
}

// ── Droppable day column ──────────────────────────────────────────────────────
function DroppableDay({
  dateStr,
  date,
  dayIndex,
  shipments,
  canDrag,
  isToday,
  onSelect,
}: {
  dateStr: string;
  date: Date;
  dayIndex: number;
  shipments: Shipment[];
  canDrag: boolean;
  isToday: boolean;
  onSelect: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });

  return (
    <div className="flex flex-col min-w-0">
      {/* Day header */}
      <div
        className={cn(
          "sticky top-0 z-10 px-2 py-2 text-center border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm",
          isToday && "bg-primary/5"
        )}
      >
        <div className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-slate-500")}>
          {DAY_NAMES[dayIndex]}
        </div>
        <div
          className={cn(
            "text-lg font-bold leading-tight",
            isToday ? "text-primary" : "text-slate-800"
          )}
        >
          {date.getDate()}
        </div>
        <div className="text-[10px] text-slate-400">
          {date.toLocaleString("de-DE", { month: "short" })}
        </div>
        {shipments.length > 0 && (
          <div className="mt-1">
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-200 text-slate-400">
              {shipments.length} LKW
            </Badge>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 min-h-[120px] rounded-b-lg transition-colors",
          isOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset",
          isToday && !isOver && "bg-primary/[0.02]"
        )}
      >
        {shipments.length === 0 && (
          <div className={cn("h-16 flex items-center justify-center rounded-md border-2 border-dashed transition-colors",
            isOver ? "border-primary/40 bg-primary/5" : "border-slate-100"
          )}>
            <span className="text-[10px] text-slate-300">{isOver ? "Hier ablegen" : "—"}</span>
          </div>
        )}
        {shipments.map((s) => (
          <DraggableShipment key={s.id} shipment={s} canDrag={canDrag} onSelect={onSelect} />
        ))}
        {shipments.length > 0 && isOver && (
          <div className="h-10 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center">
            <span className="text-[10px] text-primary/60">Hier ablegen</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WochenansichtPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);

  const [monday, setMonday] = useState<Date>(() => getMonday(new Date()));
  const [activeShipment, setActiveShipment] = useState<Shipment | null>(null);
  const [drawerShipmentId, setDrawerShipmentId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterSpeditionId, setFilterSpeditionId] = useState("__all__");

  const openDrawer = (id: number) => {
    setDrawerShipmentId(id);
    setDrawerOpen(true);
  };

  const days = weekDays(monday);
  const from = toDateStr(days[0]);
  const to = toDateStr(days[6]);
  const today = toDateStr(new Date());
  const kw = getKW(monday);

  // Fetch shipments for this week
  const { data: allShipments = [], isLoading } = useQuery<Shipment[]>({
    queryKey: ["shipments-week", from, to],
    queryFn: () => customFetch(`/api/shipments?dateFrom=${from}&dateTo=${to}`),
  });

  // Fetch current user's permissions
  const { data: permissions = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["my-permissions"],
    queryFn: () => customFetch("/api/auth/permissions"),
    staleTime: 60_000,
  });

  // Fetch Speditionen list (only relevant for COMET-side users)
  const { data: speditionen } = useListSpeditionen({ query: { enabled: isCometUser } });

  const canDrag = !!permissions["shipment.reschedule"];

  const hasActiveFilters = filterStatus !== "__all__" || filterSpeditionId !== "__all__";

  const resetFilters = () => {
    setFilterStatus("__all__");
    setFilterSpeditionId("__all__");
  };

  // Apply status / Spedition filters
  const shipments = useMemo(() => {
    return allShipments.filter((s: any) => {
      if (filterStatus !== "__all__" && s.status !== filterStatus) return false;
      if (filterSpeditionId !== "__all__" && String(s.speditionId ?? "") !== filterSpeditionId) return false;
      return true;
    });
  }, [allShipments, filterStatus, filterSpeditionId]);

  // Group shipments by etaDate
  const byDate = useMemo(() => {
    const map: Record<string, Shipment[]> = {};
    for (const d of days) map[toDateStr(d)] = [];
    for (const s of shipments) {
      const date = s.etaDate;
      if (date && map[date] !== undefined) {
        map[date].push(s);
      }
    }
    // Sort each day by time
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const at = a.ataTime || a.etaTime || "99:99";
        const bt = b.ataTime || b.etaTime || "99:99";
        return at.localeCompare(bt);
      });
    }
    return map;
  }, [shipments, from, to]);

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: ({ id, newDate }: { id: number; newDate: string }) =>
      customFetch(`/api/shipments/${id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ newDate }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (updated: Shipment) => {
      qc.invalidateQueries({ queryKey: ["shipments-week", from, to] });
      toast({ title: `LKW ${updated.kennzeichen || updated.id} verschoben` });
    },
    onError: (e: any) =>
      toast({ title: e?.message ?? "Fehler beim Verschieben", variant: "destructive" }),
  });

  // DnD setup
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as number;
    setActiveShipment(shipments.find((s) => s.id === id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveShipment(null);
    const { active, over } = event;
    if (!over) return;
    const shipmentId = active.id as number;
    const newDate = over.id as string;
    const shipment = shipments.find((s) => s.id === shipmentId);
    if (!shipment || shipment.etaDate === newDate) return;
    rescheduleMutation.mutate({ id: shipmentId, newDate });
  }

  // Undated shipments (etaDate null or outside the week)
  const undated = shipments.filter((s) => !s.etaDate || !byDate[s.etaDate]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Wochenplan</h1>
              <p className="text-xs text-slate-400">
                KW {kw} · {days[0].toLocaleDateString("de-DE")} – {days[6].toLocaleDateString("de-DE")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canDrag && (
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200 hidden sm:flex items-center gap-1">
                <GripVertical className="w-3 h-3" /> Drag & Drop aktiv
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const m = getMonday(new Date());
                setMonday(m);
              }}
              className="text-xs"
            >
              Heute
            </Button>
            <div className="flex items-center border border-slate-200 rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => {
                  const m = new Date(monday);
                  m.setDate(m.getDate() - 7);
                  setMonday(m);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => {
                  const m = new Date(monday);
                  m.setDate(m.getDate() + 7);
                  setMonday(m);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" />
            Filter:
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isCometUser && speditionen && (
            <Select value={filterSpeditionId} onValueChange={setFilterSpeditionId}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Spedition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Speditionen</SelectItem>
                {speditionen.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500 h-8 text-xs">
              <X className="w-3 h-3 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-7 divide-x divide-slate-200 border-b border-slate-200 min-h-full" style={{ minWidth: 840 }}>
              {days.map((date, i) => {
                const dateStr = toDateStr(date);
                const dayShipments = byDate[dateStr] ?? [];
                return (
                  <DroppableDay
                    key={dateStr}
                    dateStr={dateStr}
                    date={date}
                    dayIndex={i}
                    shipments={dayShipments}
                    canDrag={canDrag}
                    isToday={dateStr === today}
                    onSelect={openDrawer}
                  />
                );
              })}
            </div>

            {/* Undated shipments */}
            {undated.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60">
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                  Ohne Datum ({undated.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {undated.map((s) => (
                    <div key={s.id} className="w-48">
                      <ShipmentCard shipment={s} onClick={() => openDrawer(s.id)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Drag overlay (floating preview) */}
          <DragOverlay dropAnimation={null}>
            {activeShipment && (
              <div className="w-44 rotate-1 opacity-95 shadow-2xl">
                <ShipmentCard shipment={activeShipment} compact />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <ShipmentDrawer
        shipmentId={drawerShipmentId}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) {
            qc.invalidateQueries({ queryKey: ["shipments-week", from, to] });
          }
        }}
      />
    </div>
  );
}
