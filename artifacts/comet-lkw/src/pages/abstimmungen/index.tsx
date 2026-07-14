import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  useListReconciliations,
  useCreateReconciliation,
  useGetReconciliation,
  useUpdateReconciliation,
  useListReconciliationComments,
  useAddReconciliationComment,
  useListSpeditionen,
  getListReconciliationsQueryKey,
  getGetReconciliationQueryKey,
  getListReconciliationCommentsQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Loader2, Plus, ChevronRight, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";

const STATUS_OPTIONS = [
  { value: "offen", label: "Offen" },
  { value: "in_pruefung", label: "In Prüfung" },
  { value: "bestaetigt", label: "Bestätigt" },
  { value: "abweichung", label: "Abweichung" },
  { value: "abgeschlossen", label: "Abgeschlossen" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "offen": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none">Offen</Badge>;
    case "in_pruefung": return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-none">In Prüfung</Badge>;
    case "bestaetigt": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-none">Bestätigt</Badge>;
    case "abweichung": return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-none">Abweichung</Badge>;
    case "abgeschlossen": return <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-200 border-none">Abgeschlossen</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function CreateReconciliationDialog({
  open,
  onOpenChange,
  reconciliations,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reconciliations?: any[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: speditionen } = useListSpeditionen();
  const [speditionId, setSpeditionId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cometBalance, setCometBalance] = useState("");
  const [loadingBalance, setLoadingBalance] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const fetchBalance = useCallback(async (spedId: string, from: string, to: string) => {
    if (!spedId || !from || !to) return;
    setLoadingBalance(true);
    try {
      const res = await fetch(
        `/api/pallet-report?speditionId=${spedId}&dateFrom=${from}&dateTo=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setCometBalance(String(data[0].endbestand));
      }
    } catch {
      // ignore
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // When spedition changes: auto-fill date range and fetch balance
  useEffect(() => {
    if (!speditionId) return;
    setDateTo(today);

    const spedRecs = (reconciliations ?? [])
      .filter((r: any) => r.speditionId === Number(speditionId))
      .sort((a: any, b: any) => new Date(b.dateTo).getTime() - new Date(a.dateTo).getTime());

    const lastRec = spedRecs[0];
    let newDateFrom: string;
    if (lastRec) {
      const d = new Date(lastRec.dateTo);
      d.setDate(d.getDate() + 1);
      newDateFrom = d.toISOString().slice(0, 10);
    } else {
      // No prior reconciliation — default to start of current year
      newDateFrom = `${new Date().getFullYear()}-01-01`;
    }
    setDateFrom(newDateFrom);
    fetchBalance(speditionId, newDateFrom, today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speditionId]);

  // Re-fetch balance when dates are changed manually
  useEffect(() => {
    if (speditionId && dateFrom && dateTo) {
      fetchBalance(speditionId, dateFrom, dateTo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const createMutation = useCreateReconciliation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey() });
        toast({ title: "Abstimmung erstellt" });
        onOpenChange(false);
        setSpeditionId(""); setDateFrom(""); setDateTo(""); setCometBalance("");
      },
      onError: () => toast({ title: "Fehler beim Erstellen", variant: "destructive" }),
    },
  });

  const handleCreate = () => {
    if (!speditionId || !dateFrom || !dateTo) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        speditionId: parseInt(speditionId),
        dateFrom,
        dateTo,
        cometBalance: cometBalance !== "" ? parseInt(cometBalance) : undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Neue Abstimmung starten</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Spedition *</Label>
            <Select value={speditionId} onValueChange={setSpeditionId}>
              <SelectTrigger><SelectValue placeholder="Spedition wählen" /></SelectTrigger>
              <SelectContent>
                {speditionen?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Von *</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bis *</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-2">
              COMET Saldo
              {loadingBalance && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </Label>
            <Input
              type="number"
              value={cometBalance}
              onChange={e => setCometBalance(e.target.value)}
              placeholder={loadingBalance ? "Wird berechnet…" : "Wird automatisch befüllt"}
            />
            {dateFrom && dateTo && speditionId && (
              <p className="text-xs text-slate-400">
                Zeitraum: {dateFrom} – {dateTo}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationDetail({ id, open, onOpenChange }: { id: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "";
  const isCometAdmin = ["comet_admin", "comet_leitstand"].includes(role);
  const permissions = usePermissions();
  const canSign = !!permissions["reconciliation.sign"];

  const { data: rec, isLoading } = useGetReconciliation(id, {
    query: { enabled: open, queryKey: getGetReconciliationQueryKey(id) },
  });
  const { data: comments } = useListReconciliationComments(id, {
    query: { enabled: open, queryKey: getListReconciliationCommentsQueryKey(id) },
  });

  const [newComment, setNewComment] = useState("");
  const [spedBalance, setSpedBalance] = useState("");
  const [cometBalance, setCometBalance] = useState("");
  const [status, setStatus] = useState("");
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [forceBalance, setForceBalance] = useState("");
  const [confirmForce, setConfirmForce] = useState(false);

  const updateMutation = useUpdateReconciliation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetReconciliationQueryKey(id) });
        toast({ title: "Gespeichert" });
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/reconciliations/${id}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReconciliationQueryKey(id) });
      setConfirmAccept(false);
      const msg = data.correctionAmount === 0
        ? "Abstimmung abgeschlossen – kein Korrekturbedarf."
        : `Abstimmung abgeschlossen. Korrekturbuchung: ${data.correctionAmount > 0 ? "+" : ""}${data.correctionAmount} Paletten.`;
      toast({ title: "Daten übernommen", description: msg });
    },
    onError: (e: any) => toast({ title: e.message ?? "Fehler", variant: "destructive" }),
  });

  const forceMutation = useMutation({
    mutationFn: async (targetBalance: number) => {
      const res = await fetch(`/api/reconciliations/${id}/force-accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetBalance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReconciliationQueryKey(id) });
      setConfirmForce(false);
      setForceBalance("");
      const msg = data.correctionAmount === 0
        ? "Konto direkt abgestimmt – kein Korrekturbedarf."
        : `Konto abgestimmt. Korrekturbuchung: ${data.correctionAmount > 0 ? "+" : ""}${data.correctionAmount} Paletten.`;
      toast({ title: "Direktabschluss durchgeführt", description: msg });
    },
    onError: (e: any) => toast({ title: e.message ?? "Fehler", variant: "destructive" }),
  });

  const commentMutation = useAddReconciliationComment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReconciliationCommentsQueryKey(id) });
        setNewComment("");
        toast({ title: "Kommentar hinzugefügt" });
      },
      onError: () => toast({ title: "Fehler", variant: "destructive" }),
    },
  });

  const handleSaveBalances = () => {
    const updates: any = {};
    if (isCometAdmin && cometBalance !== "") updates.cometBalance = parseInt(cometBalance);
    if (canSign && spedBalance !== "") updates.speditionBalance = parseInt(spedBalance);
    if (isCometAdmin && status) updates.status = status;
    updateMutation.mutate({ id, data: updates });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    commentMutation.mutate({ id, data: { comment: newComment.trim() } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Abstimmung {rec ? `#${rec.id}` : ""}</SheetTitle>
          {rec && (
            <div className="text-sm text-slate-500">
              {rec.speditionName} · {format(new Date(rec.dateFrom), "dd.MM.yy")} – {format(new Date(rec.dateTo), "dd.MM.yy")}
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : rec ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Status:</span>
              {getStatusBadge(rec.status)}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Salden</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">COMET Saldo</Label>
                  {isCometAdmin ? (
                    <Input
                      type="number"
                      placeholder={rec.cometBalance !== null && rec.cometBalance !== undefined ? String(rec.cometBalance) : "—"}
                      value={cometBalance}
                      onChange={e => setCometBalance(e.target.value)}
                    />
                  ) : (
                    <div className="text-lg font-bold text-slate-800">{rec.cometBalance ?? "—"}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Spedition Saldo</Label>
                  {canSign && rec.speditionBalance === null || canSign && rec.speditionBalance === undefined ? (
                    <Input
                      type="number"
                      placeholder="Saldo eingeben"
                      value={spedBalance}
                      onChange={e => setSpedBalance(e.target.value)}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-bold text-slate-800">{rec.speditionBalance ?? "—"}</div>
                      {canSign && rec.speditionBalance !== null && rec.speditionBalance !== undefined && (
                        <span className="text-xs text-slate-400 italic">bereits eingetragen</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isCometAdmin && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Status ändern</Label>
                  <Select value={status || rec.status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(isCometAdmin || (canSign && (rec.speditionBalance === null || rec.speditionBalance === undefined))) && (
                <Button size="sm" onClick={handleSaveBalances} disabled={updateMutation.isPending} className="w-full">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Speichern
                </Button>
              )}

              {isCometAdmin && rec.cometBalance !== null && rec.cometBalance !== undefined && rec.speditionBalance !== null && rec.speditionBalance !== undefined && rec.status !== "abgeschlossen" && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium text-emerald-800">Abstimmung abschließen</div>
                  <div className="text-xs text-emerald-700">
                    COMET: <strong>{rec.cometBalance}</strong> · Spedition: <strong>{rec.speditionBalance}</strong>
                    {rec.cometBalance !== rec.speditionBalance && (
                      <span className="ml-2 text-amber-700 font-medium">(Abweichung: {rec.cometBalance - rec.speditionBalance})</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">Es wird automatisch eine Korrekturbuchung auf COMET-Saldo ({rec.cometBalance}) erstellt.</div>
                  {!confirmAccept ? (
                    <Button size="sm" variant="outline" className="w-full border-emerald-400 text-emerald-700 hover:bg-emerald-100" onClick={() => setConfirmAccept(true)}>
                      Daten übernehmen
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-700">Sicher? Diese Aktion ist nicht rückgängig zu machen.</div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="flex-1" onClick={() => setConfirmAccept(false)} disabled={acceptMutation.isPending}>
                          Abbrechen
                        </Button>
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                          {acceptMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Bestätigen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* COMET-seitiger Direktabschluss – ohne Speditions-Zustimmung */}
              {isCometAdmin && rec.status !== "abgeschlossen" && (
                <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                    Direktabschluss durch COMET
                  </div>
                  <p className="text-xs text-slate-500">
                    Setzt das Konto direkt auf den angegebenen Saldo – ohne Zustimmung der Spedition.
                    Es wird eine Korrekturbuchung erstellt; es finden keine Palettenbuchungen statt.
                  </p>
                  {!confirmForce ? (
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-slate-500">Ziel-Saldo</Label>
                        <Input
                          type="number"
                          placeholder={rec.cometBalance !== null && rec.cometBalance !== undefined ? String(rec.cometBalance) : "Saldo eingeben"}
                          value={forceBalance}
                          onChange={e => setForceBalance(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                        onClick={() => {
                          if (forceBalance === "" && rec.cometBalance !== null && rec.cometBalance !== undefined) {
                            setForceBalance(String(rec.cometBalance));
                          }
                          setConfirmForce(true);
                        }}
                        disabled={forceBalance === "" && (rec.cometBalance === null || rec.cometBalance === undefined)}
                      >
                        Direkt abschließen
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-700">
                        Saldo wird auf <strong>{forceBalance !== "" ? forceBalance : rec.cometBalance}</strong> gesetzt.
                        Diese Aktion ist nicht rückgängig zu machen.
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="flex-1" onClick={() => setConfirmForce(false)} disabled={forceMutation.isPending}>
                          Abbrechen
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => forceMutation.mutate(Number(forceBalance !== "" ? forceBalance : rec.cometBalance))}
                          disabled={forceMutation.isPending}
                        >
                          {forceMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Bestätigen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Kommentare ({comments?.length ?? 0})</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {!comments || comments.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-3">Noch keine Kommentare.</p>
                ) : comments.map(c => (
                  <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{c.username}</span>
                      <span className="text-xs text-slate-400">{c.createdAt ? format(new Date(c.createdAt), "dd.MM.yy HH:mm") : ""}</span>
                    </div>
                    <p className="text-sm text-slate-600">{c.comment}</p>
                  </div>
                ))}
              </div>
              {role !== "comet_viewer" && role !== "speditions_viewer" && (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Kommentar eingeben..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                  <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim() || commentMutation.isPending} className="self-end">
                    {commentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Senden"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function AbstimmungenPage() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const isCometAdmin = ["comet_admin", "comet_leitstand"].includes(role);
  const permissions = usePermissions();
  const canCreate = !!permissions["reconciliation.create"];

  const [filterStatus, setFilterStatus] = useState<string>("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: reconciliations, isLoading } = useListReconciliations(
    (filterStatus && filterStatus !== "__all__") ? { status: filterStatus } : undefined
  );

  const handleRowClick = (id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Abstimmungen</h1>
          <p className="text-sm text-slate-500">Regelmäßige Palettenkonto-Abgleiche mit Partnern.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Neue Abstimmung
          </Button>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Status</label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-44 bg-white">
              <SelectValue placeholder="Alle Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle</SelectItem>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {filterStatus !== "__all__" && (
          <Button variant="ghost" size="sm" className="self-end" onClick={() => setFilterStatus("__all__")}>Zurücksetzen</Button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Spedition</TableHead>
              <TableHead>Zeitraum</TableHead>
              <TableHead className="text-right">COMET Saldo</TableHead>
              <TableHead className="text-right">Spedition Saldo</TableHead>
              <TableHead>Erstellt am</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : !reconciliations || reconciliations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  Keine Abstimmungen gefunden.
                </TableCell>
              </TableRow>
            ) : (
              reconciliations.map((rec) => (
                <TableRow
                  key={rec.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => handleRowClick(rec.id)}
                >
                  <TableCell className="font-medium text-slate-900">{rec.speditionName}</TableCell>
                  <TableCell className="text-slate-600 text-sm whitespace-nowrap">
                    {format(new Date(rec.dateFrom), "dd.MM.yy")} – {format(new Date(rec.dateTo), "dd.MM.yy")}
                  </TableCell>
                  <TableCell className="text-right font-medium">{rec.cometBalance ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{rec.speditionBalance ?? "—"}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {rec.createdAt ? format(new Date(rec.createdAt), "dd.MM.yyyy") : "—"}
                  </TableCell>
                  <TableCell>{getStatusBadge(rec.status)}</TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="w-4 h-4 text-slate-400 inline-block" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateReconciliationDialog open={createOpen} onOpenChange={setCreateOpen} reconciliations={reconciliations} />
      {selectedId && (
        <ReconciliationDetail
          id={selectedId}
          open={detailOpen}
          onOpenChange={(v) => { setDetailOpen(v); if (!v) setSelectedId(null); }}
        />
      )}
    </div>
  );
}
