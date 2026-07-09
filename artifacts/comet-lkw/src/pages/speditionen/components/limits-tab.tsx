import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ChevronLeft, ChevronRight, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Limit {
  id: number;
  speditionId: number;
  von: string;
  bis: string;
  maxVerladungen: number;
  createdAt: string;
}

interface Props {
  speditionId: number;
  readonly?: boolean;
}

const LIMIT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-800", bar: "bg-blue-400", border: "border-blue-200", light: "bg-blue-50" },
  { bg: "bg-purple-100", text: "text-purple-800", bar: "bg-purple-400", border: "border-purple-200", light: "bg-purple-50" },
  { bg: "bg-amber-100", text: "text-amber-800", bar: "bg-amber-400", border: "border-amber-200", light: "bg-amber-50" },
  { bg: "bg-rose-100", text: "text-rose-800", bar: "bg-rose-400", border: "border-rose-200", light: "bg-rose-50" },
];

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getLimitStatus(l: Limit): "active" | "upcoming" | "expired" {
  const now = Date.now();
  const von = new Date(l.von).getTime();
  const bis = new Date(l.bis).getTime();
  if (now < von) return "upcoming";
  if (now > bis) return "expired";
  return "active";
}

function MonthCalendar({ limits, month, year }: { limits: Limit[]; month: number; year: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));

  function getColorIndicesForDay(day: Date): number[] {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
    return limits
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => new Date(l.von) <= dayEnd && new Date(l.bis) >= dayStart)
      .map(({ i }) => i % LIMIT_COLORS.length);
  }

  const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map(w => (
          <div key={w} className="text-center text-[10px] font-semibold text-slate-400 py-0.5">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[2px]">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} className="h-9" />;
          const colorIndices = getColorIndicesForDay(day);
          const hasLimit = colorIndices.length > 0;
          const isToday = day.toDateString() === today.toDateString();
          const isPast = day < today && !isToday;

          return (
            <div
              key={day.getDate()}
              className={`
                h-9 flex flex-col items-center justify-center rounded relative
                ${isToday ? "ring-2 ring-blue-500 ring-offset-1 z-10" : ""}
                ${isPast ? "opacity-50" : ""}
                ${hasLimit ? LIMIT_COLORS[colorIndices[0]].bg : ""}
              `}
            >
              <span className={`text-xs font-medium ${hasLimit ? LIMIT_COLORS[colorIndices[0]].text : "text-slate-600"} ${isToday ? "font-bold" : ""}`}>
                {day.getDate()}
              </span>
              {colorIndices.length > 1 && (
                <div className="flex gap-[2px] mt-0.5">
                  {colorIndices.slice(1).map(ci => (
                    <div key={ci} className={`w-1 h-1 rounded-full ${LIMIT_COLORS[ci].bar}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LimitsTab({ speditionId, readonly = false }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const qKey = ["spedition-limits", speditionId];

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [showForm, setShowForm] = useState(false);

  const defaultVon = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return toDatetimeLocal(d.toISOString());
  };
  const defaultBis = () => {
    const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0);
    return toDatetimeLocal(d.toISOString());
  };

  const [form, setForm] = useState({ von: defaultVon(), bis: defaultBis(), maxVerladungen: "" });

  const { data: limits = [], isLoading } = useQuery<Limit[]>({
    queryKey: qKey,
    queryFn: () => customFetch(`/api/speditionen/${speditionId}/limits`),
    enabled: !!speditionId,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      customFetch(`/api/speditionen/${speditionId}/limits`, {
        method: "POST",
        body: JSON.stringify({
          von: new Date(data.von).toISOString(),
          bis: new Date(data.bis).toISOString(),
          maxVerladungen: parseInt(data.maxVerladungen, 10),
        }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast({ title: "Tageslimit hinzugefügt" });
      setShowForm(false);
      setForm({ von: defaultVon(), bis: defaultBis(), maxVerladungen: "" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Fehler beim Speichern", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/speditionen/${speditionId}/limits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast({ title: "Limit gelöscht" });
    },
    onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
  });

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const handleSubmit = () => {
    if (!form.von || !form.bis) {
      toast({ title: "Bitte Von- und Bis-Zeitpunkt angeben", variant: "destructive" }); return;
    }
    if (new Date(form.von) >= new Date(form.bis)) {
      toast({ title: "Der Startzeitpunkt muss vor dem Endzeitpunkt liegen", variant: "destructive" }); return;
    }
    const n = parseInt(form.maxVerladungen, 10);
    if (!form.maxVerladungen || isNaN(n) || n < 1) {
      toast({ title: "Bitte eine gültige Anzahl (≥ 1) angeben", variant: "destructive" }); return;
    }
    createMutation.mutate(form);
  };

  const monthName = new Date(calYear, calMonth, 1).toLocaleString("de-DE", { month: "long", year: "numeric" });
  const sortedLimits = [...limits].sort((a, b) => new Date(a.von).getTime() - new Date(b.von).getTime());
  const activeAndUpcoming = sortedLimits.filter(l => getLimitStatus(l) !== "expired");
  const expired = sortedLimits.filter(l => getLimitStatus(l) === "expired");

  if (isLoading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Kalenderansicht */}
      <div className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="text-sm font-semibold text-slate-700 capitalize">{monthName}</span>
          <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <MonthCalendar limits={limits} month={calMonth} year={calYear} />
        {limits.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1">
            {sortedLimits.map((l, i) => (
              <div key={l.id} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-sm ${LIMIT_COLORS[i % LIMIT_COLORS.length].bar}`} />
                <span className="text-[10px] text-slate-500">Limit {i + 1}: max. {l.maxVerladungen}/Tag</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hinzufügen-Button */}
      {!readonly && !showForm && (
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" />
          Zeitraum-Limit hinzufügen
        </Button>
      )}

      {/* Formular */}
      {!readonly && showForm && (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-3">
          <p className="text-xs font-semibold text-blue-800 mb-1">Neues Zeitraum-Tageslimit</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Von (Datum &amp; Uhrzeit)</Label>
              <input
                type="datetime-local"
                value={form.von}
                onChange={e => setForm(f => ({ ...f, von: e.target.value }))}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bis (Datum &amp; Uhrzeit)</Label>
              <input
                type="datetime-local"
                value={form.bis}
                onChange={e => setForm(f => ({ ...f, bis: e.target.value }))}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Maximale Verladungen pro Tag in diesem Zeitraum</Label>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="z.B. 5"
              value={form.maxVerladungen}
              onChange={e => setForm(f => ({ ...f, maxVerladungen: e.target.value }))}
              className="w-36 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Hinzufügen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Aktive & geplante Limits */}
      {activeAndUpcoming.length === 0 && !showForm && (
        <p className="text-sm text-slate-400 text-center py-2">Keine Zeitraum-Limits konfiguriert.</p>
      )}

      {activeAndUpcoming.map((limit) => {
        const status = getLimitStatus(limit);
        const colorIdx = sortedLimits.indexOf(limit) % LIMIT_COLORS.length;
        const color = LIMIT_COLORS[colorIdx];
        const von = new Date(limit.von).getTime();
        const bis = new Date(limit.bis).getTime();
        const durationMs = bis - von;
        const elapsedMs = Math.max(0, Date.now() - von);
        const progressPct = status === "active" ? Math.min(100, Math.round((elapsedMs / durationMs) * 100)) : 0;
        const totalDays = Math.ceil(durationMs / (24 * 3600 * 1000));
        const remainingDays = status === "active"
          ? Math.ceil((bis - Date.now()) / (24 * 3600 * 1000))
          : null;

        return (
          <div key={limit.id} className={`border ${color.border} rounded-lg p-3 ${color.light} space-y-2`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge className={`text-[10px] shrink-0 ${status === "active" ? "bg-green-500" : "bg-blue-500"} text-white border-0`}>
                  {status === "active" ? "Aktiv" : "Geplant"}
                </Badge>
                <span className={`text-sm font-bold ${color.text}`}>
                  max. {limit.maxVerladungen} Verladung{limit.maxVerladungen !== 1 ? "en" : ""}/Tag
                </span>
              </div>
              {!readonly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 ml-2"
                  onClick={() => deleteMutation.mutate(limit.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDt(limit.von)}
              </span>
              <span className="text-slate-300">→</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDt(limit.bis)}
              </span>
              <span className="text-slate-400">
                ({totalDays} Tag{totalDays !== 1 ? "e" : ""}
                {remainingDays !== null && `, noch ${remainingDays} Tag${remainingDays !== 1 ? "e" : ""}`})
              </span>
            </div>

            {status === "active" && (
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Fortschritt</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-1.5 bg-white rounded-full overflow-hidden">
                  <div className={`h-full ${color.bar} transition-all`} style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Abgelaufene Limits */}
      {expired.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-500 py-1 list-none flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            {expired.length} abgelaufene{expired.length !== 1 ? " Limits" : "s Limit"} (werden stündlich automatisch gelöscht)
          </summary>
          <div className="mt-2 space-y-1.5">
            {expired.map(l => (
              <div key={l.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-3 py-1.5 opacity-60">
                <span className="text-xs text-slate-500">
                  {formatDt(l.von)} → {formatDt(l.bis)} · max. {l.maxVerladungen}/Tag
                </span>
                {!readonly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-400 hover:text-red-600"
                    onClick={() => deleteMutation.mutate(l.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
