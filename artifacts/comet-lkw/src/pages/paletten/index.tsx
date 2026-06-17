import { useState } from "react";
import { useListPalletBalances, useListPalletMovements, useListSpeditionen } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Loader2, Plus, Download, BarChart2, FileDown, ClipboardList } from "lucide-react";
import * as XLSX from "xlsx";
import { MovementDialog } from "./components/movement-dialog";
import { MovementDetailSheet } from "./components/movement-detail-sheet";
import { ShipmentDrawer } from "@/pages/shipments/components/shipment-drawer";
import { useAuth } from "@/contexts/auth-context";

export default function PalettenPage() {
  const { user } = useAuth();
  const isCometUser = user?.role && ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"].includes(user.role);
  const canWrite = user?.role && ["comet_admin", "comet_leitstand", "comet_lager"].includes(user.role);

  const [filterSpeditionId, setFilterSpeditionId] = useState<string>("__all__");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [isShipmentDrawerOpen, setIsShipmentDrawerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const [plantCounts, setPlantCounts] = useState<any[]>([]);
  const [inventurOpen, setInventurOpen] = useState(false);
  const [inventurDate, setInventurDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inventurAmount, setInventurAmount] = useState("");
  const [inventurNote, setInventurNote] = useState("");
  const [inventurSaving, setInventurSaving] = useState(false);
  const [inventurError, setInventurError] = useState("");

  const loadPlantCounts = async () => {
    try {
      const res = await fetch("/api/pallet-plant-count", { credentials: "include" });
      if (res.ok) setPlantCounts(await res.json());
    } catch { /* ignore */ }
  };

  const handleSavePlantCount = async () => {
    const amt = Number(inventurAmount);
    if (!inventurDate || isNaN(amt)) { setInventurError("Datum und Menge erforderlich"); return; }
    setInventurSaving(true);
    setInventurError("");
    try {
      const res = await fetch("/api/pallet-plant-count", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordedAt: inventurDate, amount: amt, note: inventurNote || undefined }),
      });
      if (!res.ok) {
        let msg = "Fehler";
        try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      await loadPlantCounts();
      setInventurOpen(false);
      setInventurAmount("");
      setInventurNote("");
    } catch (e: any) {
      setInventurError(e.message ?? "Unbekannter Fehler");
    } finally {
      setInventurSaving(false);
    }
  };

  const plantCountTotal = plantCounts.reduce((s, p) => s + p.amount, 0);

  const getReportRows = () => {
    const cols = ["Position", "Anfangsbestand", "Zugänge (+)", "Abgänge (−)", "Korrekturen", "Endbestand", "Def. von COMET", "Def. an COMET", "Def. Gesamt"];
    const rows = reportData.map(r => [
      r.speditionName, r.anfangsbestand, r.zugaenge, r.abgaenge, r.korrekturen, r.endbestand,
      r.defekteVonComet, r.defekteAnComet, r.defekteGesamt,
    ]);
    const calcEndbestand = reportData.reduce((s, r) => s + r.endbestand, 0);
    const inventurRows = plantCounts.map(p => [`Inventur Werk (${p.recordedAt})`, "", "", "", "", p.amount, "", "", p.note || ""]);
    const totals = ["Gesamt (inkl. Inventur)",
      reportData.reduce((s, r) => s + r.anfangsbestand, 0),
      reportData.reduce((s, r) => s + r.zugaenge, 0),
      reportData.reduce((s, r) => s + r.abgaenge, 0),
      reportData.reduce((s, r) => s + r.korrekturen, 0),
      calcEndbestand + plantCountTotal,
      reportData.reduce((s, r) => s + r.defekteVonComet, 0),
      reportData.reduce((s, r) => s + r.defekteAnComet, 0),
      reportData.reduce((s, r) => s + r.defekteGesamt, 0),
    ];
    return { cols, rows: [...rows, ...inventurRows], totals };
  };

  const handleExportCsv = () => {
    const { cols, rows, totals } = getReportRows();
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols, ...rows, totals].map(row => row.map(escape).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `paletten-auswertung-${reportFrom}-${reportTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXlsx = () => {
    const { cols, rows, totals } = getReportRows();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([cols, ...rows, totals]);
    ws["!cols"] = cols.map((_, i) => ({ wch: i === 0 ? 28 : 16 }));
    XLSX.utils.book_append_sheet(wb, ws, "Auswertung");
    XLSX.writeFile(wb, `paletten-auswertung-${reportFrom}-${reportTo}.xlsx`);
  };

  const handleLoadReport = async () => {
    if (!reportFrom || !reportTo) return;
    setReportLoading(true);
    setReportError("");
    try {
      const res = await fetch(`/api/pallet-report?dateFrom=${reportFrom}&dateTo=${reportTo}`, { credentials: "include" });
      if (!res.ok) {
        let msg = "Fehler";
        try { msg = (await res.json()).error ?? msg; } catch { msg = await res.text().catch(() => msg); }
        throw new Error(msg);
      }
      const data = await res.json();
      setReportData(data);
    } catch (e: any) {
      setReportError(e.message ?? "Unbekannter Fehler");
    } finally {
      setReportLoading(false);
    }
  };

  const { data: speditionen } = useListSpeditionen();
  const { data: balances, isLoading: loadingBalances } = useListPalletBalances();
  const { data: movements, isLoading: loadingMovements } = useListPalletMovements({
    speditionId: (filterSpeditionId && filterSpeditionId !== "__all__") ? Number(filterSpeditionId) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterSpeditionId && filterSpeditionId !== "__all__") params.set("speditionId", filterSpeditionId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    window.open(`/api/pallet-export?${params.toString()}`, "_blank");
  };

  const handleRowClick = (movement: any) => {
    setSelectedMovement(movement);
    setIsDetailOpen(true);
  };

  const getMovementColor = (type: string) => {
    switch (type) {
      case "eingang": return "bg-green-100 text-green-800 hover:bg-green-100 border-transparent";
      case "ausgang": return "bg-red-100 text-red-800 hover:bg-red-100 border-transparent";
      case "korrektur": return "bg-orange-100 text-orange-800 hover:bg-orange-100 border-transparent";
      case "abstimmung": return "bg-blue-100 text-blue-800 hover:bg-blue-100 border-transparent";
      default: return "bg-slate-100 text-slate-800 border-transparent";
    }
  };

  const displayAmount = (m: any) => {
    const sign = m.movementType === "ausgang" ? "-" : m.movementType === "eingang" ? "+" : "";
    return `${sign}${m.amount}`;
  };

  const colSpan = isCometUser ? 7 : 6;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Palettenkonto</h1>
          <p className="text-sm text-slate-500">Übersicht der Euro-Paletten Salden und Buchungen.</p>
        </div>
        <div className="flex gap-2">
          {isCometUser && (
            <Button variant="outline" onClick={() => { setReportOpen(true); setReportData([]); setReportError(""); }}>
              <BarChart2 className="w-4 h-4 mr-2" />
              Auswertung
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </Button>
          {canWrite && (
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Neue Buchung
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {loadingBalances ? (
          <Card className="col-span-full border-slate-200 shadow-sm flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </Card>
        ) : balances?.map(balance => (
          <Card key={balance.speditionId} className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 truncate" title={balance.speditionName ?? ""}>
                {balance.speditionName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${(balance.balance ?? 0) < 0 ? 'text-red-600' : (balance.balance ?? 0) > 0 ? 'text-green-600' : 'text-slate-800'}`}>
                {(balance.balance ?? 0) > 0 ? "+" : ""}{balance.balance}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {balance.lastMovementDate
                  ? `Letzte Buchung: ${format(new Date(balance.lastMovementDate), "dd.MM.yyyy")}`
                  : "Keine Buchungen"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isCometUser && (
        <div className="flex flex-wrap gap-3 items-end bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Spedition</label>
            <Select value={filterSpeditionId} onValueChange={setFilterSpeditionId}>
              <SelectTrigger className="w-44 h-9 bg-white">
                <SelectValue placeholder="Alle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle</SelectItem>
                {speditionen?.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Von</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-36 bg-white" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Bis</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-36 bg-white" />
          </div>
          {(filterSpeditionId !== "__all__" || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterSpeditionId("__all__"); setDateFrom(""); setDateTo(""); }}>
              Zurücksetzen
            </Button>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Buchungen</h3>
          <span className="text-sm text-slate-500">{movements?.length ?? 0} Einträge</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              {isCometUser && <TableHead>Spedition</TableHead>}
              <TableHead>Art</TableHead>
              <TableHead>Palettenschein-Nr.</TableHead>
              <TableHead>Verladung</TableHead>
              <TableHead>Bemerkung</TableHead>
              <TableHead className="text-right">Anzahl</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingMovements ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : !movements || movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-slate-500">
                  Keine Buchungen gefunden.
                </TableCell>
              </TableRow>
            ) : (
              movements.map((movement) => (
                <TableRow
                  key={movement.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleRowClick(movement)}
                >
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {format(new Date(movement.movementDate), "dd.MM.yyyy")}
                  </TableCell>
                  {isCometUser && (
                    <TableCell className="font-medium text-slate-900">{movement.speditionName}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className={getMovementColor(movement.movementType)}>
                      {movement.movementType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-slate-700">
                    {(movement as any).palettenscheinnummer || (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {movement.shipmentId ? (
                      <button
                        className="flex items-center gap-1.5 text-left group"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedShipmentId(movement.shipmentId!);
                          setIsShipmentDrawerOpen(true);
                        }}
                      >
                        <span className="font-mono text-xs text-slate-400 bg-slate-100 rounded px-1 py-0.5 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          #{movement.shipmentId}
                        </span>
                        <span className="text-slate-600 group-hover:text-primary transition-colors truncate max-w-[120px]">
                          {movement.shipmentBezeichnung}
                        </span>
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500 truncate max-w-[180px]" title={movement.bemerkungen || ""}>
                    {movement.bemerkungen || <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${movement.movementType === "ausgang" ? 'text-red-600' : 'text-green-600'}`}>
                    {displayAmount(movement)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={reportOpen} onOpenChange={(v) => { setReportOpen(v); if (v) loadPlantCounts(); else setReportData([]); }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Paletten-Auswertung</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-500">Von</Label>
                <Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="h-9 w-36 bg-white" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-500">Bis</Label>
                <Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="h-9 w-36 bg-white" />
              </div>
              <Button onClick={handleLoadReport} disabled={!reportFrom || !reportTo || reportLoading} size="sm">
                {reportLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BarChart2 className="w-4 h-4 mr-2" />}
                Anzeigen
              </Button>
              {canWrite && (
                <Button variant="outline" size="sm" onClick={() => { setInventurError(""); setInventurOpen(true); }}>
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Inventur erfassen
                </Button>
              )}
              {reportData.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExportCsv}>
                    <FileDown className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportXlsx}>
                    <FileDown className="w-4 h-4 mr-2" />
                    XLSX
                  </Button>
                </>
              )}
            </div>

            {reportError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{reportError}</div>
            )}

            {(reportData.length > 0 || plantCounts.length > 0) && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Spedition / Position</TableHead>
                      <TableHead className="text-right">Anfangsbestand</TableHead>
                      <TableHead className="text-right text-green-700">Zugänge (+)</TableHead>
                      <TableHead className="text-right text-red-700">Abgänge (−)</TableHead>
                      <TableHead className="text-right text-orange-700">Korrekturen</TableHead>
                      <TableHead className="text-right font-bold">Endbestand</TableHead>
                      <TableHead className="text-right text-slate-500">Def. (von COMET)</TableHead>
                      <TableHead className="text-right text-slate-500">Def. (an COMET)</TableHead>
                      <TableHead className="text-right text-slate-700">Def. Gesamt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((row) => (
                      <TableRow key={row.speditionId}>
                        <TableCell className="font-medium">{row.speditionName}</TableCell>
                        <TableCell className="text-right font-mono">{row.anfangsbestand}</TableCell>
                        <TableCell className="text-right font-mono text-green-700">+{row.zugaenge}</TableCell>
                        <TableCell className="text-right font-mono text-red-700">−{row.abgaenge}</TableCell>
                        <TableCell className={`text-right font-mono ${row.korrekturen !== 0 ? "text-orange-700" : "text-slate-400"}`}>
                          {row.korrekturen > 0 ? "+" : ""}{row.korrekturen}
                        </TableCell>
                        <TableCell className={`text-right font-bold font-mono ${row.endbestand < 0 ? "text-red-600" : row.endbestand > 0 ? "text-green-700" : "text-slate-600"}`}>
                          {row.endbestand > 0 ? "+" : ""}{row.endbestand}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">{row.defekteVonComet || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-slate-500">{row.defekteAnComet || "—"}</TableCell>
                        <TableCell className={`text-right font-mono ${row.defekteGesamt > 0 ? "text-amber-700 font-semibold" : "text-slate-400"}`}>
                          {row.defekteGesamt || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {plantCounts.length > 0 && (
                      <TableRow className="bg-blue-50 border-t border-blue-200">
                        <TableCell colSpan={9} className="py-1 px-4 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                          Inventur Werk
                        </TableCell>
                      </TableRow>
                    )}
                    {plantCounts.map((pc) => (
                      <TableRow key={pc.id} className="bg-blue-50/60">
                        <TableCell className="font-medium text-blue-800">
                          <span className="flex flex-col">
                            <span>Paletten im Werk</span>
                            <span className="text-xs text-blue-500 font-normal">{pc.recordedAt}{pc.note ? ` — ${pc.note}` : ""}</span>
                          </span>
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-right font-bold font-mono text-blue-700">+{pc.amount}</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-100 font-bold border-t-2 border-slate-400">
                      <TableCell>Gesamt {plantCounts.length > 0 ? "(inkl. Inventur)" : ""}</TableCell>
                      <TableCell className="text-right font-mono">{reportData.reduce((s, r) => s + r.anfangsbestand, 0)}</TableCell>
                      <TableCell className="text-right font-mono text-green-700">+{reportData.reduce((s, r) => s + r.zugaenge, 0)}</TableCell>
                      <TableCell className="text-right font-mono text-red-700">−{reportData.reduce((s, r) => s + r.abgaenge, 0)}</TableCell>
                      <TableCell className="text-right font-mono text-orange-700">
                        {(() => { const t = reportData.reduce((s, r) => s + r.korrekturen, 0); return t > 0 ? `+${t}` : t; })()}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono text-slate-800">
                        {(() => { const t = reportData.reduce((s, r) => s + r.endbestand, 0) + plantCountTotal; return t > 0 ? `+${t}` : t; })()}
                      </TableCell>
                      <TableCell className="text-right font-mono">{reportData.reduce((s, r) => s + r.defekteVonComet, 0) || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{reportData.reduce((s, r) => s + r.defekteAnComet, 0) || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{reportData.reduce((s, r) => s + r.defekteGesamt, 0) || "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {!reportLoading && reportData.length === 0 && !reportError && reportFrom && reportTo && (
              <p className="text-center text-slate-400 py-6">Keine Daten für diesen Zeitraum.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={inventurOpen} onOpenChange={setInventurOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Inventur Werk erfassen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-500">
              Tragen Sie die tatsächliche Anzahl der Paletten im Werk ein. Der Wert wird als eigene Position im Auswertungsbericht angezeigt und zum Endbestand addiert.
            </p>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Datum der Zählung</Label>
              <Input type="date" value={inventurDate} onChange={e => setInventurDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Anzahl Paletten im Werk</Label>
              <Input
                type="number"
                min="0"
                placeholder="z.B. 150"
                value={inventurAmount}
                onChange={e => setInventurAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Bemerkung (optional)</Label>
              <Input
                placeholder="z.B. Jahresinventur 2025"
                value={inventurNote}
                onChange={e => setInventurNote(e.target.value)}
              />
            </div>
            {inventurError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{inventurError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setInventurOpen(false)} disabled={inventurSaving}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={handleSavePlantCount} disabled={inventurSaving || !inventurDate || !inventurAmount}>
                {inventurSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MovementDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      <MovementDetailSheet
        movement={selectedMovement}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
      <ShipmentDrawer
        shipmentId={selectedShipmentId}
        open={isShipmentDrawerOpen}
        onOpenChange={(open) => {
          setIsShipmentDrawerOpen(open);
          if (!open) setSelectedShipmentId(null);
        }}
      />
    </div>
  );
}
