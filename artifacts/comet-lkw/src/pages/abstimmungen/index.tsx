import { useState } from "react";
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
import { Loader2, Plus, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

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

function CreateReconciliationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: speditionen } = useListSpeditionen();
  const [speditionId, setSpeditionId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cometBalance, setCometBalance] = useState("");

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
        cometBalance: cometBalance ? parseInt(cometBalance) : undefined,
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
            <Label>COMET Saldo (optional)</Label>
            <Input type="number" value={cometBalance} onChange={e => setCometBalance(e.target.value)} placeholder="z.B. 42" />
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
  const isSpedAdmin = role === "speditions_admin";

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
    if (isSpedAdmin && spedBalance !== "") updates.speditionBalance = parseInt(spedBalance);
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
                  {isSpedAdmin && rec.speditionBalance === null || isSpedAdmin && rec.speditionBalance === undefined ? (
                    <Input
                      type="number"
                      placeholder="Saldo eingeben"
                      value={spedBalance}
                      onChange={e => setSpedBalance(e.target.value)}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-bold text-slate-800">{rec.speditionBalance ?? "—"}</div>
                      {isSpedAdmin && rec.speditionBalance !== null && rec.speditionBalance !== undefined && (
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

              {(isCometAdmin || (isSpedAdmin && (rec.speditionBalance === null || rec.speditionBalance === undefined))) && (
                <Button size="sm" onClick={handleSaveBalances} disabled={updateMutation.isPending} className="w-full">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Speichern
                </Button>
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
        {isCometAdmin && (
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

      <CreateReconciliationDialog open={createOpen} onOpenChange={setCreateOpen} />
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
