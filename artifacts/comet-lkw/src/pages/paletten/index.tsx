import { useState, useEffect, useRef } from "react";
import { useListPalletBalances, useListPalletMovements, useListSpeditionen } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format, addDays } from "date-fns";
import { Loader2, Plus, Download, BarChart2, FileDown, ClipboardList, RefreshCw, Archive, FileSpreadsheet, Building2 } from "lucide-react";
import * as XLSX from "xlsx";
import { MovementDialog } from "./components/movement-dialog";
import { MovementDetailSheet } from "./components/movement-detail-sheet";
import { ShipmentDrawer } from "@/pages/shipments/components/shipment-drawer";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

export default function PalettenPage() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const [werkbestand, setWerkbestand] = useState<number | null>(null);
  const [werkbestandLoading, setWerkbestandLoading] = useState(false);

  const loadWerkbestand = async () => {
    setWerkbestandLoading(true);
    try {
      const res = await fetch("/api/pallet-werkbestand", { credentials: "include" });
      if (res.ok) { const d = await res.json(); setWerkbestand(d.werkbestand ?? 0); }
    } catch { /* ignore */ } finally { setWerkbestandLoading(false); }
  };

  const [closeAccountData, setCloseAccountData] = useState<{ speditionId: number; speditionName: string; balance: number } | null>(null);
  const [closeAccountDate, setCloseAccountDate] = useState("");
  const [closeAccountAmount, setCloseAccountAmount] = useState<number | "">(0);
  const [closeAccountNote, setCloseAccountNote] = useState("");
  const [closeAccountSaving, setCloseAccountSaving] = useState(false);
  const [closeAccountBalanceLoading, setCloseAccountBalanceLoading] = useState(false);
  const closeAccountAmountManualRef = useRef(false);

  useEffect(() => {
    if (!closeAccountData || !closeAccountDate) return;
    let cancelled = false;
    setCloseAccountBalanceLoading(true);
    closeAccountAmountManualRef.current = false;
    fetch(`/api/pallet-balance-at?speditionId=${closeAccountData.speditionId}&asOf=${closeAccountDate}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && !closeAccountAmountManualRef.current) {
          setCloseAccountAmount(d.balance ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCloseAccountBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [closeAccountDate, closeAccountData?.speditionId]);

  useEffect(() => { loadWerkbestand(); }, [balances]);

  const openCloseAccount = (speditionId: number, speditionName: string, balance: number) => {
    const today = new Date();
    setCloseAccountDate(today.toISOString().slice(0, 10));
    setCloseAccountAmount(balance);
    setCloseAccountNote("");
    setCloseAccountData({ speditionId, speditionName, balance });
  };

  const handleCloseAccount = async () => {
    if (!closeAccountData || closeAccountAmount === "") return;
    setCloseAccountSaving(true);
    try {
      const anfangsDatum = addDays(new Date(closeAccountDate), 1).toISOString().slice(0, 10);

      // Step 1: Nullstellung — Abstimmung on closingDate that cancels current balance
      if (closeAccountData.balance !== 0) {
        const r1 = await fetch("/api/pallet-movements", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speditionId: closeAccountData.speditionId,
            movementType: "abstimmung",
            movementDate: closeAccountDate,
            amount: -closeAccountData.balance,
            bemerkungen: `Jahresabschluss Nullstellung – Endbestand ${closeAccountDate}`,
          }),
        });
        if (!r1.ok) {
          const d = await r1.json();
          toast({ title: d.error ?? "Fehler bei Nullstellungs-Buchung", variant: "destructive" });
          return;
        }
      }

      // Step 2: Anfangsbestand on closingDate + 1
      const r2 = await fetch("/api/pallet-movements", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speditionId: closeAccountData.speditionId,
          movementType: "anfangsbestand",
          movementDate: anfangsDatum,
          amount: Number(closeAccountAmount),
          bemerkungen: closeAccountNote || `Jahresabschluss – Anfangsbestand ab ${anfangsDatum}`,
        }),
      });
      if (!r2.ok) {
        const d = await r2.json();
        toast({ title: d.error ?? "Fehler bei Anfangsbestand-Buchung", variant: "destructive" });
        return;
      }

      await Promise.all([refetchBalances(), refetchMovements()]);
      toast({ title: `Konto abgeschlossen. Neuer Anfangsbestand ${Number(closeAccountAmount) >= 0 ? "+" : ""}${closeAccountAmount} ab ${format(new Date(anfangsDatum), "dd.MM.yyyy")}.` });
      setCloseAccountData(null);
    } catch {
      toast({ title: "Fehler beim Abschließen", variant: "destructive" });
    } finally {
      setCloseAccountSaving(false);
    }
  };

  const [exportAccountDialog, setExportAccountDialog] = useState<{ speditionId: number; speditionName: string; balance: number; faktor: number } | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const openExportDialog = (speditionId: number, speditionName: string, balance: number, faktor: number) => {
    const today = new Date();
    setExportFrom(`${today.getFullYear()}-01-01`);
    setExportTo(today.toISOString().slice(0, 10));
    setExportAccountDialog({ speditionId, speditionName, balance, faktor });
  };

  const handleExportAccountExcel = async () => {
    if (!exportAccountDialog) return;
    setExportLoading(true);
    try {
      const params = new URLSearchParams({ speditionId: String(exportAccountDialog.speditionId) });
      if (exportFrom) params.set("dateFrom", exportFrom);
      if (exportTo) params.set("dateTo", exportTo);
      const res = await fetch(`/api/pallet-movements?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden der Buchungen");
      const movs: any[] = await res.json();
      const f = exportAccountDialog.faktor;
      const bal = exportAccountDialog.balance;
      const now = new Date();

      const typeLabel = (t: string) =>
        t === "eingang" ? "Zugang" : t === "ausgang" ? "Abgang" :
        t === "korrektur" ? "Korrektur" : t === "neutral" ? "Neutral" :
        t === "anfangsbestand" ? "Anfangsbestand" : "Abstimmung";

      const signedAmt = (m: any) => {
        if (m.movementType === "anfangsbestand" || m.movementType === "abstimmung") return m.amount ?? 0;
        const sign = m.movementType === "ausgang" ? -1 : 1;
        const amt = m.movementType === "neutral" && f > 1
          ? Math.abs(((m.anCometEuropaletten ?? 0) + (m.anCometLadungssicherung ?? 0)) * f
              - ((m.vonCometEuropaletten ?? 0) + (m.vonCometLadungssicherung ?? 0)))
          : (m.amount ?? 0);
        return sign * amt;
      };

      const periodLabel = exportFrom || exportTo
        ? `${exportFrom ? format(new Date(exportFrom), "dd.MM.yyyy") : "—"} – ${exportTo ? format(new Date(exportTo), "dd.MM.yyyy") : "—"}`
        : "Alle Buchungen";

      const balanceLabel = bal > 0 ? "Ihr Guthaben" : bal < 0 ? "Ihre Schulden" : "Ihr Saldo";
      const balanceDisplay = bal > 0 ? `+${bal} Paletten` : `${bal} Paletten`;

      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "COMET LKW-Verladungsverwaltung";
      wb.created = now;

      const ws = wb.addWorksheet(exportAccountDialog.speditionName.slice(0, 31), {
        views: [{ state: "frozen", ySplit: 7 }],
      });

      ws.columns = [
        { width: 13 }, { width: 15 }, { width: 23 }, { width: 26 },
        { width: 17 }, { width: 14 }, { width: 18 },
        { width: 14 }, { width: 13 }, { width: 17 },
        { width: 10 }, { width: 34 }, { width: 22 },
      ];

      const NAVY      = "FF1A3A5C";
      const NAVY_MID  = "FF2D5A8E";
      const INFO_BG   = "FFF0F4F8";
      const WHITE     = "FFFFFFFF";
      const ALT_ROW   = "FFF8FAFB";
      const BORDER_C  = "FFCBD5E1";
      const GREEN     = "FF166534";
      const RED       = "FF991B1B";
      const SLATE     = "FF374151";

      const thin = (c = BORDER_C) => ({
        top:    { style: "thin" as const, color: { argb: c } },
        bottom: { style: "thin" as const, color: { argb: c } },
        left:   { style: "thin" as const, color: { argb: c } },
        right:  { style: "thin" as const, color: { argb: c } },
      });

      const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

      const LAST = "M";

      ws.addRow(["COMET Palettenkonto"]);
      ws.mergeCells(`A1:${LAST}1`);
      Object.assign(ws.getCell("A1"), {
        value: "COMET Palettenkonto",
        font: { bold: true, size: 16, color: { argb: WHITE } },
        fill: solid(NAVY),
        alignment: { vertical: "middle", horizontal: "center" },
      });
      ws.getRow(1).height = 30;

      ws.addRow([exportAccountDialog.speditionName]);
      ws.mergeCells(`A2:${LAST}2`);
      Object.assign(ws.getCell("A2"), {
        value: exportAccountDialog.speditionName,
        font: { size: 12, color: { argb: WHITE } },
        fill: solid(NAVY_MID),
        alignment: { vertical: "middle", horizontal: "center" },
      });
      ws.getRow(2).height = 22;

      ws.addRow([]);
      ws.getRow(3).height = 5;

      ws.addRow(["Spedition:", exportAccountDialog.speditionName, "", "", "Zeitraum:", periodLabel]);
      ws.getRow(4).height = 18;
      for (const col of ["A", "E"] as const) {
        Object.assign(ws.getCell(`${col}4`), {
          font: { bold: true, size: 10, color: { argb: SLATE } },
          fill: solid(INFO_BG),
        });
      }
      ws.getCell("B4").font = { size: 10 };
      ws.getCell("F4").font = { size: 10 };

      ws.addRow(["Export-Datum:", format(now, "dd.MM.yyyy 'um' HH:mm 'Uhr'"), "", "", `${balanceLabel}:`, balanceDisplay]);
      ws.getRow(5).height = 18;
      for (const col of ["A", "E"] as const) {
        Object.assign(ws.getCell(`${col}5`), {
          font: { bold: true, size: 10, color: { argb: SLATE } },
          fill: solid(INFO_BG),
        });
      }
      ws.getCell("B5").font = { size: 10 };
      Object.assign(ws.getCell("F5"), {
        font: { bold: true, size: 11, color: { argb: bal > 0 ? GREEN : bal < 0 ? RED : SLATE } },
      });

      ws.addRow([]);
      ws.getRow(6).height = 5;

      const headers = [
        "Datum", "Art", "Palettenschein-Nr.", "Verladung",
        "Von COMET Euro", "Von COMET LS", "Von COMET defekt",
        "an COMET Euro", "an COMET LS", "An COMET defekt",
        "Betrag", "Bemerkung", "Erstellt von",
      ];
      ws.addRow(headers);
      ws.getRow(7).height = 22;
      ws.getRow(7).eachCell(cell => {
        cell.font = { bold: true, size: 10, color: { argb: WHITE } };
        cell.fill = solid(NAVY);
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = thin("FF0D2442");
      });

      movs.forEach((m, i) => {
        const amt = signedAmt(m);
        const row = ws.addRow([
          format(new Date(m.movementDate), "dd.MM.yyyy"),
          typeLabel(m.movementType),
          m.palettenscheinnummer || "",
          m.shipmentBezeichnung || (m.shipmentId ? `#${m.shipmentId}` : ""),
          m.vonCometEuropaletten ?? "",
          m.vonCometLadungssicherung ?? "",
          m.vonDefektePaletten ?? "",
          m.anCometEuropaletten ?? "",
          m.anCometLadungssicherung ?? "",
          m.anDefektePaletten ?? "",
          amt,
          m.bemerkungen || "",
          m.createdByName || "",
        ]);
        row.height = 16;
        const bg = i % 2 === 1 ? ALT_ROW : WHITE;
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.fill = solid(bg);
          cell.border = thin();
          cell.font = { size: 10 };
          cell.alignment = { vertical: "middle" };
          if (col === 11) {
            const v = cell.value as number;
            cell.font = { bold: true, size: 10, color: { argb: v < 0 ? RED : v > 0 ? GREEN : SLATE } };
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = '+#,##0;-#,##0;0';
          }
          if (col >= 5 && col <= 10) {
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = exportAccountDialog.speditionName.replace(/[^\w\-]/g, "-");
      a.download = `paletten-${safeName}-${exportFrom || "alle"}-bis-${exportTo || "alle"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportAccountDialog(null);
    } catch (e: any) {
      toast({ title: e.message ?? "Export fehlgeschlagen", variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };

  const [recalculating, setRecalculating] = useState(false);
  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await fetch("/api/pallet-recalculate", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Fehler bei der Neuberechnung", variant: "destructive" });
      } else {
        await Promise.all([refetchBalances(), refetchMovements()]);
        toast({ title: data.message ?? "Neuberechnung abgeschlossen" });
      }
    } catch {
      toast({ title: "Fehler bei der Neuberechnung", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const [plantCounts, setPlantCounts] = useState<any[]>([]);
  const [inventurOpen, setInventurOpen] = useState(false);
  const [inventurDate, setInventurDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inventurAmount, setInventurAmount] = useState("");
  const [inventurNote, setInventurNote] = useState("");
  const [inventurSaving, setInventurSaving] = useState(false);
  const [inventurError, setInventurError] = useState("");

  const loadPlantCounts = async (dateFrom?: string, dateTo?: string) => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/pallet-plant-count${query}`, { credentials: "include" });
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
      const [res] = await Promise.all([
        fetch(`/api/pallet-report?dateFrom=${reportFrom}&dateTo=${reportTo}`, { credentials: "include" }),
        loadPlantCounts(reportFrom, reportTo),
      ]);
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
  const { data: balances, isLoading: loadingBalances, refetch: refetchBalances } = useListPalletBalances();
  const { data: movements, isLoading: loadingMovements, refetch: refetchMovements } = useListPalletMovements({
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
    // Attach the spedition's palletFaktor so the detail sheet can compute the correct display amount
    const faktor = (balances ?? []).find((b: any) => b.speditionId === movement.speditionId)?.palletFaktor ?? 1;
    setSelectedMovement({ ...movement, palletFaktor: faktor });
    setIsDetailOpen(true);
  };

  const getMovementColor = (type: string) => {
    switch (type) {
      case "eingang": return "bg-green-100 text-green-800 hover:bg-green-100 border-transparent";
      case "ausgang": return "bg-red-100 text-red-800 hover:bg-red-100 border-transparent";
      case "korrektur": return "bg-orange-100 text-orange-800 hover:bg-orange-100 border-transparent";
      case "neutral": return "bg-blue-100 text-blue-800 hover:bg-blue-100 border-transparent";
      case "abstimmung": return "bg-slate-100 text-slate-600 hover:bg-slate-100 border-transparent";
      case "anfangsbestand": return "bg-violet-100 text-violet-800 hover:bg-violet-100 border-transparent";
      default: return "bg-slate-100 text-slate-800 border-transparent";
    }
  };

  const displayAmount = (m: any) => {
    const sign = m.movementType === "ausgang" ? "-" : m.movementType === "eingang" ? "+" : "";
    const f = (balances ?? []).find((b: any) => b.speditionId === m.speditionId)?.palletFaktor ?? 1;
    const amt = (m.movementType === "neutral" && f > 1)
      ? Math.abs(
          ((m.anCometEuropaletten ?? 0) + (m.anCometLadungssicherung ?? 0)) * f
          - ((m.vonCometEuropaletten ?? 0) + (m.vonCometLadungssicherung ?? 0))
        )
      : (m.amount ?? 0);
    return `${sign}${amt}`;
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
            <>
              <Button variant="outline" onClick={handleRecalculate} disabled={recalculating}>
                {recalculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Neu berechnen
              </Button>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Neue Buchung
              </Button>
            </>
          )}
        </div>
      </div>

      {isCometUser && (
        <Card className="border-indigo-200 shadow-sm bg-gradient-to-br from-indigo-50 to-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-indigo-600 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              Palettenbestand Werk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {werkbestandLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            ) : (
              <div className={`text-3xl font-bold ${(werkbestand ?? 0) < 0 ? "text-red-600" : (werkbestand ?? 0) > 0 ? "text-indigo-700" : "text-slate-800"}`}>
                {(werkbestand ?? 0) > 0 ? "+" : ""}{werkbestand ?? 0}
              </div>
            )}
            <p className="text-xs text-indigo-400 mt-1">Automatisch aus allen Buchungen</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {loadingBalances ? (
          <Card className="col-span-full border-slate-200 shadow-sm flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </Card>
        ) : balances?.map(balance => {
          const faktor = (balance as any).palletFaktor ?? 1;
          return (
          <Card key={balance.speditionId} className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-1">
                <CardTitle className="text-sm font-medium text-slate-500 truncate" title={balance.speditionName ?? ""}>
                  {balance.speditionName}
                </CardTitle>
                {faktor > 1 && (
                  <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                    {faktor}:1
                  </span>
                )}
              </div>
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
              <div className="mt-3 flex flex-col gap-1.5">
                <button
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-green-700 hover:bg-green-50 border border-dashed border-slate-200 hover:border-green-300 rounded-md py-1.5 transition-colors"
                  onClick={(e) => { e.stopPropagation(); openExportDialog(balance.speditionId, balance.speditionName ?? "", balance.balance ?? 0, faktor); }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel exportieren
                </button>
                {canWrite && (
                  <button
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-violet-700 hover:bg-violet-50 border border-dashed border-slate-200 hover:border-violet-300 rounded-md py-1.5 transition-colors"
                    onClick={(e) => { e.stopPropagation(); openCloseAccount(balance.speditionId, balance.speditionName ?? "", balance.balance ?? 0); }}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Konto abschließen
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
          );
        })}
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
                      {movement.movementType === "eingang" ? "Zugang" :
                       movement.movementType === "ausgang" ? "Abgang" :
                       movement.movementType === "korrektur" ? "Korrektur" :
                       movement.movementType === "neutral" ? "Neutral" :
                       movement.movementType === "anfangsbestand" ? "Anfangsbestand" : "Abstimmung"}
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

      <Dialog open={!!exportAccountDialog} onOpenChange={(v) => { if (!v) setExportAccountDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Excel exportieren — {exportAccountDialog?.speditionName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
              Saldo zum Zeitpunkt: <span className="font-bold">{(exportAccountDialog?.balance ?? 0) >= 0 ? "+" : ""}{exportAccountDialog?.balance}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Von</Label>
                <Input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportAccountDialog(null)}>Abbrechen</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleExportAccountExcel}
              disabled={exportLoading}
            >
              {exportLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exportieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closeAccountData} onOpenChange={(v) => { if (!v) setCloseAccountData(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-violet-600" />
              Konto abschließen — {closeAccountData?.speditionName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Abschlussdatum</Label>
                <Input
                  type="date"
                  value={closeAccountDate}
                  onChange={e => setCloseAccountDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Neuer Anfangsbestand
                  {closeAccountBalanceLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                </Label>
                <Input
                  type="number"
                  value={closeAccountAmount}
                  onChange={e => {
                    closeAccountAmountManualRef.current = true;
                    setCloseAccountAmount(e.target.value === "" ? "" : Number(e.target.value));
                  }}
                  placeholder="Betrag"
                />
              </div>
            </div>
            {closeAccountDate && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs text-slate-600">
                <div className="font-semibold text-slate-700 mb-1">Es werden zwei Buchungen angelegt:</div>
                {(closeAccountData?.balance ?? 0) !== 0 && (
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-slate-300 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                    <span>
                      <span className="font-medium">Endbestand</span> am {closeAccountDate && format(new Date(closeAccountDate), "dd.MM.yyyy")}:
                      {" "}<span className={(closeAccountData?.balance ?? 0) > 0 ? "text-red-600 font-bold" : "text-green-600 font-bold"}>
                        {(closeAccountData?.balance ?? 0) > 0 ? "−" : "+"}{Math.abs(closeAccountData?.balance ?? 0)}
                      </span>
                      {" "}(Nullstellung des aktuellen Saldos)
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-violet-500 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                    {(closeAccountData?.balance ?? 0) !== 0 ? "2" : "1"}
                  </span>
                  <span>
                    <span className="font-medium">Anfangsbestand</span> ab {closeAccountDate && format(addDays(new Date(closeAccountDate), 1), "dd.MM.yyyy")}:
                    {" "}<span className={Number(closeAccountAmount) >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {Number(closeAccountAmount) >= 0 ? "+" : ""}{closeAccountAmount}
                    </span>
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Bemerkung Anfangsbestand (optional)</Label>
              <Input
                value={closeAccountNote}
                onChange={e => setCloseAccountNote(e.target.value)}
                placeholder={closeAccountDate ? `Jahresabschluss – Anfangsbestand ab ${format(addDays(new Date(closeAccountDate), 1), "dd.MM.yyyy")}` : ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseAccountData(null)}>Abbrechen</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleCloseAccount}
              disabled={closeAccountSaving || closeAccountAmount === "" || !closeAccountDate}
            >
              {closeAccountSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Abschließen
            </Button>
          </DialogFooter>
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
