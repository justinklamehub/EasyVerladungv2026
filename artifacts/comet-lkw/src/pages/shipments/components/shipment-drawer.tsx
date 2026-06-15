import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useGetShipment,
  useCreateShipment,
  useUpdateShipment,
  useLockShipment,
  useUnlockShipment,
  useGetShipmentHistory,
  useListPalletMovements,
  useListSpeditionen,
  getGetShipmentQueryKey,
  getListShipmentsQueryKey,
  getGetShipmentHistoryQueryKey,
  useListLkwAustraege,
  useCreateLkwAustrag,
  useDeleteLkwAustrag,
  getListLkwAustraegeQueryKey,
  type LkwAustragInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Lock, LockOpen, AlertCircle, Pencil, Trash2, ClipboardCheck, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { format } from "date-fns";
import { getSocket } from "@/lib/socket";
import { onShipmentEditing, type ShipmentEditor } from "@/hooks/use-socket";

interface ShipmentDrawerProps {
  shipmentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "Verladen", "Abgefertigt", "Storniert"];
const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Sattelzug", "Wechselbrücke", "Sonstige"];
const TOR_OPTIONS = Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`);

export function ShipmentDrawer({ shipmentId, open, onOpenChange }: ShipmentDrawerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const role = user?.role ?? "";
  const isCometAdmin = ["comet_admin", "comet_leitstand"].includes(role);
  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);
  const isSpedUser = ["speditions_admin", "speditions_bearbeiter"].includes(role);
  const isViewer = role === "comet_viewer" || role === "speditions_viewer";
  const isEditing = !!shipmentId;

  const [otherEditors, setOtherEditors] = useState<ShipmentEditor[]>([]);

  const { data: shipment, isLoading } = useGetShipment(shipmentId || 0, {
    query: { enabled: !!shipmentId && open, queryKey: getGetShipmentQueryKey(shipmentId || 0) },
  });

  const { data: history } = useGetShipmentHistory(shipmentId || 0, {
    query: { enabled: !!shipmentId && open, queryKey: getGetShipmentHistoryQueryKey(shipmentId || 0) },
  });

  const { data: palletMovements } = useListPalletMovements(
    { shipmentId: shipmentId || undefined },
    { query: { enabled: !!shipmentId && open, queryKey: ["pallet-movements", shipmentId] } }
  );

  const { data: speditionen } = useListSpeditionen();
  const { data: austraege } = useListLkwAustraege(shipmentId || undefined, {
    query: { enabled: !!shipmentId && open && isCometUser, queryKey: getListLkwAustraegeQueryKey(shipmentId || undefined) },
  });

  useEffect(() => {
    if (!shipmentId || !open) {
      setOtherEditors([]);
      return;
    }
    const socket = getSocket();
    const speditionId = shipment?.speditionId ?? null;

    socket.emit("shipment.editing.start", { shipmentId, speditionId });

    const unsub = onShipmentEditing((evtShipmentId, editors) => {
      if (evtShipmentId !== shipmentId) return;
      setOtherEditors(editors.filter((e) => e.userId !== user?.id));
    });

    return () => {
      unsub();
      socket.emit("shipment.editing.stop", { shipmentId, speditionId });
      setOtherEditors([]);
    };
  }, [shipmentId, open, shipment?.speditionId, user?.id]);

  const isLocked = !!shipment?.gesperrtFuerSpedition;
  const canEdit = !isViewer && (!isLocked || isCometUser);
  const spedCanEdit = isSpedUser && !isLocked;

  const today = new Date().toISOString().slice(0, 10);
  const emptyAustrag = (): LkwAustragInput => ({
    shipmentId: shipmentId ?? undefined,
    ladelistennummer: "",
    palettenscheinnummer: "",
    datum: today,
    kennzeichen: "",
    beauftragteSpeditionId: null,
    subSpedition: "",
    vonCometEuropaletten: 0,
    vonCometLadungssicherung: 0,
    vonDefektePaletten: 0,
    anCometEuropaletten: 0,
    anCometLadungssicherung: 0,
    anDefektePaletten: 0,
  });
  const [austragForm, setAustragForm] = useState<LkwAustragInput>(emptyAustrag());
  const [showAustragForm, setShowAustragForm] = useState(false);

  const createAustragMutation = useCreateLkwAustrag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLkwAustraegeQueryKey(shipmentId || undefined) });
        if (shipmentId) queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        toast({ title: "Austrag erfasst", description: 'Sendung wurde auf "Abgefertigt" gesetzt.' });
        setShowAustragForm(false);
        setAustragForm(emptyAustrag());
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const deleteAustragMutation = useDeleteLkwAustrag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLkwAustraegeQueryKey(shipmentId || undefined) });
        toast({ title: "Austrag gelöscht" });
      },
      onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
    },
  });

  useEffect(() => {
    if (open && shipment) {
      setAustragForm(f => ({
        ...f,
        shipmentId: shipmentId ?? undefined,
        kennzeichen: shipment.kennzeichen || "",
        beauftragteSpeditionId: shipment.speditionId ?? null,
      }));
    }
  }, [open, shipment, shipmentId]);

  const [form, setForm] = useState({
    bezeichnung: "",
    kennzeichen: "",
    relation: "",
    lkwArt: "",
    etaDate: "",
    etaTime: "",
    ataDate: "",
    ataTime: "",
    tor: "",
    status: "Angemeldet",
    speditionId: "",
    bemerkungen: "",
    telefon: "",
  });

  useEffect(() => {
    if (shipment && open) {
      setForm({
        bezeichnung: shipment.bezeichnung || "",
        kennzeichen: shipment.kennzeichen || "",
        relation: shipment.relation || "",
        lkwArt: shipment.lkwArt || "",
        etaDate: shipment.etaDate || "",
        etaTime: shipment.etaTime || "",
        ataDate: shipment.ataDate || "",
        ataTime: shipment.ataTime || "",
        tor: shipment.tor || "",
        status: shipment.status || "Angemeldet",
        speditionId: shipment.speditionId ? String(shipment.speditionId) : "",
        bemerkungen: shipment.bemerkungen || "",
        telefon: shipment.telefon || "",
      });
    } else if (!shipmentId && open) {
      setForm({ bezeichnung: "", kennzeichen: "", relation: "", lkwArt: "", etaDate: "", etaTime: "", ataDate: "", ataTime: "", tor: "", status: "Angemeldet", speditionId: user?.speditionId ? String(user.speditionId) : "", bemerkungen: "", telefon: "" });
    }
  }, [shipment, open, shipmentId, user]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
    if (shipmentId) {
      queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
      queryClient.invalidateQueries({ queryKey: getGetShipmentHistoryQueryKey(shipmentId) });
    }
  };

  const updateMutation = useUpdateShipment({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Gespeichert" }); onOpenChange(false); },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler beim Speichern", variant: "destructive" }),
    }
  });

  const createMutation = useCreateShipment({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Verladung erstellt" }); onOpenChange(false); },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler beim Erstellen", variant: "destructive" }),
    }
  });

  const lockMutation = useLockShipment({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Gesperrt" }); },
      onError: () => toast({ title: "Fehler", variant: "destructive" }),
    }
  });

  const unlockMutation = useUnlockShipment({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Freigegeben" }); },
      onError: () => toast({ title: "Fehler", variant: "destructive" }),
    }
  });

  const handleSave = () => {
    const data: any = {
      bezeichnung: form.bezeichnung || undefined,
      kennzeichen: form.kennzeichen || undefined,
      relation: form.relation || undefined,
      lkwArt: form.lkwArt || undefined,
      etaDate: form.etaDate || undefined,
      etaTime: form.etaTime || undefined,
      bemerkungen: form.bemerkungen || undefined,
      telefon: form.telefon || undefined,
    };

    if (isCometUser) {
      data.ataDate = form.ataDate || undefined;
      data.ataTime = form.ataTime || undefined;
      data.tor = (form.tor && form.tor !== "__none__") ? form.tor : undefined;
      data.status = form.status;
    }

    if (isCometAdmin && !isEditing) {
      data.speditionId = form.speditionId ? parseInt(form.speditionId) : undefined;
    }

    if (isEditing && shipmentId) {
      updateMutation.mutate({ id: shipmentId, data });
    } else {
      createMutation.mutate({ data: { ...data, status: form.status || "Angemeldet" } });
    }
  };

  const isSaving = updateMutation.isPending || createMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <SheetTitle className="text-lg">
              {isEditing ? (shipment?.bezeichnung || `Verladung #${shipmentId}`) : "Neue Verladung"}
            </SheetTitle>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isLocked && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 flex items-center gap-1">
                  <Lock className="w-3 h-3" />Gesperrt
                </Badge>
              )}
              {isCometAdmin && isEditing && (
                isLocked ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => unlockMutation.mutate({ id: shipmentId! })} disabled={unlockMutation.isPending}>
                    <LockOpen className="w-3 h-3 mr-1" />Freigeben
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => lockMutation.mutate({ id: shipmentId! })} disabled={lockMutation.isPending}>
                    <Lock className="w-3 h-3 mr-1" />Sperren
                  </Button>
                )
              )}
            </div>
          </div>
          {isSpedUser && isLocked && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Diese Verladung ist durch COMET gesperrt und kann nicht bearbeitet werden.
            </div>
          )}
          {otherEditors.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mt-1">
              <Pencil className="w-4 h-4 flex-shrink-0" />
              Wird gerade bearbeitet von: {otherEditors.map((e) => e.username).join(", ")}
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="details">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
              {isEditing && <TabsTrigger value="history" className="flex-1">Verlauf</TabsTrigger>}
              {isEditing && <TabsTrigger value="paletten" className="flex-1">Paletten</TabsTrigger>}
              {isEditing && isCometUser && <TabsTrigger value="austragen" className="flex-1">Austragen</TabsTrigger>}
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              {isCometAdmin && !isEditing && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Spedition</Label>
                  <Select value={form.speditionId} onValueChange={v => setForm(f => ({ ...f, speditionId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Spedition wählen" /></SelectTrigger>
                    <SelectContent>
                      {speditionen?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Bezeichnung</Label>
                <Input value={form.bezeichnung} onChange={e => setForm(f => ({ ...f, bezeichnung: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} placeholder="z.B. MTG-001 Containerbeladung" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Kennzeichen</Label>
                  <Input value={form.kennzeichen} onChange={e => setForm(f => ({ ...f, kennzeichen: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} placeholder="M-AB 1234" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">LKW-Art</Label>
                  <Select value={form.lkwArt} onValueChange={v => setForm(f => ({ ...f, lkwArt: v }))} disabled={!canEdit || (isSpedUser && isLocked)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>{LKW_ART_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Relation</Label>
                <Input value={form.relation} onChange={e => setForm(f => ({ ...f, relation: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} placeholder="Start → Ziel" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Telefon Fahrer</Label>
                <Input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} placeholder="+49 ..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">ETA Datum</Label>
                  <Input type="date" value={form.etaDate} onChange={e => setForm(f => ({ ...f, etaDate: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">ETA Zeit</Label>
                  <Input type="time" value={form.etaTime} onChange={e => setForm(f => ({ ...f, etaTime: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} />
                </div>
              </div>

              {(isCometUser || (isEditing && (shipment?.ataDate || shipment?.ataTime))) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">ATA Datum <span className="text-slate-400">(COMET)</span></Label>
                    <Input type="date" value={form.ataDate} onChange={e => setForm(f => ({ ...f, ataDate: e.target.value }))} disabled={!isCometUser} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">ATA Zeit</Label>
                    <Input type="time" value={form.ataTime} onChange={e => setForm(f => ({ ...f, ataTime: e.target.value }))} disabled={!isCometUser} />
                  </div>
                </div>
              )}

              {isCometUser && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Tor <span className="text-slate-400">(COMET)</span></Label>
                    <Select value={form.tor} onValueChange={v => setForm(f => ({ ...f, tor: v }))} disabled={!isCometUser}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {TOR_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Status <span className="text-slate-400">(COMET)</span></Label>
                    <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))} disabled={!isCometUser}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {!isCometUser && isEditing && shipment?.status && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Status:</span>
                  <Badge variant="outline" className="font-normal">{shipment.status}</Badge>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Bemerkungen</Label>
                <Input value={form.bemerkungen} onChange={e => setForm(f => ({ ...f, bemerkungen: e.target.value }))} disabled={!canEdit || (isSpedUser && isLocked)} placeholder="Optional" />
              </div>

              {canEdit && (!isSpedUser || !isLocked) && (
                <div className="pt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Speichern
                  </Button>
                </div>
              )}
            </TabsContent>

            {isEditing && (
              <TabsContent value="history" className="space-y-2">
                {!history || history.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">Keine Änderungen aufgezeichnet.</p>
                ) : (
                  <div className="space-y-2">
                    {[...history].sort((a, b) => new Date(b.changedAt!).getTime() - new Date(a.changedAt!).getTime()).map(entry => (
                      <div key={entry.id} className="border border-slate-200 rounded-md p-3 text-sm bg-slate-50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700">{entry.field}</span>
                          <span className="text-xs text-slate-400">
                            {entry.changedAt ? format(new Date(entry.changedAt), "dd.MM.yy HH:mm") : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="text-red-600 line-through">{entry.oldValue || "—"}</span>
                          <span>→</span>
                          <span className="text-green-600">{entry.newValue || "—"}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">von {entry.username || "?"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            )}

            {isEditing && (
              <TabsContent value="paletten" className="space-y-2">
                {!palletMovements || palletMovements.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">Keine Palettenbewegungen zu dieser Verladung.</p>
                ) : (
                  <div className="space-y-2">
                    {palletMovements.map(m => (
                      <div key={m.id} className="border border-slate-200 rounded-md p-3 text-sm bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-slate-700">{m.movementType}</div>
                          <div className="text-xs text-slate-400">{format(new Date(m.movementDate), "dd.MM.yyyy")} · {m.createdByName || "?"}</div>
                          {m.bemerkungen && <div className="text-xs text-slate-500 mt-0.5">{m.bemerkungen}</div>}
                        </div>
                        <div className={`text-lg font-bold ${m.movementType === "ausgang" ? "text-red-600" : "text-green-600"}`}>
                          {m.movementType === "ausgang" ? "−" : "+"}{m.amount}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
            {isEditing && isCometUser && (
              <TabsContent value="austragen" className="space-y-4">

                {/* Existing Austraege list */}
                {austraege && austraege.length > 0 && (
                  <div className="space-y-2">
                    {austraege.map(a => (
                      <div key={a.id} className="border border-slate-200 rounded-md p-3 bg-slate-50 text-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-medium text-slate-800">{format(new Date(a.datum), "dd.MM.yyyy")}</span>
                            {a.ladelistennummer && <span className="ml-2 text-slate-500">LL: {a.ladelistennummer}</span>}
                            {a.palettenscheinnummer && <span className="ml-2 text-slate-500">PS: {a.palettenscheinnummer}</span>}
                          </div>
                          {isCometAdmin && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => deleteAustragMutation.mutate(a.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                          {a.kennzeichen && <div><span className="text-slate-400">Kennzeichen:</span> {a.kennzeichen}</div>}
                          {a.beauftragteSpeditionName && <div><span className="text-slate-400">Sped.:</span> {a.beauftragteSpeditionName}</div>}
                          {a.subSpedition && <div className="col-span-2"><span className="text-slate-400">Sub-Sped.:</span> {a.subSpedition}</div>}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-white border border-slate-200 rounded p-1.5">
                            <div className="text-slate-400 mb-0.5">Von COMET</div>
                            <div>Europal.: <b>{a.vonCometEuropaletten}</b></div>
                            <div>Lasich.: <b>{a.vonCometLadungssicherung}</b></div>
                            <div className="text-amber-600">Defekt: <b>{a.vonDefektePaletten}</b></div>
                          </div>
                          <div className="bg-white border border-slate-200 rounded p-1.5">
                            <div className="text-slate-400 mb-0.5">An COMET</div>
                            <div>Europal.: <b>{a.anCometEuropaletten}</b></div>
                            <div>Lasich.: <b>{a.anCometLadungssicherung}</b></div>
                            <div className="text-amber-600">Defekt: <b>{a.anDefektePaletten}</b></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* New Austrag form */}
                {showAustragForm ? (
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-primary" />
                      Neuer Austrag
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Ladelistennummer</Label>
                        <Input className="h-8 text-sm" value={austragForm.ladelistennummer ?? ""} onChange={e => setAustragForm(f => ({ ...f, ladelistennummer: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Palettenscheinnummer</Label>
                        <Input className="h-8 text-sm" value={austragForm.palettenscheinnummer ?? ""} onChange={e => setAustragForm(f => ({ ...f, palettenscheinnummer: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Datum</Label>
                      <Input type="date" className="h-8 text-sm" value={austragForm.datum} onChange={e => setAustragForm(f => ({ ...f, datum: e.target.value }))} />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">KFZ Kennzeichen</Label>
                      <Input className="h-8 text-sm" value={austragForm.kennzeichen ?? ""} onChange={e => setAustragForm(f => ({ ...f, kennzeichen: e.target.value }))} />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Beauftragte Spedition</Label>
                      <Select value={austragForm.beauftragteSpeditionId ? String(austragForm.beauftragteSpeditionId) : "__none__"} onValueChange={v => setAustragForm(f => ({ ...f, beauftragteSpeditionId: v === "__none__" ? null : Number(v) }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {speditionen?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Sub-Spedition</Label>
                      <Input className="h-8 text-sm" value={austragForm.subSpedition ?? ""} onChange={e => setAustragForm(f => ({ ...f, subSpedition: e.target.value }))} placeholder="Optional" />
                    </div>

                    {/* Von COMET */}
                    <div className="rounded-md border border-slate-200 p-3 bg-white space-y-2">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Von COMET</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Europaletten</Label>
                          <Input type="number" min={0} className="h-8 text-sm" value={austragForm.vonCometEuropaletten ?? 0} onChange={e => setAustragForm(f => ({ ...f, vonCometEuropaletten: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Ladungssich.</Label>
                          <Input type="number" min={0} className="h-8 text-sm" value={austragForm.vonCometLadungssicherung ?? 0} onChange={e => setAustragForm(f => ({ ...f, vonCometLadungssicherung: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 text-amber-600">davon defekt</Label>
                          <Input type="number" min={0} className="h-8 text-sm" value={austragForm.vonDefektePaletten ?? 0} onChange={e => setAustragForm(f => ({ ...f, vonDefektePaletten: Number(e.target.value) }))} />
                        </div>
                      </div>
                    </div>

                    {/* An COMET */}
                    <div className="rounded-md border border-slate-200 p-3 bg-white space-y-2">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">An COMET</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Europaletten</Label>
                          <Input type="number" min={0} className="h-8 text-sm" value={austragForm.anCometEuropaletten ?? 0} onChange={e => setAustragForm(f => ({ ...f, anCometEuropaletten: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500">Ladungssich.</Label>
                          <Input type="number" min={0} className="h-8 text-sm" value={austragForm.anCometLadungssicherung ?? 0} onChange={e => setAustragForm(f => ({ ...f, anCometLadungssicherung: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-500 text-amber-600">davon defekt</Label>
                          <Input type="number" min={0} className="h-8 text-sm" value={austragForm.anDefektePaletten ?? 0} onChange={e => setAustragForm(f => ({ ...f, anDefektePaletten: Number(e.target.value) }))} />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => { setShowAustragForm(false); setAustragForm(emptyAustrag()); }}>Abbrechen</Button>
                      <Button size="sm" onClick={() => createAustragMutation.mutate(austragForm)} disabled={createAustragMutation.isPending}>
                        {createAustragMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                        Speichern
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAustragForm(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Neuer Austrag
                  </Button>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
