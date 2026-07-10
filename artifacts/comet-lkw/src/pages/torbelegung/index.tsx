import { useState, useMemo, useEffect } from "react";
import { format, addDays, subDays, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, GanttChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ShipmentDrawer } from "@/pages/shipments/components/shipment-drawer";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const START_HOUR = 4;
const END_HOUR = 23;
const PX_PER_HOUR = 100;
const BLOCK_DURATION_MIN = 90;
const BLOCK_HEIGHT = 38;
const ROW_PADDING = 5;
const GATE_LABEL_W = 84;

const ALL_GATES = [
  ...Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`),
  "Tor A",
  "Tor B",
  "Tor C",
];

const STATUS_ORDER = [
  "Angemeldet",
  "Erwartet",
  "Angekommen",
  "in Verladung",
  "Verladen",
  "Abgefertigt",
  "Storniert",
];

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  Angemeldet:    { bg: "#f1f5f9", border: "#94a3b8", text: "#334155" },
  Erwartet:      { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" },
  Angekommen:    { bg: "#dcfce7", border: "#22c55e", text: "#15803d" },
  "in Verladung":{ bg: "#ffedd5", border: "#f97316", text: "#c2410c" },
  Verladen:      { bg: "#fef9c3", border: "#eab308", text: "#a16207" },
  Abgefertigt:   { bg: "#ccfbf1", border: "#14b8a6", text: "#0f766e" },
  Storniert:     { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function etaToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShipmentItem {
  id: number;
  kennzeichen: string | null;
  bezeichnung: string | null;
  speditionName?: string;
  relation: string | null;
  tor: string | null;
  etaDate: string | null;
  etaTime: string | null;
  ataDate: string | null;
  ataTime: string | null;
  status: string | null;
  lkwArt: string | null;
  speditionId: number | null;
  bemerkungen?: string | null;
}

// ── Lane assignment ───────────────────────────────────────────────────────────

interface Placed {
  shipment: ShipmentItem;
  lane: number;
  startMin: number;
}

function assignLanes(items: ShipmentItem[]): Placed[] {
  const sorted = [...items].sort((a, b) => {
    const am = etaToMinutes(a.etaTime) ?? 99999;
    const bm = etaToMinutes(b.etaTime) ?? 99999;
    return am - bm;
  });

  const laneEnds: number[] = [];
  const result: Placed[] = [];

  for (const shipment of sorted) {
    const startMin = etaToMinutes(shipment.etaTime) ?? START_HOUR * 60;
    const endMin = startMin + BLOCK_DURATION_MIN;
    let lane = laneEnds.findIndex((e) => e <= startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endMin);
    } else {
      laneEnds[lane] = endMin;
    }
    result.push({ shipment, lane, startMin });
  }
  return result;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HourRuler() {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  return (
    <div className="flex" style={{ width: (END_HOUR - START_HOUR + 1) * PX_PER_HOUR }}>
      {hours.map((h) => (
        <div
          key={h}
          className="flex-shrink-0 border-l border-slate-200 text-[11px] text-slate-400 font-mono pl-1 py-1"
          style={{ width: PX_PER_HOUR }}
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

function GridLines() {
  const count = END_HOUR - START_HOUR + 1;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 border-l border-slate-200 pointer-events-none"
          style={{ left: i * PX_PER_HOUR, borderStyle: i === 0 ? "solid" : "dashed" }}
        />
      ))}
      {Array.from({ length: count }, (_, i) => (
        <div
          key={`hh${i}`}
          className="absolute top-0 bottom-0 border-l border-slate-100 pointer-events-none"
          style={{ left: i * PX_PER_HOUR + PX_PER_HOUR / 2, borderStyle: "dotted" }}
        />
      ))}
    </>
  );
}

function NowLine({ dateStr }: { dateStr: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (toDateStr(now) !== dateStr) return null;
  const leftPx = (now.getHours() * 60 + now.getMinutes()) / 60 * PX_PER_HOUR - START_HOUR * PX_PER_HOUR;
  if (leftPx < 0 || leftPx > (END_HOUR - START_HOUR + 1) * PX_PER_HOUR) return null;

  return (
    <div
      className="absolute top-0 bottom-0 z-10 pointer-events-none"
      style={{ left: leftPx }}
    >
      <div className="w-0.5 h-full bg-red-500 opacity-75" />
      <div
        className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-500 opacity-75"
      />
    </div>
  );
}

function ShipmentBlock({ shipment, lane, startMin, onClick }: Placed & { onClick: () => void }) {
  const style = STATUS_STYLE[shipment.status ?? ""] ?? STATUS_STYLE["Angemeldet"];
  const leftPx = (startMin / 60 - START_HOUR) * PX_PER_HOUR;
  const widthPx = (BLOCK_DURATION_MIN / 60) * PX_PER_HOUR - 4;
  const topPx = ROW_PADDING + lane * BLOCK_HEIGHT;
  const label = shipment.kennzeichen || shipment.bezeichnung || `#${shipment.id}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      title={[label, shipment.speditionName, shipment.status, shipment.lkwArt, shipment.bemerkungen].filter(Boolean).join(" · ")}
      className="absolute rounded border shadow-sm hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer overflow-hidden select-none"
      style={{
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: BLOCK_HEIGHT - 5,
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.text,
        borderWidth: 1.5,
      }}
    >
      <div className="px-1.5 h-full flex flex-col justify-center overflow-hidden">
        <span className="text-[11px] font-semibold leading-tight truncate">{label}</span>
        {(shipment.speditionName || shipment.relation) && (
          <span className="text-[10px] leading-tight opacity-75 truncate">
            {shipment.speditionName || shipment.relation}
          </span>
        )}
      </div>
    </div>
  );
}

function GateRow({
  gate,
  shipments,
  dateStr,
  onSelect,
}: {
  gate: string;
  shipments: ShipmentItem[];
  dateStr: string;
  onSelect: (id: number) => void;
}) {
  const placed = assignLanes(shipments);
  const numLanes = placed.length > 0 ? Math.max(...placed.map((p) => p.lane)) + 1 : 1;
  const rowH = ROW_PADDING * 2 + numLanes * BLOCK_HEIGHT;
  const totalW = (END_HOUR - START_HOUR + 1) * PX_PER_HOUR;

  const isKeinTor = gate === "Kein Tor";

  return (
    <div className={cn("flex border-b border-slate-100 hover:bg-slate-50/40 group", isKeinTor && "border-t-2 border-t-slate-200")}>
      <div
        className="flex-shrink-0 border-r border-slate-200 flex items-start pt-2 px-2 bg-white z-10"
        style={{ width: GATE_LABEL_W, minHeight: rowH }}
      >
        <span className={cn("text-xs font-medium truncate", isKeinTor ? "text-slate-400 italic" : "text-slate-600")}>
          {gate}
        </span>
      </div>
      <div className="relative flex-1" style={{ height: rowH, minWidth: totalW }}>
        <GridLines />
        <NowLine dateStr={dateStr} />
        {placed.map(({ shipment, lane, startMin }) => (
          <ShipmentBlock
            key={shipment.id}
            shipment={shipment}
            lane={lane}
            startMin={startMin}
            onClick={() => onSelect(shipment.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function StatusFilter({
  hidden,
  onToggle,
}: {
  hidden: Set<string>;
  onToggle: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STATUS_ORDER.map((s) => (
        <button
          key={s}
          onClick={() => onToggle(s)}
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full border font-medium transition-all",
            hidden.has(s) ? "opacity-30 grayscale" : "opacity-100",
          )}
          style={{
            backgroundColor: STATUS_STYLE[s]?.bg,
            borderColor: STATUS_STYLE[s]?.border,
            color: STATUS_STYLE[s]?.text,
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TorbelegungPage() {
  const [date, setDate] = useState(new Date());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(
    new Set(["Storniert", "Abgefertigt"]),
  );

  const dateStr = toDateStr(date);

  const { data: shipments = [], isLoading } = useQuery<ShipmentItem[]>({
    queryKey: ["torbelegung", dateStr],
    queryFn: () =>
      fetch(`${API}/shipments?dateFrom=${dateStr}&dateTo=${dateStr}`, {
        credentials: "include",
      }).then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const visible = useMemo(
    () => shipments.filter((s) => !hiddenStatuses.has(s.status ?? "")),
    [shipments, hiddenStatuses],
  );

  const byGate = useMemo(() => {
    const map = new Map<string, ShipmentItem[]>();
    for (const g of ALL_GATES) map.set(g, []);
    map.set("Kein Tor", []);
    for (const s of visible) {
      const g = s.tor && ALL_GATES.includes(s.tor) ? s.tor : "Kein Tor";
      map.get(g)!.push(s);
    }
    return map;
  }, [visible]);

  const visibleGates = useMemo(() => {
    const result: string[] = [];
    for (const g of ALL_GATES) {
      if ((byGate.get(g)?.length ?? 0) > 0) result.push(g);
    }
    if ((byGate.get("Kein Tor")?.length ?? 0) > 0) result.push("Kein Tor");
    return result;
  }, [byGate]);

  const toggleStatus = (s: string) =>
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const openDrawer = (id: number) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const totalW = (END_HOUR - START_HOUR + 1) * PX_PER_HOUR;

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-white flex-shrink-0 flex-wrap gap-y-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDate((d) => subDays(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setDate(new Date())}
            >
              Heute
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDate((d) => addDays(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800">
              {format(date, "EEEE, d. MMMM yyyy", { locale: de })}
            </span>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                if (e.target.value) setDate(parseISO(e.target.value));
              }}
              className="text-xs border border-slate-200 rounded px-2 h-8 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="ml-auto">
            <StatusFilter hidden={hiddenStatuses} onToggle={toggleStatus} />
          </div>
        </div>

        {/* ── Info bar ── */}
        <div className="flex items-center gap-4 px-4 py-1.5 border-b bg-slate-50 text-xs text-slate-500 flex-shrink-0">
          <span>
            {visible.length} Verladung{visible.length !== 1 ? "en" : ""}
            {shipments.length !== visible.length && ` (${shipments.length - visible.length} ausgeblendet)`}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <span className="inline-block w-3 h-0.5 bg-red-500 opacity-70" />
            Aktuelle Zeit
          </span>
          <span className="ml-auto text-[10px] text-slate-400">
            Jedes Feld entspricht 90 Min · Klicken zum Öffnen
          </span>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && (
          <div className="flex-1 overflow-auto">
            {/* Sticky header ruler */}
            <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm flex">
              <div
                className="flex-shrink-0 border-r border-slate-200 bg-white"
                style={{ width: GATE_LABEL_W }}
              />
              <div style={{ minWidth: totalW }}>
                <HourRuler />
              </div>
            </div>

            {visibleGates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                <GanttChart className="h-12 w-12 text-slate-200" />
                <p className="text-sm font-medium">Keine Verladungen mit Tor-Zuweisung für diesen Tag.</p>
                <p className="text-xs">Wähle einen anderen Tag oder blende weitere Status ein.</p>
              </div>
            ) : (
              <div>
                {visibleGates.map((gate) => (
                  <GateRow
                    key={gate}
                    gate={gate}
                    shipments={byGate.get(gate) ?? []}
                    dateStr={dateStr}
                    onSelect={openDrawer}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ShipmentDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        shipmentId={selectedId}
      />
    </>
  );
}
