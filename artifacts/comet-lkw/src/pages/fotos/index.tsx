import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListSpeditionen } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageIcon, Loader2, X, Truck, Calendar, Link2, Trash2, Search, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type Foto = {
  id: number;
  shipmentId: number | null;
  gefahrgutChecklisteId: number | null;
  kennzeichen: string | null;
  objectPath: string;
  fileName: string | null;
  contentType: string | null;
  createdAt: string;
  shipmentBezeichnung: string | null;
  shipmentSpeditionId: number | null;
  speditionName: string | null;
};

function toImageUrl(objectPath: string) {
  return `${API_BASE}/storage/objects${objectPath.replace(/^\/objects/, "")}`;
}

type ShipmentOption = {
  id: number;
  kennzeichen: string | null;
  bezeichnung: string | null;
  relation: string | null;
  status: string;
};

function ReassignDialog({
  foto,
  onClose,
  onReassigned,
}: {
  foto: Foto;
  onClose: () => void;
  onReassigned: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState(foto.kennzeichen ?? "");
  const [selected, setSelected] = useState<ShipmentOption | null>(null);

  const { data: shipments = [], isFetching } = useQuery<ShipmentOption[]>({
    queryKey: ["shipments-foto-reassign-search", search],
    queryFn: () =>
      customFetch<ShipmentOption[]>(`/api/shipments?search=${encodeURIComponent(search)}&activeOnly=true&limit=30`),
    enabled: search.trim().length >= 1,
    staleTime: 10_000,
  });

  const reassignMutation = useMutation({
    mutationFn: () =>
      customFetch<{ success: boolean }>(`/api/fotos/${foto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: selected!.id }),
      }),
    onSuccess: () => {
      toast({ title: `Foto wurde Verladung #${selected!.id} zugeordnet` });
      onReassigned();
      onClose();
    },
    onError: (e: any) =>
      toast({ title: e?.data?.error ?? "Fehler bei der Zuordnung", variant: "destructive" }),
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-500" />
          Foto einem anderen LKW zuordnen
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-1">
        <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          Aktuell: <span className="font-medium text-slate-700">
            {foto.shipmentBezeichnung ?? (foto.shipmentId ? `#${foto.shipmentId}` : "Nicht zugeordnet")}
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            className="pl-8 text-sm"
            placeholder="Kennzeichen, Bezeichnung oder ID suchen..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
            autoFocus
          />
          {isFetching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />
          )}
        </div>

        <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
          {shipments.length === 0 && search.trim().length >= 1 && !isFetching && (
            <div className="py-8 text-center text-sm text-slate-400">Keine Verladungen gefunden</div>
          )}
          {search.trim().length < 1 && (
            <div className="py-8 text-center text-sm text-slate-400">Suchbegriff eingeben um Verladungen zu finden</div>
          )}
          {shipments.map((s) => {
            const isSelected = selected?.id === s.id;
            const label = s.bezeichnung || s.kennzeichen || `#${s.id}`;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(isSelected ? null : s)}
                className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors border-b last:border-0 ${
                  isSelected
                    ? "bg-blue-50 border-l-2 border-l-blue-500"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{label}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>#{s.id}</span>
                    {s.kennzeichen && s.bezeichnung && <span>{s.kennzeichen}</span>}
                    {s.relation && <span>{s.relation}</span>}
                    <span className="px-1 py-0.5 rounded bg-slate-100 text-slate-500">{s.status}</span>
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded p-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-slate-700">
              Zuordnen zu: <strong>#{selected.id} – {selected.bezeichnung || selected.kennzeichen}</strong>
            </span>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button
          disabled={!selected || reassignMutation.isPending}
          onClick={() => reassignMutation.mutate()}
          className="gap-1.5"
        >
          {reassignMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <Link2 className="w-3.5 h-3.5" />
          Zuordnen
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function FotosPage() {
  const [kennzeichen, setKennzeichen] = useState("");
  const [speditionId, setSpeditionId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preview, setPreview] = useState<Foto | null>(null);
  const [reassigning, setReassigning] = useState<Foto | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const canEdit = !!permissions["foto.edit"];
  const canDelete = !!permissions["foto.delete"];

  const { data: speditionen } = useListSpeditionen();

  const { data: fotos, isLoading } = useQuery<Foto[]>({
    queryKey: ["fotos", kennzeichen, speditionId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (kennzeichen.trim()) params.set("kennzeichen", kennzeichen.trim());
      if (speditionId !== "all") params.set("speditionId", speditionId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`${API_BASE}/fotos?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/fotos/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Fehler beim Löschen");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fotos"] });
      toast({ title: "Foto gelöscht" });
      setPreview(null);
    },
    onError: (e: any) => toast({ title: e.message ?? "Fehler", variant: "destructive" }),
  });

  const handleReassigned = () => {
    queryClient.invalidateQueries({ queryKey: ["fotos"] });
    setPreview(null);
  };

  const resetFilters = () => {
    setKennzeichen("");
    setSpeditionId("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasFilters = !!(kennzeichen.trim() || speditionId !== "all" || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-blue-500" />
            Fotos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Optional erfasste Fotos der beladenen LKW aus der Gefahrgut-Checkliste
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {fotos?.length ?? 0} Fotos
        </Badge>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Kennzeichen</Label>
            <Input
              placeholder="z.B. B-AB 1234"
              value={kennzeichen}
              onChange={(e) => setKennzeichen(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Spedition</Label>
            <Select value={speditionId} onValueChange={setSpeditionId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Alle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Speditionen</SelectItem>
                {speditionen?.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Von</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Bis</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
          </div>
          {hasFilters && (
            <Button variant="outline" size="sm" className="h-9" onClick={resetFilters}>
              <X className="w-3.5 h-3.5 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : !fotos || fotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <ImageIcon className="w-12 h-12 opacity-30" />
            <p className="text-sm">Keine Fotos gefunden.</p>
            <p className="text-xs text-slate-400">
              Fotos können optional beim Ausfüllen der Gefahrgut-Checkliste im Scanner aufgenommen werden.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
            {fotos.map((f) => (
              <button
                key={f.id}
                onClick={() => setPreview(f)}
                className="text-left border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden bg-slate-50 dark:bg-slate-900 hover:border-primary transition-colors group"
              >
                <div className="aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={toImageUrl(f.objectPath)}
                    alt={f.fileName ?? "Foto"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="p-2 space-y-0.5">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 truncate">
                    <Truck className="w-3 h-3 shrink-0 text-slate-400" />
                    {f.kennzeichen || "—"}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {f.shipmentBezeichnung ?? (f.shipmentId ? `#${f.shipmentId}` : "Nicht zugeordnet")}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {f.createdAt ? format(new Date(f.createdAt), "dd.MM.yyyy HH:mm") : "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-slate-500" />
                  {preview.kennzeichen || "Foto"}
                </DialogTitle>
              </DialogHeader>
              <img
                src={toImageUrl(preview.objectPath)}
                alt={preview.fileName ?? "Foto"}
                className="w-full rounded-md border border-slate-200"
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500 font-medium">Verladung</div>
                  <div className="font-medium text-slate-800">
                    {preview.shipmentBezeichnung ?? (preview.shipmentId ? `#${preview.shipmentId}` : "Nicht zugeordnet")}
                  </div>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500 font-medium">Spedition</div>
                  <div className="font-medium text-slate-800">{preview.speditionName ?? "—"}</div>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500 font-medium">Aufgenommen</div>
                  <div className="font-medium text-slate-800">
                    {preview.createdAt ? format(new Date(preview.createdAt), "dd.MM.yyyy HH:mm") : "—"}
                  </div>
                </div>
                <div className="bg-slate-50 rounded p-2">
                  <div className="text-xs text-slate-500 font-medium">Dateiname</div>
                  <div className="font-medium text-slate-800 truncate">{preview.fileName ?? "—"}</div>
                </div>
              </div>
              {(canEdit || canDelete) && (
                <DialogFooter className="gap-2 sm:gap-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setReassigning(preview)}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Anderem LKW zuordnen
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="destructive"
                      className="gap-1.5"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm("Dieses Foto wirklich löschen? Dies kann nicht rückgängig gemacht werden.")) {
                          deleteMutation.mutate(preview.id);
                        }
                      }}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Löschen
                    </Button>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reassigning} onOpenChange={(o) => !o && setReassigning(null)}>
        {reassigning && (
          <ReassignDialog
            foto={reassigning}
            onClose={() => setReassigning(null)}
            onReassigned={handleReassigned}
          />
        )}
      </Dialog>
    </div>
  );
}
