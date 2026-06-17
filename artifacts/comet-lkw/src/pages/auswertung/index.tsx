import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { format, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import {
  Loader2,
  Download,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Clock,
  Truck,
  CheckCircle2,
  AlertCircle,
  Timer,
} from "lucide-react";
import * as XLSX from "xlsx";

const ALL = "__all__";

const STATUS_COLORS: Record<string, string> = {
  Angemeldet:    "#64748b",
  Angekommen:    "#3b82f6",
  "in Verladung":"#f97316",
  Verladen:      "#8b5cf6",
  Abgefertigt:   "#22c55e",
  Storniert:     "#ef4444",
};

interface ShipmentRow {
  id: number;
  bezeichnung: string | null;
  kennzeichen: string | null;
  relation: string | null;
  lkwArt: string | null;
  speditionId: number | null;
  speditionName: string;
  tor: string | null;
  status: string;
  etaDate: string | null;
  etaTime: string | null;
  ataDate: string | null;
  ataTime: string | null;
  verzoegerungMin: number | null;
  angekommenAt: string | null;
  verladenAt: string | null;
  verarbeitungszeitMin: number | null;
  createdAt: string;
}

interface Stats {
  gesamt: number;
  mitAta: number;
  puenktlich: number;
  verspaetet: number;
  zuFrueh: number;
  avgVerzoegerungMin: number | null;
  avgVerarbeitungszeitMin: number | null;
  byStatus: { status: string; count: number }[];
  byRelation: { relation: string; count: number; avgVerzoegerungMin: number | null }[];
  bySpedition: { speditionId: number; speditionName: string; count: number; avgVerzoegerungMin: number | null }[];
}

interface AuswertungResponse {
  shipments: ShipmentRow[];
  stats: Stats;
  meta: {
    from: string;
    to: string;
    relations: string[];
    speditionen: { id: number; name: string }[];
  };
}

function fmtMin(min: number | null): string {
  if (min === null) return "–";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = min < 0 ? "-" : min > 0 ? "+" : "";
  if (h > 0) return `${sign}${h}h ${m}min`;
  return `${sign}${m}min`;
}

function delayBadge(min: number | null) {
  if (min === null) return <span className="text-slate-400">–</span>;
  if (Math.abs(min) <= 15) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Pünktlich {fmtMin(min)}</Badge>;
  if (min > 15) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Verspätet {fmtMin(min)}</Badge>;
  return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Zu früh {fmtMin(min)}</Badge>;
}

function exportCsv(rows: ShipmentRow[]) {
  const headers = [
    "ID","Bezeichnung","Kennzeichen","Relation","LKW-Art","Spedition","Tor","Status",
    "ETA-Datum","ETA-Zeit","ATA-Datum","ATA-Zeit","Verspätung (min)","Verarbeitungszeit (min)",
    "Angekommen um","Verladen um",
  ];
  const lines = [
    headers.join(";"),
    ...rows.map((r) =>
      [
        r.id, r.bezeichnung ?? "", r.kennzeichen ?? "", r.relation ?? "",
        r.lkwArt ?? "", r.speditionName, r.tor ?? "", r.status,
        r.etaDate ?? "", r.etaTime ?? "", r.ataDate ?? "", r.ataTime ?? "",
        r.verzoegerungMin ?? "", r.verarbeitungszeitMin ?? "",
        r.angekommenAt ? format(new Date(r.angekommenAt), "dd.MM.yy HH:mm") : "",
        r.verladenAt   ? format(new Date(r.verladenAt),   "dd.MM.yy HH:mm") : "",
      ].join(";"),
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auswertung_${format(new Date(), "yyyyMMdd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportXlsx(rows: ShipmentRow[]) {
  const data = rows.map((r) => ({
    ID: r.id,
    Bezeichnung: r.bezeichnung ?? "",
    Kennzeichen: r.kennzeichen ?? "",
    Relation: r.relation ?? "",
    "LKW-Art": r.lkwArt ?? "",
    Spedition: r.speditionName,
    Tor: r.tor ?? "",
    Status: r.status,
    "ETA-Datum": r.etaDate ?? "",
    "ETA-Zeit": r.etaTime ?? "",
    "ATA-Datum": r.ataDate ?? "",
    "ATA-Zeit": r.ataTime ?? "",
    "Verspätung (min)": r.verzoegerungMin ?? "",
    "Verarbeitungszeit (min)": r.verarbeitungszeitMin ?? "",
    "Angekommen um": r.angekommenAt ? format(new Date(r.angekommenAt), "dd.MM.yy HH:mm") : "",
    "Verladen um":   r.verladenAt   ? format(new Date(r.verladenAt),   "dd.MM.yy HH:mm") : "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Auswertung");
  XLSX.writeFile(wb, `auswertung_${format(new Date(), "yyyyMMdd")}.xlsx`);
}

export default function AuswertungPage() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo,   setDateTo]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [relation,    setRelation]    = useState(ALL);
  const [speditionId, setSpeditionId] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sortCol, setSortCol] = useState<keyof ShipmentRow>("etaDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const params = new URLSearchParams({ dateFrom, dateTo });
  if (relation    !== ALL) params.set("relation",    relation);
  if (speditionId !== ALL) params.set("speditionId", speditionId);
  if (statusFilter !== ALL) params.set("status",     statusFilter);

  const { data, isLoading, isError } = useQuery<AuswertungResponse>({
    queryKey: ["auswertung", dateFrom, dateTo, relation, speditionId, statusFilter],
    queryFn: () => customFetch(`/api/auswertung?${params.toString()}`),
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.shipments].sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const cmp = String(av).localeCompare(String(bv), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortCol, sortDir]);

  function toggleSort(col: keyof ShipmentRow) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const s = data?.stats;
  const puenktlichRate = s && s.mitAta > 0 ? Math.round((s.puenktlich / s.mitAta) * 100) : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Auswertung</h1>
          <p className="text-sm text-slate-400 mt-0.5">Statistiken & Analyse aller Verladungen</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data || sorted.length === 0}
            onClick={() => exportCsv(sorted)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Download className="w-4 h-4 mr-1.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || sorted.length === 0}
            onClick={() => exportXlsx(sorted)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Von</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200 w-36 h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Bis</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-200 w-36 h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Relation</span>
              <Select value={relation} onValueChange={setRelation}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 w-44 h-8 text-sm">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Relationen</SelectItem>
                  {data?.meta.relations.map((r) => (
                    <SelectItem key={r} value={r!}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Spedition</span>
              <Select value={speditionId} onValueChange={setSpeditionId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 w-44 h-8 text-sm">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Speditionen</SelectItem>
                  {data?.meta.speditionen.map((sp) => (
                    <SelectItem key={sp.id} value={String(sp.id)}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Status</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 w-40 h-8 text-sm">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Status</SelectItem>
                  {["Angemeldet","Angekommen","in Verladung","Verladen","Abgefertigt","Storniert"].map((st) => (
                    <SelectItem key={st} value={st}>{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Lade Daten…
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-400 p-4">
          <AlertCircle className="w-5 h-5" /> Fehler beim Laden der Daten.
        </div>
      )}

      {data && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-100">{s!.gesamt}</div>
                    <div className="text-xs text-slate-400">Verladungen gesamt</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-100">
                      {puenktlichRate !== null ? `${puenktlichRate}%` : "–"}
                    </div>
                    <div className="text-xs text-slate-400">Pünktlichkeitsrate (±15min)</div>
                    {s!.mitAta > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {s!.puenktlich} pünktl. / {s!.verspaetet} verspät. / {s!.zuFrueh} zu früh
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    s!.avgVerzoegerungMin !== null && s!.avgVerzoegerungMin > 0 ? "bg-red-500/20" : "bg-blue-500/20"
                  }`}>
                    {s!.avgVerzoegerungMin !== null && s!.avgVerzoegerungMin > 0
                      ? <TrendingUp className="w-5 h-5 text-red-400" />
                      : <TrendingDown className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-100">{fmtMin(s!.avgVerzoegerungMin)}</div>
                    <div className="text-xs text-slate-400">Ø Abweichung ETA/ATA</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{s!.mitAta} Ankünfte mit ATA</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                    <Timer className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-100">{fmtMin(s!.avgVerarbeitungszeitMin)}</div>
                    <div className="text-xs text-slate-400">Ø Verarbeitungszeit</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Angekommen → Verladen</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Charts Row ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Status distribution */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">Statusverteilung</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={s!.byStatus} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis type="category" dataKey="status" tick={{ fill: "#94a3b8", fontSize: 11 }} width={90} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                      labelStyle={{ color: "#e2e8f0" }}
                      itemStyle={{ color: "#94a3b8" }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {s!.byStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pünktlichkeit breakdown */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">Pünktlichkeit (mit ATA)</CardTitle>
              </CardHeader>
              <CardContent>
                {s!.mitAta === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
                    Keine Daten mit ATA im Zeitraum
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Pünktlich (±15min)", value: s!.puenktlich,  fill: "#22c55e" },
                          { name: "Verspätet (>15min)", value: s!.verspaetet,  fill: "#ef4444" },
                          { name: "Zu früh (>15min)",   value: s!.zuFrueh,    fill: "#3b82f6" },
                        ].filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                        itemStyle={{ color: "#94a3b8" }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── By Relation table ── */}
          {s!.byRelation.length > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">Auswertung nach Relation</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400 text-xs">Relation</TableHead>
                      <TableHead className="text-slate-400 text-xs text-right">Anzahl</TableHead>
                      <TableHead className="text-slate-400 text-xs text-right">Ø Abweichung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s!.byRelation.map((r) => (
                      <TableRow key={r.relation} className="border-slate-800 hover:bg-slate-800/40">
                        <TableCell className="text-slate-200 text-sm">{r.relation}</TableCell>
                        <TableCell className="text-slate-400 text-sm text-right">{r.count}</TableCell>
                        <TableCell className="text-right">
                          {r.avgVerzoegerungMin === null ? (
                            <span className="text-slate-500 text-sm">–</span>
                          ) : (
                            <span className={`text-sm font-medium ${
                              r.avgVerzoegerungMin > 15 ? "text-red-400" :
                              r.avgVerzoegerungMin < -15 ? "text-blue-400" : "text-green-400"
                            }`}>
                              {fmtMin(r.avgVerzoegerungMin)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── Shipments table ── */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Einzelne Verladungen ({sorted.length})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      {([
                        ["id",             "ID"],
                        ["etaDate",        "ETA"],
                        ["ataDate",        "ATA"],
                        ["relation",       "Relation"],
                        ["kennzeichen",    "Kennzeichen"],
                        ["speditionName",  "Spedition"],
                        ["tor",            "Tor"],
                        ["status",         "Status"],
                        ["verzoegerungMin","Abweichung"],
                        ["verarbeitungszeitMin","Verarbeitungszeit"],
                      ] as [keyof ShipmentRow, string][]).map(([col, label]) => (
                        <TableHead
                          key={col}
                          className="text-slate-400 text-xs cursor-pointer select-none hover:text-slate-200"
                          onClick={() => toggleSort(col)}
                        >
                          {label}
                          {sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-slate-500 py-8 text-sm">
                          Keine Verladungen im gewählten Zeitraum
                        </TableCell>
                      </TableRow>
                    ) : sorted.map((row) => (
                      <TableRow key={row.id} className="border-slate-800 hover:bg-slate-800/40">
                        <TableCell className="text-slate-400 text-xs">{row.id}</TableCell>
                        <TableCell className="text-slate-300 text-sm whitespace-nowrap">
                          {row.etaDate ? `${row.etaDate.slice(8,10)}.${row.etaDate.slice(5,7)}.${row.etaDate.slice(2,4)}` : "–"}
                          {row.etaTime ? ` ${row.etaTime}` : ""}
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm whitespace-nowrap">
                          {row.ataDate ? `${row.ataDate.slice(8,10)}.${row.ataDate.slice(5,7)}.${row.ataDate.slice(2,4)}` : "–"}
                          {row.ataTime ? ` ${row.ataTime}` : ""}
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">{row.relation ?? "–"}</TableCell>
                        <TableCell className="text-slate-300 text-sm font-mono text-xs">{row.kennzeichen ?? "–"}</TableCell>
                        <TableCell className="text-slate-300 text-sm">{row.speditionName}</TableCell>
                        <TableCell className="text-slate-400 text-sm">{row.tor ?? "–"}</TableCell>
                        <TableCell>
                          <Badge
                            style={{
                              backgroundColor: `${STATUS_COLORS[row.status] ?? "#64748b"}22`,
                              color: STATUS_COLORS[row.status] ?? "#94a3b8",
                              borderColor: `${STATUS_COLORS[row.status] ?? "#64748b"}55`,
                            }}
                            className="text-xs border"
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{delayBadge(row.verzoegerungMin)}</TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {row.verarbeitungszeitMin !== null
                            ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtMin(row.verarbeitungszeitMin)}</span>
                            : <span className="text-slate-600">–</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
