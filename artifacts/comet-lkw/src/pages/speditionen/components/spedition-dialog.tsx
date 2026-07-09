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
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus } from "lucide-react";
import { ContactsTab } from "./contacts-tab";
import { LimitsTab } from "./limits-tab";
import { RelationenTab } from "./relationen-tab";

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
    dailyShipmentLimit: "", speditionsnummer: "",
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
          speditionsnummer: (editSpedition as any).speditionsnummer || "",
        });
      } else {
        setForm({
          name: "", kuerzel: "", ansprechpartner: "", email: "", telefon: "", status: "aktiv", bemerkungen: "", palletFaktor: 1,
          preisProKm: "", mindestpreisProFahrt: "", palettenAufschlag: "",
          kraftstoffzuschlagProzent: "", fixkostenProFahrt: "", mautProKm: "",
          dailyShipmentLimit: "", speditionsnummer: "",
        });
      }
    }
  }, [open, editSpedition]);

  const { data: permissions } = useListSpeditionPermissions(editSpedition?.id || 0, {
    query: { enabled: isEditing && open, queryKey: getListSpeditionPermissionsQueryKey(editSpedition?.id || 0) },
  });

  const [newReceivingId, setNewReceivingId] = useState("__none__");

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

  const setLevelMutation = useMutation({
    mutationFn: ({ spedId, receivingId, level }: { spedId: number; receivingId: number; level: "view" | "edit" | "pending" }) =>
      customFetch(`/api/speditionen/${spedId}/permissions/${receivingId}`, {
        method: "PUT",
        body: JSON.stringify({ permissionLevel: level }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      if (editSpedition) queryClient.invalidateQueries({ queryKey: getListSpeditionPermissionsQueryKey(editSpedition.id) });
      toast({ title: "Berechtigung aktualisiert" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Fehler", variant: "destructive" }),
  });

  const handleAddPermission = () => {
    if (!editSpedition || newReceivingId === "__none__") return;
    setPermMutation.mutate({
      id: editSpedition.id,
      data: { receivingSpeditionId: parseInt(newReceivingId), permissionLevel: "pending" as any },
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const otherSpeditionen = allSpeditionen?.filter(s =>
    s.id !== editSpedition?.id && !(permissions ?? []).some(p => p.receivingSpeditionId === s.id)
  );

  const permLevelBadge = (level: string) => {
    if (level === "edit") return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Bearbeiten</Badge>;
    if (level === "view") return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Lesen</Badge>;
    return <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">Ausstehend</Badge>;
  };

  const permissionsTab = (
    <TabsContent value="rechte" className="space-y-4">
      <p className="text-sm text-slate-500">
        Definieren Sie vorab, welche Partner-Speditionen Zugang zu den Verladungen dieser Spedition erhalten dürfen.
        Die Speditionsadmins legen dann selbst fest, ob Lesen, Bearbeiten oder garnicht.
      </p>

      <div className="space-y-2">
        {!permissions || permissions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-3">Keine Speditionen freigegeben.</p>
        ) : permissions.map(p => (
          <div key={p.receivingSpeditionId} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50">
            <span className="text-sm font-medium text-slate-700">{p.receivingSpeditionName}</span>
            <div className="flex items-center gap-2">
              {permLevelBadge(p.permissionLevel)}
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
            <Label className="text-xs">Spedition zur Whitelist hinzufügen</Label>
            <Select value={newReceivingId} onValueChange={setNewReceivingId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Wählen —</SelectItem>
                {otherSpeditionen.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-9 gap-1"
            onClick={handleAddPermission}
            disabled={newReceivingId === "__none__" || setPermMutation.isPending}
          >
            {setPermMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Freigeben
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
            <DialogTitle>{editSpedition.name}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="rechte">
            <TabsList className="w-full mb-3">
              <TabsTrigger value="rechte" className="flex-1">Zugriffsrechte</TabsTrigger>
              <TabsTrigger value="relationen" className="flex-1">Relationen</TabsTrigger>
            </TabsList>
            <TabsContent value="relationen" className="space-y-3 mt-0">
              <p className="text-sm text-slate-500">
                Definieren Sie typische Relationen Ihrer Spedition. Diese werden beim Anlegen von Verladungen als Vorschläge angezeigt.
              </p>
              <RelationenTab speditionId={editSpedition.id} />
            </TabsContent>
            <TabsContent value="rechte" className="space-y-3 mt-0">
              <p className="text-sm text-slate-500">
                COMET hat folgende Partner-Speditionen für den Zugriff auf Ihre Verladungen vorgemerkt.
                Legen Sie für jeden Eintrag fest, welchen Zugang diese Spedition erhält.
              </p>
              <div className="space-y-2">
                {!permissions || permissions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    Keine Speditionen von COMET vorgemerkt.
                  </p>
                ) : permissions.map(p => {
                  const level = p.permissionLevel as string;
                  const busy = setLevelMutation.isPending;
                  return (
                    <div key={p.receivingSpeditionId} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-slate-700 truncate">{p.receivingSpeditionName}</span>
                        {permLevelBadge(level)}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant={level === "view" ? "default" : "outline"}
                          className="h-7 px-2 text-xs gap-1"
                          disabled={busy || level === "view"}
                          onClick={() => setLevelMutation.mutate({ spedId: editSpedition.id, receivingId: p.receivingSpeditionId, level: "view" })}>
                          Lesen
                        </Button>
                        <Button size="sm" variant={level === "edit" ? "default" : "outline"}
                          className="h-7 px-2 text-xs gap-1"
                          disabled={busy || level === "edit"}
                          onClick={() => setLevelMutation.mutate({ spedId: editSpedition.id, receivingId: p.receivingSpeditionId, level: "edit" })}>
                          Bearbeiten
                        </Button>
                        {level !== "pending" && (
                          <Button size="sm" variant="outline"
                            className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                            disabled={busy}
                            onClick={() => setLevelMutation.mutate({ spedId: editSpedition.id, receivingId: p.receivingSpeditionId, level: "pending" })}>
                            Garnicht
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? `${editSpedition!.name} bearbeiten` : "Neue Spedition"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stamm">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="stamm" className="flex-1">Stammdaten</TabsTrigger>
            <TabsTrigger value="tarife" className="flex-1">Tarife</TabsTrigger>
            {isEditing && <TabsTrigger value="kontakte" className="flex-1">Ansprechpartner</TabsTrigger>}
            {isEditing && <TabsTrigger value="tageslimits" className="flex-1">Tageslimits</TabsTrigger>}
            {isEditing && <TabsTrigger value="relationen" className="flex-1">Relationen</TabsTrigger>}
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
                <Label>Speditionsnummer (SAP)</Label>
                <Input value={form.speditionsnummer} onChange={e => setForm(f => ({ ...f, speditionsnummer: e.target.value }))} placeholder="70935" maxLength={10} />
              </div>
              <div className="space-y-1">
                <Label>Ansprechpartner</Label>
                <Input value={form.ansprechpartner} onChange={e => setForm(f => ({ ...f, ansprechpartner: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefon</Label>
                <Input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>E-Mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Bemerkungen</Label>
                <Input value={form.bemerkungen} onChange={e => setForm(f => ({ ...f, bemerkungen: e.target.value }))} />
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

          {isEditing && (
            <TabsContent value="tageslimits">
              <p className="text-sm text-slate-500 mb-3">
                Begrenzen Sie die Anzahl der Verladungen in einem bestimmten Zeitraum pro Tag. Mehrere Limits möglich — es gilt stets das restriktivste. Abgelaufene Limits werden automatisch gelöscht.
              </p>
              <div className="overflow-y-auto max-h-[340px] pr-1">
                <LimitsTab speditionId={editSpedition!.id} />
              </div>
            </TabsContent>
          )}

          {isEditing && (
            <TabsContent value="relationen" className="space-y-3 min-h-[200px]">
              <p className="text-sm text-slate-500">
                Definieren Sie typische Relationen dieser Spedition. Diese werden beim Anlegen von Verladungen als Vorschläge angezeigt.
              </p>
              <RelationenTab speditionId={editSpedition!.id} />
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
