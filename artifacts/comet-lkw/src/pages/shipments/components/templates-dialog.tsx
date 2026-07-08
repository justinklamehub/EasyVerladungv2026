import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListSpeditionen } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Loader2, Plus, Trash2, Pencil, X, BookTemplate, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Retoure", "Sattelzug", "Wechselbrücke", "Sonstige", "Korrektur"];
const TOR_OPTIONS = [...Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`), "Tor A", "Tor B", "Tor C"];
const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen"];

export interface TemplateRow {
  id: number;
  name: string;
  kennzeichen: string | null;
  bezeichnung: string | null;
  lkw_art: string | null;
  eta_time: string | null;
  tor: string | null;
  spedition_id: number | null;
  spedition_name: string | null;
  relation: string | null;
  telefon: string | null;
  status: string;
}

interface FormState {
  name: string;
  kennzeichen: string;
  bezeichnung: string;
  lkwArt: string;
  etaTime: string;
  tor: string;
  speditionId: string;
  relation: string;
  telefon: string;
  status: string;
}

const emptyForm = (defaultSpedId?: string): FormState => ({
  name: "",
  kennzeichen: "",
  bezeichnung: "",
  lkwArt: "",
  etaTime: "",
  tor: "",
  speditionId: defaultSpedId ?? "",
  relation: "",
  telefon: "",
  status: "Angemeldet",
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLoadToMassenanlage: (template: TemplateRow) => void;
}

export function TemplatesDialog({ open, onOpenChange, onLoadToMassenanlage }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isCometAdmin = user?.role === "comet_admin";
  const isCometUser  = ["comet_admin", "comet_leitstand", "comet_lager"].includes(user?.role ?? "");
  const isSpedUser   = ["speditions_admin", "speditions_bearbeiter"].includes(user?.role ?? "");
  // Both comet users and spedition admins may create templates
  const canManage = isCometUser || user?.role === "speditions_admin";

  const ownSpedId = user?.speditionId ? String(user.speditionId) : "";

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<FormState>(emptyForm(isSpedUser ? ownSpedId : ""));

  // All active speditionen (used by comet users)
  const { data: allSpeditionen = [] } = useListSpeditionen();

  // Speditionen available to spedition users (own + granted via permissions)
  const { data: grantedSpeditionen = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["sped-granted", user?.speditionId],
    queryFn: async () => {
      const r = await fetch(`${API}/speditionen/granted`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isSpedUser && open,
  });

  // Which list to show in the dropdown
  const spedOptions: { id: number; name: string }[] = isCometUser
    ? allSpeditionen
    : isSpedUser
      ? (grantedSpeditionen.length > 0 ? grantedSpeditionen : (ownSpedId ? [{ id: Number(ownSpedId), name: user?.username ?? "Eigene" }] : []))
      : [];

  const { data: templates = [], isLoading } = useQuery<TemplateRow[]>({
    queryKey: ["shipment-templates"],
    queryFn: async () => {
      const r = await fetch(`${API}/shipments/templates`, { credentials: "include" });
      if (!r.ok) throw new Error("Fehler beim Laden");
      return r.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm(isSpedUser ? ownSpedId : ""));
    }
  }, [open]);

  const buildBody = (data: FormState) => ({
    name:        data.name,
    kennzeichen: data.kennzeichen || null,
    bezeichnung: data.bezeichnung || null,
    lkwArt:      data.lkwArt || null,
    etaTime:     data.etaTime || null,
    tor:         (isCometUser && data.tor) ? data.tor : null,
    speditionId: data.speditionId ? parseInt(data.speditionId) : null,
    relation:    data.relation || null,
    telefon:     data.telefon || null,
    status:      data.status,
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const r = await fetch(`${API}/shipments/templates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(data)),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || "Fehler"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-templates"] });
      toast({ title: "Vorlage gespeichert" });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm(isSpedUser ? ownSpedId : ""));
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: FormState }) => {
      const r = await fetch(`${API}/shipments/templates/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(data)),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || "Fehler"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-templates"] });
      toast({ title: "Vorlage aktualisiert" });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm(isSpedUser ? ownSpedId : ""));
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/shipments/templates/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Fehler beim Löschen");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-templates"] });
      toast({ title: "Vorlage gelöscht" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function startEdit(t: TemplateRow) {
    setEditingId(t.id);
    setForm({
      name:        t.name,
      kennzeichen: t.kennzeichen ?? "",
      bezeichnung: t.bezeichnung ?? "",
      lkwArt:      t.lkw_art ?? "",
      etaTime:     t.eta_time ?? "",
      tor:         t.tor ?? "",
      speditionId: t.spedition_id ? String(t.spedition_id) : "",
      relation:    t.relation ?? "",
      telefon:     t.telefon ?? "",
      status:      t.status,
    });
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Name ist erforderlich", variant: "destructive" });
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="w-4 h-4" />
            Verladungsvorlagen
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-3 pr-1">

          {/* Liste */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : templates.length === 0 && !showForm ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              <BookTemplate className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Noch keine Vorlagen gespeichert
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "border rounded-lg px-4 py-3 flex items-start gap-3 transition-colors",
                    editingId === t.id ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      {t.name}
                      {t.kennzeichen && <span className="ml-2 font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{t.kennzeichen}</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.lkw_art && <span>{t.lkw_art}</span>}
                      {t.relation && <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" />{t.relation}</span>}
                      {t.tor && <span>{t.tor}</span>}
                      {t.eta_time && <span>ETA {t.eta_time}</span>}
                      {t.spedition_name && <span className="text-blue-600">{t.spedition_name}</span>}
                      {t.bezeichnung && <span className="text-slate-400 italic">{t.bezeichnung}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => { onLoadToMassenanlage(t); onOpenChange(false); }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Verwenden
                    </Button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-slate-700"
                        onClick={() => startEdit(t)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {isCometAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={() => deleteMutation.mutate(t.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formular */}
          {showForm && (
            <div className="border border-primary/30 rounded-lg p-4 bg-primary/3 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-700">
                  {editingId !== null ? "Vorlage bearbeiten" : "Neue Vorlage"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm(isSpedUser ? ownSpedId : "")); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Name der Vorlage *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Wöchentliche Container-Lieferung"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Kennzeichen</label>
                  <Input
                    value={form.kennzeichen}
                    onChange={(e) => setForm((f) => ({ ...f, kennzeichen: e.target.value }))}
                    placeholder="M-AB 1234 (optional)"
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Bezeichnung</label>
                  <Input
                    value={form.bezeichnung}
                    onChange={(e) => setForm((f) => ({ ...f, bezeichnung: e.target.value }))}
                    placeholder="Freitext"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">LKW-Art</label>
                  <Select value={form.lkwArt || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, lkwArt: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— keine —</SelectItem>
                      {LKW_ART_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">ETA Uhrzeit</label>
                  <Input
                    type="time"
                    value={form.etaTime}
                    onChange={(e) => setForm((f) => ({ ...f, etaTime: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                {isCometUser && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Tor</label>
                    <Select value={form.tor || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, tor: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— kein —</SelectItem>
                        {TOR_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Relation</label>
                  <Input
                    value={form.relation}
                    onChange={(e) => setForm((f) => ({ ...f, relation: e.target.value }))}
                    placeholder="Start → Ziel"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Telefon</label>
                  <Input
                    value={form.telefon}
                    onChange={(e) => setForm((f) => ({ ...f, telefon: e.target.value }))}
                    placeholder="+49 …"
                    className="h-8 text-sm"
                  />
                </div>
                {/* Spedition — comet: alle, speditions_admin: eigene + freigegebene */}
                {spedOptions.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Spedition</label>
                    <Select
                      value={form.speditionId || "__none__"}
                      onValueChange={(v) => setForm((f) => ({ ...f, speditionId: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— keine —</SelectItem>
                        {spedOptions.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Standard-Status</label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm(isSpedUser ? ownSpedId : "")); }}
                  disabled={isMutating}
                >
                  Abbrechen
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={isMutating}>
                  {isMutating && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-slate-100">
          {canManage && !showForm && (
            <Button
              variant="outline"
              size="sm"
              className="mr-auto border-dashed text-slate-500 hover:text-slate-700"
              onClick={() => { setEditingId(null); setForm(emptyForm(isSpedUser ? ownSpedId : "")); setShowForm(true); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Neue Vorlage
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
