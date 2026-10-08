import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getShipmentWorkViews, putShipmentWorkViews, ApiError } from "@workspace/api-client-react";
import {
  MAX_SHIPMENT_WORK_VIEWS,
  sameWorkViewFilters,
  shipmentWorkViewsSchema,
  type ShipmentWorkView,
  type ShipmentWorkViews,
  type ShipmentWorkViewFilters,
} from "@workspace/api-zod/shipment-work-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/auth-context";
import { Bookmark, Loader2, Pencil, Save, Trash2, RefreshCw, AlertTriangle } from "lucide-react";

interface Props {
  filters: ShipmentWorkViewFilters;
  onApply: (filters: ShipmentWorkViewFilters) => void;
}

const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");

async function fetchViews(signal?: AbortSignal): Promise<ShipmentWorkViews> {
  const res = await getShipmentWorkViews({ signal });
  const parsed = shipmentWorkViewsSchema.safeParse(res?.value);
  if (!parsed.success) throw new Error("Die Antwort des Servers enthält ungültige Ansichten.");
  return parsed.data;
}

type DialogState = { mode: "create" | "rename"; name: string; error: string | null } | null;

export function WorkViewsBar({ filters, onApply }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const queryKey = ["shipment-work-views", userId ?? null] as const;

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchViews(signal),
    enabled: userId != null,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const [selectedId, setSelectedId] = useState<string>("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const writeController = useRef<AbortController | null>(null);
  useEffect(() => () => {
    writeController.current?.abort();
    qc.removeQueries({ queryKey: ["shipment-work-views", userId ?? null] });
  }, [qc, userId]);

  const data = query.data;
  const views = data?.views ?? [];
  const selected = views.find(v => v.id === selectedId);
  const dirty = !!selected && !sameWorkViewFilters(selected.filters, filters);
  const busy = saving || query.isFetching;
  const locked = !data || busy;

  async function persist(nextViews: ShipmentWorkView[]): Promise<boolean> {
    if (!data) return false;
    setSaving(true);
    const controller = new AbortController();
    writeController.current = controller;
    try {
      await qc.cancelQueries({ queryKey });
      controller.signal.throwIfAborted();
      const candidate = shipmentWorkViewsSchema.safeParse({ version: 1, revision: data.revision, views: nextViews });
      if (!candidate.success) throw new Error(candidate.error.issues[0]?.message ?? "Ungültige Arbeitsansicht");
      const res = await putShipmentWorkViews({ value: candidate.data }, { signal: controller.signal });
      const parsed = shipmentWorkViewsSchema.safeParse(res?.value);
      if (!res?.ok || !parsed.success) throw new Error("Die Antwort des Servers war ungültig. Bitte neu laden.");
      qc.setQueryData(queryKey, parsed.data);
      setActionError(null);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setActionError("Konflikt: Ihre Ansichten wurden zwischenzeitlich anderswo geändert. Die aktuelle Liste wurde geladen. Bitte prüfen und die Aktion bewusst erneut ausführen.");
        void qc.invalidateQueries({ queryKey });
      } else {
        setActionError(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : "Unbekannter Fehler"}`);
      }
      return false;
    } finally {
      writeController.current = null;
      setSaving(false);
    }
  }

  function validateName(raw: string, exceptId?: string): string | null {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return "Bitte einen Namen eingeben.";
    if (name.length > 60) return "Der Name darf höchstens 60 Zeichen lang sein.";
    if (views.some(v => v.id !== exceptId && norm(v.name) === norm(name))) return "Eine Ansicht mit diesem Namen existiert bereits.";
    return null;
  }

  async function submitDialog() {
    if (!dialog || !data) return;
    const exceptId = dialog.mode === "rename" ? selected?.id : undefined;
    const err = validateName(dialog.name, exceptId);
    if (err) return setDialog({ ...dialog, error: err });
    if (dialog.mode === "create" && views.length >= MAX_SHIPMENT_WORK_VIEWS) {
      return setDialog({ ...dialog, error: `Es sind höchstens ${MAX_SHIPMENT_WORK_VIEWS} Ansichten möglich.` });
    }
    const name = dialog.name.trim().replace(/\s+/g, " ");
    let next: ShipmentWorkView[];
    let newId = "";
    if (dialog.mode === "create") {
      newId = crypto.randomUUID();
      next = [...views, { id: newId, name, filters: structuredClone(filters) }];
    } else {
      if (!selected) return;
      next = views.map(v => (v.id === selected.id ? { ...v, name } : v));
    }
    if (await persist(next)) {
      if (newId) setSelectedId(newId);
      setDialog(null);
    } else {
      setDialog(d => (d ? { ...d, error: "Speichern fehlgeschlagen. Ihre Eingabe bleibt erhalten." } : d));
    }
  }

  async function updateSelected() {
    if (!selected) return;
    await persist(views.map(v => (v.id === selected.id ? { ...v, filters: structuredClone(filters) } : v)));
  }

  async function deleteSelected() {
    if (!selected) return;
    const id = selected.id;
    if (await persist(views.filter(v => v.id !== id))) {
      setSelectedId("");
      setConfirmDelete(false);
    }
  }

  function select(id: string) {
    setSelectedId(id);
    setActionError(null);
    const v = views.find(x => x.id === id);
    if (v) onApply(structuredClone(v.filters));
  }

  const loadError = query.isError ? (query.error instanceof Error ? query.error.message : "Unbekannter Fehler") : null;

  return (
    <div className="space-y-2" data-testid="work-views-bar">
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="w-4 h-4 text-slate-400" aria-hidden />
        <Label htmlFor="work-view-select" className="sr-only">Gespeicherte Ansicht</Label>
        <Select value={selectedId} onValueChange={select} disabled={locked || views.length === 0}>
          <SelectTrigger id="work-view-select" className="w-[220px] max-w-full" data-testid="select-work-view">
            <SelectValue placeholder={query.isLoading ? "Lade Ansichten…" : views.length ? "Meine Ansichten" : "Keine Ansichten"} />
          </SelectTrigger>
          <SelectContent>
            {views.map(v => (
              <SelectItem key={v.id} value={v.id} data-testid={`option-work-view-${v.id}`}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${dirty ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200"}`}
            role="status"
            data-testid="status-work-view-dirty"
          >
            {dirty ? "Ungespeicherte Änderungen" : "Unverändert"}
          </span>
        )}

        <Button variant="outline" size="sm" className="h-9" disabled={locked || views.length >= MAX_SHIPMENT_WORK_VIEWS}
          onClick={() => setDialog({ mode: "create", name: "", error: null })} data-testid="button-save-work-view">
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Als Ansicht speichern
        </Button>
        {selected && (
          <>
            <Button variant="outline" size="sm" className="h-9" disabled={locked || !dirty} onClick={updateSelected} data-testid="button-update-work-view">
              Ansicht aktualisieren
            </Button>
            <Button variant="ghost" size="sm" className="h-9" disabled={locked}
              onClick={() => setDialog({ mode: "rename", name: selected.name, error: null })} data-testid="button-rename-work-view">
              <Pencil className="w-4 h-4 mr-1.5" />Umbenennen
            </Button>
            <Button variant="ghost" size="sm" className="h-9 text-red-600 hover:text-red-700" disabled={locked}
              onClick={() => setConfirmDelete(true)} data-testid="button-delete-work-view">
              <Trash2 className="w-4 h-4 mr-1.5" />Löschen
            </Button>
          </>
        )}
        <span className="text-xs text-slate-500 hidden md:inline">Privat, nur für Ihr Konto sichtbar ({views.length}/{MAX_SHIPMENT_WORK_VIEWS})</span>
      </div>

      {(loadError || actionError) && (
        <div role="alert" className="flex flex-wrap items-start gap-2 text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2" data-testid="error-work-views">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1 min-w-[200px]">{loadError ? `Ansichten konnten nicht geladen werden: ${loadError}` : actionError}</span>
          <Button size="sm" variant="outline" className="h-7" disabled={query.isFetching} onClick={() => { setActionError(null); void query.refetch(); }} data-testid="button-retry-work-views">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Neu laden
          </Button>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={o => { if (!o && !saving) setDialog(null); }}>
        <DialogContent data-testid="dialog-work-view-name">
          <form onSubmit={e => { e.preventDefault(); void submitDialog(); }}>
            <DialogHeader>
              <DialogTitle>{dialog?.mode === "rename" ? "Ansicht umbenennen" : "Aktuelle Filter als Ansicht speichern"}</DialogTitle>
              <DialogDescription>Der Name muss eindeutig sein (Groß-/Kleinschreibung egal), höchstens 60 Zeichen.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Label htmlFor="work-view-name">Name</Label>
              <Input id="work-view-name" autoFocus maxLength={60} value={dialog?.name ?? ""} disabled={saving}
                aria-invalid={!!dialog?.error} aria-describedby="work-view-name-error"
                onChange={e => setDialog(d => (d ? { ...d, name: e.target.value, error: null } : d))} data-testid="input-work-view-name" />
              {dialog?.error && <p id="work-view-name-error" role="alert" className="text-sm text-red-600" data-testid="error-work-view-name">{dialog.error}</p>}
              {actionError && dialog && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setDialog(null)} data-testid="button-cancel-work-view-name">Abbrechen</Button>
              <Button type="submit" disabled={saving} data-testid="button-confirm-work-view-name">
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Speichern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={o => { if (!saving) setConfirmDelete(o); }}>
        <AlertDialogContent data-testid="dialog-delete-work-view">
          <AlertDialogHeader>
            <AlertDialogTitle>Ansicht löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Ansicht "{selected?.name}" wird endgültig aus Ihrem Konto entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} data-testid="button-cancel-delete-work-view">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" disabled={saving} onClick={() => void deleteSelected()} data-testid="button-confirm-delete-work-view">
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Endgültig löschen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
