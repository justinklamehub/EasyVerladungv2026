import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListSpeditionen } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageIcon, Loader2, X, Truck, Calendar } from "lucide-react";
import { format } from "date-fns";

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

export default function FotosPage() {
  const [kennzeichen, setKennzeichen] = useState("");
  const [speditionId, setSpeditionId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preview, setPreview] = useState<Foto | null>(null);

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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
