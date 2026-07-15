import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Truck, PackageSearch } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export interface LkwArt {
  id: number;
  name: string;
  typ: "anlieferung" | "abholung";
  aktiv: boolean;
  sortOrder: number;
}

const TYP_LABELS: Record<string, { label: string; badge: string; icon: typeof Truck }> = {
  abholung:   { label: "Abholung (Auslieferung)", badge: "bg-blue-100 text-blue-700 border-blue-200", icon: Truck },
  anlieferung: { label: "Anlieferung (Retoure)", badge: "bg-green-100 text-green-700 border-green-200", icon: PackageSearch },
};

function LkwArtDialog({
  open,
  onClose,
  initial,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: LkwArt | null;
  onSave: (data: { name: string; typ: string; sortOrder: number }) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [typ, setTyp] = useState<string>(initial?.typ ?? "abholung");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), typ, sortOrder: Number(sortOrder) || 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{initial ? "LKW-Art bearbeiten" : "Neue LKW-Art"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Anlieferung (Retoure)"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Typ (Scanner-Dokument)</Label>
            <Select value={typ} onValueChange={setTyp}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abholung">Abholung → Gefahrgut-Checkliste</SelectItem>
                <SelectItem value="anlieferung">Anlieferung → Wareneingangsprotokoll</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Legt fest, welches Dokument der Scanner beim Scannen dieser LKW-Art anzeigt.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reihenfolge</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LkwArtenConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LkwArt | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: arten = [], isLoading } = useQuery<LkwArt[]>({
    queryKey: ["lkw-arten"],
    queryFn: () =>
      fetch(`${API}/lkw-arten`, { credentials: "include" }).then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; typ: string; sortOrder: number; id?: number; aktiv?: boolean }) => {
      const { id, ...body } = data;
      const res = await fetch(`${API}/lkw-arten${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lkw-arten"] });
      setDialogOpen(false);
      setEditing(null);
      toast({ title: "Gespeichert", description: "LKW-Art wurde gespeichert." });
    },
    onError: (e) => {
      toast({ title: "Fehler", description: String(e), variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, aktiv }: { id: number; aktiv: boolean }) => {
      const res = await fetch(`${API}/lkw-arten/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aktiv }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lkw-arten"] }),
    onError: (e) => toast({ title: "Fehler", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/lkw-arten/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lkw-arten"] });
      setDeletingId(null);
      toast({ title: "Gelöscht" });
    },
    onError: (e) => {
      toast({ title: "Fehler", description: String(e), variant: "destructive" });
      setDeletingId(null);
    },
  });

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: LkwArt) => { setEditing(a); setDialogOpen(true); };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              LKW-Arten
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Lege fest, welche LKW-Arten bei Verladungen auswählbar sind und welches Scanner-Dokument jeweils angezeigt wird.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew} className="shrink-0">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Neue Art
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : arten.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Noch keine LKW-Arten konfiguriert.</p>
        ) : (
          <div className="space-y-2">
            {arten.map((art) => {
              const meta = TYP_LABELS[art.typ];
              const Icon = meta?.icon ?? Truck;
              return (
                <div
                  key={art.id}
                  className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 shadow-sm"
                >
                  <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${art.aktiv ? "text-slate-800" : "text-slate-400 line-through"}`}>
                      {art.name}
                    </span>
                    <div className="mt-0.5">
                      <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${meta?.badge ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {art.typ === "abholung" ? "Gefahrgut-Checkliste" : "Wareneingangsprotokoll"}
                      </span>
                    </div>
                  </div>
                  <Switch
                    checked={art.aktiv}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: art.id, aktiv: v })}
                    className="shrink-0"
                  />
                  <button
                    onClick={() => openEdit(art)}
                    className="shrink-0 p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                    title="Bearbeiten"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (deletingId === art.id) {
                        deleteMutation.mutate(art.id);
                      } else {
                        setDeletingId(art.id);
                        setTimeout(() => setDeletingId((cur) => cur === art.id ? null : cur), 3000);
                      }
                    }}
                    className={`shrink-0 p-1.5 rounded transition-all ${
                      deletingId === art.id
                        ? "text-red-600 bg-red-50 hover:bg-red-100"
                        : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                    title={deletingId === art.id ? "Nochmal klicken zum Löschen" : "Löschen"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <LkwArtDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing}
        onSave={(data) => saveMutation.mutate(editing ? { ...data, id: editing.id } : data)}
        isSaving={saveMutation.isPending}
      />
    </Card>
  );
}
