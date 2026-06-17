import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Calendar as CalendarIcon, Loader2, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DashboardPage() {
  const [dateFilter, setDateFilter] = useState("today");
  
  // Calculate date range based on filter
  let dateFrom = format(startOfDay(new Date()), "yyyy-MM-dd");
  let dateTo = format(endOfDay(new Date()), "yyyy-MM-dd");
  
  if (dateFilter === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateFrom = format(startOfDay(tomorrow), "yyyy-MM-dd");
    dateTo = format(endOfDay(tomorrow), "yyyy-MM-dd");
  } else if (dateFilter === "week") {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1); // Monday
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // Sunday
    dateFrom = format(startOfDay(start), "yyyy-MM-dd");
    dateTo = format(endOfDay(end), "yyyy-MM-dd");
  }

  const { data, isLoading } = useGetDashboard({ dateFrom, dateTo });

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
    Angemeldet: "hsl(215.4 16.3% 46.9%)", // muted
    Erwartet: "hsl(220 70% 50%)", // blue
    Angekommen: "hsl(160 60% 45%)", // green
    "in Verladung": "hsl(25 90% 55%)", // orange
    Verladen: "hsl(45 80% 50%)", // yellow
    Abgefertigt: "hsl(173 58% 39%)", // teal
    Storniert: "hsl(0 84.2% 60.2%)", // red
  };

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
