import { useState } from "react";
import { useBulkCreateShipments, useListSpeditionen, getListShipmentsQueryKey, ShipmentInputLkwArt, ShipmentInputStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Sattelzug", "Wechselbrücke", "Sonstige"];
const TOR_OPTIONS = Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`);
const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen"];

interface RowData {
  id: number;
  kennzeichen: string;
  bezeichnung: string;
  lkwArt: string;
  etaDate: string;
  etaTime: string;
  tor: string;
  speditionId: string;
  relation: string;
  telefon: string;
  status: string;
}

function emptyRow(id: number): RowData {
  return {
    id,
    kennzeichen: "",
    bezeichnung: "",
    lkwArt: "",
    etaDate: "",
    etaTime: "",
    tor: "",
    speditionId: "",
    relation: "",
    telefon: "",
    status: "Angemeldet",
  };
}

let rowCounter = 1;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BulkCreateDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: speditionen } = useListSpeditionen();

  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(user?.role ?? "");
  const isSpedUser = ["speditions_admin", "speditions_bearbeiter"].includes(user?.role ?? "");

  const [rows, setRows] = useState<RowData[]>([emptyRow(rowCounter++)]);
  const [errors, setErrors] = useState<Set<number>>(new Set());

  const bulkMutation = useBulkCreateShipments({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        toast({ title: `${created.length} Verladung${created.length !== 1 ? "en" : ""} erfolgreich angelegt` });
        setRows([emptyRow(rowCounter++)]);
        setErrors(new Set());
        onOpenChange(false);
      },
      onError: (e: any) => {
        toast({ title: e?.response?.data?.error ?? "Fehler beim Anlegen", variant: "destructive" });
      },
    },
  });

  const updateRow = (id: number, field: keyof RowData, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    if (field === "kennzeichen" && value.trim()) {
      setErrors((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow(rowCounter++)]);

  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setErrors((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleSubmit = () => {
    const invalid = new Set<number>();
    for (const row of rows) {
      if (!row.kennzeichen.trim()) invalid.add(row.id);
    }
    if (invalid.size > 0) {
      setErrors(invalid);
      toast({ title: "Bitte alle Kennzeichen ausfüllen", variant: "destructive" });
      return;
    }

    const shipments = rows.map((r) => ({
      kennzeichen: r.kennzeichen.trim(),
      bezeichnung: r.bezeichnung.trim() || undefined,
      lkwArt: (r.lkwArt as ShipmentInputLkwArt) || undefined,
      etaDate: r.etaDate || undefined,
      etaTime: r.etaTime || undefined,
      tor: r.tor || undefined,
      speditionId: r.speditionId ? parseInt(r.speditionId) : (isSpedUser ? user?.speditionId : undefined),
      relation: r.relation.trim() || undefined,
      telefon: r.telefon.trim() || undefined,
      status: (r.status as ShipmentInputStatus) || "Angemeldet",
    }));

    bulkMutation.mutate({ data: { shipments } });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setRows([emptyRow(rowCounter++)]);
      setErrors(new Set());
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Massenanlage Verladungen</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 w-6">#</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[130px]">
                    Kennzeichen <span className="text-red-500">*</span>
                  </th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[160px]">Bezeichnung</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[140px]">LKW-Art</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[140px]">ETA Datum</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[110px]">ETA Zeit</th>
                  {isCometUser && <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[120px]">Tor</th>}
                  {isCometUser && <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[120px]">Status</th>}
                  {isCometUser && (
                    <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[160px]">Spedition</th>
                  )}
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[130px]">Relation</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 min-w-[120px]">Telefon</th>
                  <th className="sticky top-0 bg-slate-50 text-left px-2 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const hasError = errors.has(row.id);
                  return (
                    <tr key={row.id} className={cn("group", idx % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                      <td className="px-2 py-1.5 text-xs text-slate-400 border-b border-slate-100">{idx + 1}</td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.kennzeichen}
                          onChange={(e) => updateRow(row.id, "kennzeichen", e.target.value)}
                          placeholder="M-AB 1234"
                          className={cn("h-8 text-sm", hasError && "border-red-400 ring-1 ring-red-400")}
                        />
                        {hasError && <AlertCircle className="w-3 h-3 text-red-500 absolute mt-[-24px] ml-[-18px]" />}
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.bezeichnung}
                          onChange={(e) => updateRow(row.id, "bezeichnung", e.target.value)}
                          placeholder="Bezeichnung"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Select value={row.lkwArt} onValueChange={(v) => updateRow(row.id, "lkwArt", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Art wählen" /></SelectTrigger>
                          <SelectContent>
                            {LKW_ART_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          type="date"
                          value={row.etaDate}
                          onChange={(e) => updateRow(row.id, "etaDate", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          type="time"
                          value={row.etaTime}
                          onChange={(e) => updateRow(row.id, "etaTime", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </td>
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Select value={row.tor} onValueChange={(v) => updateRow(row.id, "tor", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tor" /></SelectTrigger>
                            <SelectContent>
                              {TOR_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Select value={row.status} onValueChange={(v) => updateRow(row.id, "status", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isCometUser && (
                        <td className="px-1 py-1.5 border-b border-slate-100">
                          <Select value={row.speditionId} onValueChange={(v) => updateRow(row.id, "speditionId", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Spedition" /></SelectTrigger>
                            <SelectContent>
                              {(speditionen ?? []).map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.relation}
                          onChange={(e) => updateRow(row.id, "relation", e.target.value)}
                          placeholder="Start → Ziel"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        <Input
                          value={row.telefon}
                          onChange={(e) => updateRow(row.id, "telefon", e.target.value)}
                          placeholder="+49 …"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-1 py-1.5 border-b border-slate-100">
                        {rows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed text-slate-500 hover:text-slate-700">
            <Plus className="w-4 h-4 mr-2" />
            Zeile hinzufügen
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <span className="text-xs text-slate-400 self-center mr-auto">{rows.length} Verladung{rows.length !== 1 ? "en" : ""}</span>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={bulkMutation.isPending}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={bulkMutation.isPending}>
            {bulkMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {rows.length} Verladung{rows.length !== 1 ? "en" : ""} anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
