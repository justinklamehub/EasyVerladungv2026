import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { Loader2, TrendingUp, TrendingDown, Clock, AlertCircle, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

const ALL = "__all__";

const STATUS_COLORS: Record<string, string> = {
  Angemeldet:    "hsl(215.4 16.3% 46.9%)",
  Angekommen:    "hsl(160 60% 45%)",
  "in Verladung":"hsl(25 90% 55%)",
  Verladen:      "hsl(45 80% 50%)",
  Abgefertigt:   "hsl(173 58% 39%)",
  Storniert:     "hsl(0 84.2% 60.2%)",
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
  if (Math.abs(min) <= 15) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Pünktlich {fmtMin(min)}</Badge>;
  if (min > 15) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Verspätet {fmtMin(min)}</Badge>;
  return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Zu früh {fmtMin(min)}</Badge>;
}

type SortCol = keyof ShipmentRow;

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: "asc" | "desc" }) {
  if (sortCol !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 text-slate-400 inline" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 text-primary inline" />
    : <ArrowDown className="w-3 h-3 ml-1 text-primary inline" />;
}

export default function AuswertungPage() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo,   setDateTo]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [relation,     setRelation]     = useState(ALL);
  const [speditionId,  setSpeditionId]  = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sortCol, setSortCol] = useState<SortCol>("etaDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const params = new URLSearchParams({ dateFrom, dateTo });
  if (relation    !== ALL) params.set("relation",    relation);
  if (speditionId !== ALL) params.set("speditionId", speditionId);
  if (statusFilter !== ALL) params.set("status",     statusFilter);

  const { data, isLoading } = useQuery<AuswertungResponse>({
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

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const s = data?.stats;
  const puenktlichRate = s && s.mitAta > 0 ? Math.round((s.puenktlich / s.mitAta) * 100) : null;

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Auswertung</h1>
          <p className="text-sm text-slate-500 mt-1">Statistiken & Analyse aller Verladungen</p>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="shrink-0">Von</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[138px] h-9 bg-white"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="shrink-0">bis</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[138px] h-9 bg-white"
            />
          </div>
          <Select value={relation} onValueChange={setRelation}>
            <SelectTrigger className="w-[150px] bg-white">
              <SelectValue placeholder="Relation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Relationen</SelectItem>
              {data?.meta.relations.map((r) => (
                <SelectItem key={r} value={r!}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={speditionId} onValueChange={setSpeditionId}>
            <SelectTrigger className="w-[160px] bg-white">
              <SelectValue placeholder="Spedition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Speditionen</SelectItem>
              {data?.meta.speditionen.map((sp) => (
                <SelectItem key={sp.id} value={String(sp.id)}>{sp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[145px] bg-white">
              <SelectValue placeholder="Status" />
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

      {!data && (
        <div className="flex h-[30vh] flex-col items-center justify-center text-slate-500">
          <AlertCircle className="w-12 h-12 mb-4 text-slate-300" />
          <p>Keine Daten verfügbar.</p>
        </div>
      )}

      {data && s && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Verladungen gesamt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{s.gesamt}</div>
                <p className="text-xs text-slate-400 mt-1">{s.mitAta} mit tatsächlicher Ankunft</p>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Pünktlichkeitsrate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {puenktlichRate !== null ? `${puenktlichRate}%` : "–"}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {s.puenktlich} pünktl. · {s.verspaetet} verspät. · {s.zuFrueh} zu früh
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Ø Abweichung ETA/ATA</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold flex items-center gap-2 ${
                  s.avgVerzoegerungMin !== null && s.avgVerzoegerungMin > 0 ? "text-red-600" : "text-blue-600"
                }`}>
                  {s.avgVerzoegerungMin !== null && s.avgVerzoegerungMin > 0
                    ? <TrendingUp className="w-6 h-6" />
                    : <TrendingDown className="w-6 h-6" />}
                  {fmtMin(s.avgVerzoegerungMin)}
                </div>
                <p className="text-xs text-slate-400 mt-1">positiv = zu spät, negativ = zu früh</p>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Ø Verarbeitungszeit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-700 flex items-center gap-2">
                  <Clock className="w-6 h-6 text-slate-400" />
                  {fmtMin(s.avgVerarbeitungszeitMin)}
                </div>
                <p className="text-xs text-slate-400 mt-1">Angekommen → Verladen</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Charts ── */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle>Statusverteilung</CardTitle>
                <CardDescription>Anzahl Verladungen je Status</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {s.byStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.byStatus} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {s.byStatus.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? STATUS_COLORS.Angemeldet} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">Keine Daten für diesen Zeitraum</div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle>Pünktlichkeit</CardTitle>
                <CardDescription>Nur Verladungen mit tatsächlicher Ankunftszeit (ATA)</CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {s.mitAta === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400">Keine Daten mit ATA im Zeitraum</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Pünktlich (±15min)", value: s.puenktlich, fill: "hsl(160 60% 45%)" },
                          { name: "Verspätet (>15min)", value: s.verspaetet, fill: "hsl(0 84.2% 60.2%)" },
                          { name: "Zu früh (>15min)",   value: s.zuFrueh,   fill: "hsl(220 70% 50%)" },
                        ].filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      />
                      <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── By Relation & By Spedition ── */}
          <div className="grid gap-6 md:grid-cols-2">
            {s.byRelation.length > 0 && (
              <Card className="bg-white shadow-sm border-slate-200">
                <CardHeader>
                  <CardTitle>Nach Relation</CardTitle>
                  <CardDescription>Anzahl und Ø Abweichung je Relation</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-slate-200 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Relation</TableHead>
                          <TableHead className="text-right">Anzahl</TableHead>
                          <TableHead className="text-right">Ø Abweichung</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {s.byRelation.map((r) => (
                          <TableRow key={r.relation}>
                            <TableCell className="font-medium">{r.relation}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-medium ${
                                r.avgVerzoegerungMin === null ? "text-slate-400" :
                                r.avgVerzoegerungMin > 15 ? "text-red-600" :
                                r.avgVerzoegerungMin < -15 ? "text-blue-600" : "text-green-600"
                              }`}>
                                {fmtMin(r.avgVerzoegerungMin)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {s.bySpedition.length > 0 && (
              <Card className="bg-white shadow-sm border-slate-200">
                <CardHeader>
                  <CardTitle>Nach Spedition</CardTitle>
                  <CardDescription>Anzahl und Ø Abweichung je Spedition</CardDescription>
                </CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.bySpedition} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis dataKey="speditionName" type="category" axisLine={false} tickLine={false} width={110} tick={{ fontSize: 11 }} />
                      <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                      <Bar dataKey="count" fill="hsl(222 47% 11%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Shipments table ── */}
          <Card className="bg-white shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle>Einzelne Verladungen</CardTitle>
              <CardDescription>{sorted.length} Einträge im gewählten Zeitraum</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="rounded-b-lg overflow-hidden border-t border-slate-200">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        {([
                          ["id",                  "ID"],
                          ["etaDate",             "ETA"],
                          ["ataDate",             "ATA"],
                          ["relation",            "Relation"],
                          ["kennzeichen",         "Kennzeichen"],
                          ["speditionName",       "Spedition"],
                          ["tor",                 "Tor"],
                          ["status",              "Status"],
                          ["verzoegerungMin",     "Abweichung"],
                          ["verarbeitungszeitMin","Verarbeitungszeit"],
                        ] as [SortCol, string][]).map(([col, label]) => (
                          <TableHead
                            key={col}
                            className="cursor-pointer select-none whitespace-nowrap"
                            onClick={() => toggleSort(col)}
                          >
                            {label}
                            <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                            Keine Verladungen im gewählten Zeitraum
                          </TableCell>
                        </TableRow>
                      ) : sorted.map((row) => (
                        <TableRow key={row.id} className="hover:bg-slate-50">
                          <TableCell className="text-xs text-slate-400 font-mono">{row.id}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {row.etaDate
                              ? <><span className="font-medium">{format(new Date(row.etaDate), "dd.MM.yy")}</span>{row.etaTime ? ` ${row.etaTime}` : ""}</>
                              : <span className="text-slate-400">–</span>}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap text-green-700">
                            {row.ataDate
                              ? <><span className="font-medium">{format(new Date(row.ataDate), "dd.MM.yy")}</span>{row.ataTime ? ` ${row.ataTime}` : ""}</>
                              : <span className="text-slate-400">–</span>}
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm">{row.relation ?? "–"}</TableCell>
                          <TableCell className="font-medium text-sm">{row.kennzeichen ?? "–"}</TableCell>
                          <TableCell className="text-slate-600 text-sm">{row.speditionName}</TableCell>
                          <TableCell className="text-slate-600 text-sm">{row.tor ?? "–"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              row.status === "Abgefertigt" ? "bg-teal-50 text-teal-700 border-teal-200" :
                              row.status === "Verladen"    ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                              row.status === "in Verladung"? "bg-orange-50 text-orange-700 border-orange-200" :
                              row.status === "Angekommen"  ? "bg-green-50 text-green-700 border-green-200" :
                              row.status === "Storniert"   ? "bg-red-50 text-red-700 border-red-200" :
                              "bg-slate-100 text-slate-700 border-slate-200"
                            }>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{delayBadge(row.verzoegerungMin)}</TableCell>
                          <TableCell className="text-slate-600 text-sm">
                            {row.verarbeitungszeitMin !== null
                              ? <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" />{fmtMin(row.verarbeitungszeitMin)}</span>
                              : <span className="text-slate-400">–</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
