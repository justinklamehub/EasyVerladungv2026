import { useState, useEffect } from "react";
import {
  useCreateSpedition,
  useUpdateSpedition,
  useListSpeditionen,
  useListSpeditionPermissions,
  useSetSpeditionPermission,
  useRevokeSpeditionPermission,
  getListSpeditionenQueryKey,
  getListSpeditionPermissionsQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus } from "lucide-react";
import { ContactsTab } from "./contacts-tab";

interface Spedition {
  id: number;
  name: string;
  kuerzel?: string | null;
  ansprechpartner?: string | null;
  email?: string | null;
  telefon?: string | null;
  status?: string;
  bemerkungen?: string | null;
  palletFaktor?: number | null;
  preisProKm?: number | null;
  mindestpreisProFahrt?: number | null;
  palettenAufschlag?: number | null;
  kraftstoffzuschlagProzent?: number | null;
  fixkostenProFahrt?: number | null;
  mautProKm?: number | null;
  dailyShipmentLimit?: number | null;
}

interface SpeditionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSpedition?: Spedition | null;
  permissionsOnly?: boolean;
}

export function SpeditionDialog({ open, onOpenChange, editSpedition, permissionsOnly = false }: SpeditionDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: allSpeditionen } = useListSpeditionen();
  const isEditing = !!editSpedition;

  const [form, setForm] = useState({
    name: "", kuerzel: "", ansprechpartner: "", email: "", telefon: "", status: "aktiv", bemerkungen: "", palletFaktor: 1,
    preisProKm: "", mindestpreisProFahrt: "", palettenAufschlag: "",
    kraftstoffzuschlagProzent: "", fixkostenProFahrt: "", mautProKm: "",
    dailyShipmentLimit: "",
  });

  useEffect(() => {
    if (open) {
      if (editSpedition) {
        setForm({
          name: editSpedition.name || "",
          kuerzel: editSpedition.kuerzel || "",
          ansprechpartner: editSpedition.ansprechpartner || "",
          email: editSpedition.email || "",
          telefon: editSpedition.telefon || "",
          status: editSpedition.status || "aktiv",
          bemerkungen: editSpedition.bemerkungen || "",
          palletFaktor: editSpedition.palletFaktor ?? 1,
          preisProKm: editSpedition.preisProKm != null ? String(editSpedition.preisProKm) : "",
          mindestpreisProFahrt: editSpedition.mindestpreisProFahrt != null ? String(editSpedition.mindestpreisProFahrt) : "",
          palettenAufschlag: editSpedition.palettenAufschlag != null ? String(editSpedition.palettenAufschlag) : "",
          kraftstoffzuschlagProzent: editSpedition.kraftstoffzuschlagProzent != null ? String(editSpedition.kraftstoffzuschlagProzent) : "",
          fixkostenProFahrt: editSpedition.fixkostenProFahrt != null ? String(editSpedition.fixkostenProFahrt) : "",
          mautProKm: editSpedition.mautProKm != null ? String(editSpedition.mautProKm) : "",
          dailyShipmentLimit: editSpedition.dailyShipmentLimit != null ? String(editSpedition.dailyShipmentLimit) : "",
        });
      } else {
        setForm({
          name: "", kuerzel: "", ansprechpartner: "", email: "", telefon: "", status: "aktiv", bemerkungen: "", palletFaktor: 1,
          preisProKm: "", mindestpreisProFahrt: "", palettenAufschlag: "",
          kraftstoffzuschlagProzent: "", fixkostenProFahrt: "", mautProKm: "",
          dailyShipmentLimit: "",
        });
      }
    }
  }, [open, editSpedition]);

  const { data: permissions } = useListSpeditionPermissions(editSpedition?.id || 0, {
    query: { enabled: isEditing && open, queryKey: getListSpeditionPermissionsQueryKey(editSpedition?.id || 0) },
  });

  const [newReceivingId, setNewReceivingId] = useState("__none__");
  const [newLevel, setNewLevel] = useState("view");

  const createMutation = useCreateSpedition({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSpeditionenQueryKey() });
        toast({ title: "Spedition erstellt" });
        onOpenChange(false);
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateSpedition({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSpeditionenQueryKey() });
        toast({ title: "Spedition gespeichert" });
        onOpenChange(false);
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const setPermMutation = useSetSpeditionPermission({
    mutation: {
      onSuccess: () => {
        if (editSpedition) queryClient.invalidateQueries({ queryKey: getListSpeditionPermissionsQueryKey(editSpedition.id) });
        toast({ title: "Berechtigung gesetzt" });
        setNewReceivingId("__none__"); setNewLevel("view");
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const delPermMutation = useRevokeSpeditionPermission({
    mutation: {
      onSuccess: () => {
        if (editSpedition) queryClient.invalidateQueries({ queryKey: getListSpeditionPermissionsQueryKey(editSpedition.id) });
        toast({ title: "Berechtigung entfernt" });
      },
      onError: () => toast({ title: "Fehler beim Entfernen", variant: "destructive" }),
    },
  });

  const toNum = (v: string) => v.trim() === "" ? null : parseFloat(v.replace(",", "."));

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name erforderlich", variant: "destructive" });
      return;
    }
    const toInt = (v: string) => v.trim() === "" ? null : parseInt(v, 10);
    const payload = {
      ...form,
      preisProKm: toNum(form.preisProKm),
      mindestpreisProFahrt: toNum(form.mindestpreisProFahrt),
      palettenAufschlag: toNum(form.palettenAufschlag),
      kraftstoffzuschlagProzent: toNum(form.kraftstoffzuschlagProzent),
      fixkostenProFahrt: toNum(form.fixkostenProFahrt),
      mautProKm: toNum(form.mautProKm),
      dailyShipmentLimit: toInt(form.dailyShipmentLimit),
    };
    if (isEditing && editSpedition) {
      updateMutation.mutate({ id: editSpedition.id, data: payload as any });
    } else {
      createMutation.mutate({ data: { ...payload, status: payload.status as any } });
    }
  };

  const handleAddPermission = () => {
    if (!editSpedition || newReceivingId === "__none__") return;
    setPermMutation.mutate({
      id: editSpedition.id,
      data: { receivingSpeditionId: parseInt(newReceivingId), permissionLevel: newLevel as any },
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const otherSpeditionen = allSpeditionen?.filter(s =>
    s.id !== editSpedition?.id && !(permissions ?? []).some(p => p.receivingSpeditionId === s.id)
  );

  const permissionsTab = (
    <TabsContent value="rechte" className="space-y-4">
      <p className="text-sm text-slate-500">
        Legen Sie fest, welche anderen Speditionen die Sendungen dieser Spedition einsehen oder bearbeiten dürfen.
      </p>

      <div className="space-y-2">
        {!permissions || permissions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-3">Keine Berechtigungen vergeben.</p>
        ) : permissions.map(p => (
          <div key={p.receivingSpeditionId} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50">
            <span className="text-sm font-medium text-slate-700">{p.receivingSpeditionName}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={p.permissionLevel === "edit" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-600"}>
                {p.permissionLevel === "edit" ? "Bearbeiten" : "Ansehen"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => delPermMutation.mutate({ id: editSpedition!.id, receivingId: p.receivingSpeditionId })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {otherSpeditionen && otherSpeditionen.length > 0 && (
        <div className="flex gap-2 items-end pt-2 border-t border-slate-100">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Spedition</Label>
            <Select value={newReceivingId} onValueChange={setNewReceivingId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Wählen —</SelectItem>
                {otherSpeditionen.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36 space-y-1">
            <Label className="text-xs">Niveau</Label>
            <Select value={newLevel} onValueChange={setNewLevel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="view">Ansehen</SelectItem>
                <SelectItem value="edit">Bearbeiten</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-9"
            onClick={handleAddPermission}
            disabled={newReceivingId === "__none__" || setPermMutation.isPending}
          >
            {setPermMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </TabsContent>
  );

  if (permissionsOnly && editSpedition) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Zugriffsrechte — {editSpedition.name}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="rechte">
            <TabsContent value="rechte" className="space-y-4 mt-0">
              <p className="text-sm text-slate-500">
                Legen Sie fest, welche anderen Speditionen Ihre Verladungen anlegen oder bearbeiten dürfen.
              </p>
              <div className="space-y-2">
                {!permissions || permissions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-3">Keine Berechtigungen vergeben.</p>
                ) : permissions.map(p => (
                  <div key={p.receivingSpeditionId} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">{p.receivingSpeditionName}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={p.permissionLevel === "edit" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-600"}>
                        {p.permissionLevel === "edit" ? "Bearbeiten" : "Ansehen"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => delPermMutation.mutate({ id: editSpedition.id, receivingId: p.receivingSpeditionId })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {otherSpeditionen && otherSpeditionen.length > 0 && (
                <div className="flex gap-2 items-end pt-2 border-t border-slate-100">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Spedition</Label>
                    <Select value={newReceivingId} onValueChange={setNewReceivingId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Wählen —</SelectItem>
                        {otherSpeditionen.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-36 space-y-1">
                    <Label className="text-xs">Niveau</Label>
                    <Select value={newLevel} onValueChange={setNewLevel}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">Ansehen</SelectItem>
                        <SelectItem value="edit">Bearbeiten</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={handleAddPermission}
                    disabled={newReceivingId === "__none__" || setPermMutation.isPending}
                  >
                    {setPermMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? `${editSpedition!.name} bearbeiten` : "Neue Spedition"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stamm">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="stamm" className="flex-1">Stammdaten</TabsTrigger>
            <TabsTrigger value="tarife" className="flex-1">Tarife</TabsTrigger>
            {isEditing && <TabsTrigger value="kontakte" className="flex-1">Ansprechpartner</TabsTrigger>}
            {isEditing && <TabsTrigger value="rechte" className="flex-1">Zugriffsrechte</TabsTrigger>}
          </TabsList>

          <TabsContent value="stamm" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Kürzel</Label>
                <Input value={form.kuerzel} onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value }))} placeholder="MTG" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="inaktiv">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ansprechpartner</Label>
                <Input value={form.ansprechpartner} onChange={e => setForm(f => ({ ...f, ansprechpartner: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefon</Label>
                <Input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>E-Mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Bemerkungen</Label>
                <Input value={form.bemerkungen} onChange={e => setForm(f => ({ ...f, bemerkungen: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Tageslimit Verladungen</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="unbegrenzt"
                  value={form.dailyShipmentLimit}
                  onChange={e => setForm(f => ({ ...f, dailyShipmentLimit: e.target.value }))}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Maximale Anzahl Verladungen, die diese Spedition pro Tag anlegen darf. Leer lassen = unbegrenzt.
                </p>
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Paletten-Tauschfaktor</Label>
                <Select
                  value={String(form.palletFaktor)}
                  onValueChange={v => setForm(f => ({ ...f, palletFaktor: Number(v) }))}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 : 1 (Standard)</SelectItem>
                    <SelectItem value="2">2 : 1</SelectItem>
                    <SelectItem value="3">3 : 1</SelectItem>
                    <SelectItem value="4">4 : 1</SelectItem>
                    <SelectItem value="5">5 : 1</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  N:1 = für 1 abgegebene COMET-Palette zählt jede zurückerhaltene Speditions-Palette N-fach. Defekte Paletten werden bei aktivem Faktor nicht mitgerechnet.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tarife" className="space-y-3">
            <p className="text-xs text-slate-500">
              Diese Tarife werden für den Spediteur-Kostenvergleich auf der Kalkulations-Seite verwendet.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Preis pro km (€/km)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00"
                  value={form.preisProKm} onChange={e => setForm(f => ({ ...f, preisProKm: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mindestpreis pro Fahrt (€)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00"
                  value={form.mindestpreisProFahrt} onChange={e => setForm(f => ({ ...f, mindestpreisProFahrt: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Palettenaufschlag (€/Palette)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00"
                  value={form.palettenAufschlag} onChange={e => setForm(f => ({ ...f, palettenAufschlag: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kraftstoffzuschlag (%)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00"
                  value={form.kraftstoffzuschlagProzent} onChange={e => setForm(f => ({ ...f, kraftstoffzuschlagProzent: e.target.value }))} />
                <p className="text-xs text-slate-400">% auf den Transportpreis</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fixkosten pro Fahrt (€)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00"
                  value={form.fixkostenProFahrt} onChange={e => setForm(f => ({ ...f, fixkostenProFahrt: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Maut pro km (€/km)</Label>
                <Input type="number" min="0" step="any" placeholder="0.00"
                  value={form.mautProKm} onChange={e => setForm(f => ({ ...f, mautProKm: e.target.value }))} />
              </div>
            </div>
          </TabsContent>

          {isEditing && (
            <TabsContent value="kontakte" className="space-y-3 min-h-[200px]">
              <p className="text-sm text-slate-500">
                Hinterlegen Sie Ansprechpartner für verschiedene Bereiche (Paletten, Verladungen, Buchhaltung …).
              </p>
              <ContactsTab speditionId={editSpedition!.id} />
            </TabsContent>
          )}

          {isEditing && permissionsTab}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
