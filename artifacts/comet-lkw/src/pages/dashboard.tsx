import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboard, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Calendar as CalendarIcon, Loader2, AlertCircle, AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LiveAlert {
  id: number;
  bezeichnung: string | null;
  kennzeichen: string | null;
  status: string;
  tor: string | null;
  speditionName: string;
  level: "warn" | "danger";
  minutesWaiting: number;
  alertReason: "timeInStatus" | "etaOverdue";
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export default function DashboardPage() {
  const [dateFilter, setDateFilter] = useState("today");

  let dateFrom = format(startOfDay(new Date()), "yyyy-MM-dd");
  let dateTo = format(endOfDay(new Date()), "yyyy-MM-dd");

  if (dateFilter === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateFrom = format(startOfDay(tomorrow), "yyyy-MM-dd");
    dateTo = format(endOfDay(tomorrow), "yyyy-MM-dd");
  } else if (dateFilter === "week") {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    dateFrom = format(startOfDay(start), "yyyy-MM-dd");
    dateTo = format(endOfDay(end), "yyyy-MM-dd");
  }

  const { data, isLoading } = useGetDashboard({ dateFrom, dateTo });

  const { data: liveData, dataUpdatedAt, isFetching: liveLoading } = useQuery<{
    alerts: LiveAlert[];
    checkedAt: string;
  }>({
    queryKey: ["dashboard-live-alerts"],
    queryFn: () => customFetch("/api/dashboard/live-alerts"),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-slate-500">
        <AlertCircle className="w-12 h-12 mb-4 text-slate-300" />
        <p>Keine Daten verfügbar.</p>
      </div>
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    Angemeldet: "hsl(215.4 16.3% 46.9%)",
    Erwartet: "hsl(220 70% 50%)",
    Angekommen: "hsl(160 60% 45%)",
    "in Verladung": "hsl(25 90% 55%)",
    Verladen: "hsl(45 80% 50%)",
    Abgefertigt: "hsl(173 58% 39%)",
    Storniert: "hsl(0 84.2% 60.2%)",
  };

  const alerts = liveData?.alerts ?? [];
  const dangerCount = alerts.filter((a) => a.level === "danger").length;
  const warnCount = alerts.filter((a) => a.level === "warn").length;

  const checkedAtStr = liveData?.checkedAt
    ? format(new Date(liveData.checkedAt), "HH:mm", { locale: de })
    : null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Überblick und aktuelle Kennzahlen
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[180px] bg-white">
              <CalendarIcon className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Zeitraum wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Heute</SelectItem>
              <SelectItem value="tomorrow">Morgen</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Gesamt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{data.totalShipments}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Erwartet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{data.expectedShipments}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Angekommen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{data.arrivedShipments}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Offen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-700">{data.openShipments}</div>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Verspätet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{data.lateShipments}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Brennpunkt: Live SLA Alerts ── */}
      <Card className={`shadow-sm border ${
        dangerCount > 0 ? "border-red-200 bg-red-50/30" :
        warnCount > 0  ? "border-orange-200 bg-orange-50/20" :
        "border-slate-200 bg-white"
      }`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {dangerCount > 0
                ? <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                : warnCount > 0
                ? <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                : <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              }
              <CardTitle className="text-base">Handlungsbedarf</CardTitle>
              {alerts.length > 0 && (
                <div className="flex items-center gap-1">
                  {dangerCount > 0 && (
                    <Badge className="bg-red-500 text-white border-0 text-xs px-1.5">{dangerCount} kritisch</Badge>
                  )}
                  {warnCount > 0 && (
                    <Badge className="bg-orange-400 text-white border-0 text-xs px-1.5">{warnCount} Warnung</Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {liveLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              {checkedAtStr && (
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  {checkedAtStr} Uhr
                </span>
              )}
              <CardDescription className="text-xs">alle 30 Sek. aktualisiert</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              Alle LKWs sind im Plan – keine SLA-Überschreitungen.
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-2"></TableHead>
                    <TableHead>LKW</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tor</TableHead>
                    <TableHead>Spedition</TableHead>
                    <TableHead className="text-right">Wartezeit</TableHead>
                    <TableHead className="text-right">Grund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id} className={alert.level === "danger" ? "bg-red-50/40" : "bg-orange-50/30"}>
                      <TableCell className="py-2 pr-0">
                        <div className={`w-2 h-2 rounded-full mx-auto ${alert.level === "danger" ? "bg-red-500" : "bg-orange-400"}`} />
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{alert.bezeichnung || alert.kennzeichen || `#${alert.id}`}</span>
                          {alert.bezeichnung && alert.kennzeichen && (
                            <span className="text-xs text-slate-400">{alert.kennzeichen}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={`text-xs ${
                          alert.status === "Angekommen"   ? "bg-green-50 text-green-700 border-green-200" :
                          alert.status === "in Verladung" ? "bg-orange-50 text-orange-700 border-orange-200" :
                          "bg-slate-50 text-slate-700 border-slate-200"
                        }`}>
                          {alert.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-slate-600 text-sm">{alert.tor ?? "–"}</TableCell>
                      <TableCell className="py-2 text-slate-600 text-sm">{alert.speditionName}</TableCell>
                      <TableCell className="py-2 text-right">
                        <span className={`font-semibold text-sm flex items-center justify-end gap-1 ${
                          alert.level === "danger" ? "text-red-600" : "text-orange-600"
                        }`}>
                          <Clock className="w-3 h-3 shrink-0" />
                          {fmtMinutes(alert.minutesWaiting)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="text-xs text-slate-500">
                          {alert.alertReason === "timeInStatus" ? "Wartezeit" : "nach ETA"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Charts ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-white shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Statusübersicht</CardTitle>
            <CardDescription>Verteilung nach aktuellem Status</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {data.byStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byStatus} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="status" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.byStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || STATUS_COLORS.Angemeldet} />
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
            <CardTitle>Nach Spedition</CardTitle>
            <CardDescription>Top Speditionen in diesem Zeitraum</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {data.bySpedition.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.bySpedition} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis dataKey="speditionName" type="category" axisLine={false} tickLine={false} width={100} />
                  <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Bar dataKey="count" fill="hsl(222 47% 11%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-slate-400">Keine Daten für diesen Zeitraum</div>
             )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-2 bg-white shadow-sm border-slate-200 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle>Palettensalden</CardTitle>
              <CardDescription>Aktuelle Kontostände der Speditionen</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/paletten">Alle ansehen</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Spedition</TableHead>
                    <TableHead>Kürzel</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.palletBalances.length > 0 ? (
                    data.palletBalances.slice(0, 5).map((balance) => (
                      <TableRow key={balance.speditionId}>
                        <TableCell className="font-medium">{balance.speditionName}</TableCell>
                        <TableCell>{balance.kuerzel || "-"}</TableCell>
                        <TableCell className="text-right">
                          <span className={balance.balance < 0 ? "text-red-600 font-semibold" : balance.balance > 0 ? "text-green-600 font-semibold" : "text-slate-600"}>
                            {balance.balance > 0 ? "+" : ""}{balance.balance}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-slate-500">Keine Salden vorhanden</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 text-slate-50 border-slate-800 flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-slate-100">Offene Abstimmungen</CardTitle>
            <CardDescription className="text-slate-400">Palettenkonto-Abstimmungen, die Aufmerksamkeit benötigen</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center py-8">
            <div className="text-7xl font-bold text-slate-50 mb-6">
              {data.openReconciliations}
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/abstimmungen">Zu den Abstimmungen</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
