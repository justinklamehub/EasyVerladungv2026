import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  customFetch,
  type LkwAustragInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Lock, LockOpen, AlertCircle, AlertTriangle, Pencil, Trash2, ClipboardCheck, Plus, Clock, Printer, ShieldAlert, FileDown, ImageIcon, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { printGefahrgutCheckliste } from "@/lib/print-gefahrgut";
import { printDeckblatt } from "@/lib/print-deckblatt";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import { format } from "date-fns";
import { getSocket } from "@/lib/socket";
import { onShipmentEditing, type ShipmentEditor } from "@/hooks/use-socket";
import { cn } from "@/lib/utils";

// ── SLA helpers ───────────────────────────────────────────────────────────────

const SLA_TIME_IN_STATUS: Record<string, { warnMin: number; dangerMin: number }> = {
  Angekommen:     { warnMin: 60,  dangerMin: 90  },
  "in Verladung": { warnMin: 120, dangerMin: 180 },
};

function computeSlaWarning(
  shipment: any,
): { level: "warn" | "danger"; label: string } | null {
  if (!shipment) return null;
  const now = Date.now();
  const status: string = shipment.status ?? "";
  const statusChangedAt: string | null = (shipment as any).statusChangedAt ?? null;
  const etaDate: string | null = shipment.etaDate ?? null;
  const etaTime: string | null = shipment.etaTime ?? null;

  // Time-in-status SLA
  const threshold = SLA_TIME_IN_STATUS[status];
  if (threshold && statusChangedAt) {
    const minIn = (now - new Date(statusChangedAt).getTime()) / 60_000;
    if (minIn >= threshold.dangerMin) {
      return {
        level: "danger",
        label: `SLA überschritten: ${Math.round(minIn)} Min. in Status „${status}"`,
      };
    }
    if (minIn >= threshold.warnMin) {
      return {
        level: "warn",
        label: `SLA-Warnung: ${Math.round(minIn)} Min. in Status „${status}"`,
      };
    }
  }

  // ETA-based SLA (ship not yet arrived)
  if ((status === "Angemeldet" || status === "Erwartet") && etaDate) {
    const etaStr = `${etaDate}T${etaTime ? etaTime + ":00" : "00:00:00"}`;
    const minsLate = (now - new Date(etaStr).getTime()) / 60_000;
    if (minsLate >= 60) {
      return {
        level: "danger",
        label: `${Math.round(minsLate)} Min. nach ETA – noch nicht eingetroffen`,
      };
    }
    if (minsLate >= 30) {
      return {
        level: "warn",
        label: `${Math.round(minsLate)} Min. nach ETA`,
      };
    }
  }

  return null;
}

const STATUS_DOT: Record<string, string> = {
  Angemeldet:     "bg-slate-400",
  Erwartet:       "bg-blue-400",
  Angekommen:     "bg-amber-400",
  "in Verladung": "bg-orange-500",
  Verladen:       "bg-green-500",
  Abgefertigt:    "bg-slate-500",
  Storniert:      "bg-red-400",
};

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} Min.`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

function AllChangesSection({ entries }: { entries: any[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-t border-slate-100 pt-3">
      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors mb-2"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Alle Feldänderungen ({entries.length})
      </button>
      {expanded && (
        <div className="space-y-2">
          {entries.map((entry) => (
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
    </div>
  );
}

interface ShipmentDrawerProps {
  shipmentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];
const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Retoure", "Sattelzug", "Wechselbrücke", "Sonstige", "Korrektur"];
const TOR_OPTIONS = [...Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`), "Tor A", "Tor B", "Tor C"];

export function ShipmentDrawer({ shipmentId, open, onOpenChange }: ShipmentDrawerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const role = user?.role ?? "";
  const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);
  const isSpedUser  = ["speditions_admin", "speditions_bearbeiter"].includes(role);
  const isEditing   = !!shipmentId;
  const drawerPerms = usePermissions();
  const canEditPerm        = !!drawerPerms["shipment.edit"];
  const canLockPerm        = !!drawerPerms["shipment.lock"];
  const canDeleteAustrag   = !!drawerPerms["austrag.delete"];
  const canViewFotos       = isCometUser || !!drawerPerms["foto.view"];

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

  const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

  const { data: gefahrgutChecklisten, isLoading: gefahrgutLoading } = useQuery({
    queryKey: ["gefahrgut-checklisten", shipmentId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/gefahrgut-checklisten?shipmentId=${shipmentId}`, { credentials: "include" });
      if (!res.ok) return [] as any[];
      return res.json() as Promise<any[]>;
    },
    enabled: !!shipmentId && open && isCometUser,
  });

  const { data: shipmentFotos, isLoading: fotosLoading } = useQuery({
    queryKey: ["shipment-fotos", shipmentId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/fotos?shipmentId=${shipmentId}`, { credentials: "include" });
      if (!res.ok) return [] as any[];
      return res.json() as Promise<any[]>;
    },
    enabled: !!shipmentId && open && canViewFotos,
  });

  const resetGefahrgutMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/gefahrgut-checklisten/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? "Fehler beim Zurücksetzen");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gefahrgut-checklisten", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["gefahrgut-status"] });
      toast({ title: "Checkliste zurückgesetzt" });
    },
    onError: (e: any) => toast({ title: e.message ?? "Fehler", variant: "destructive" }),
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

  const isLocked      = !!shipment?.gesperrtFuerSpedition;
  const isAusgedruckt = !!shipment && shipment.wareStatus === "ausgedruckt";
  const hasAta        = !!(shipment?.ataDate);
  const canEdit       = canEditPerm && (!isLocked || isCometUser);
  const spedCanEdit   = isSpedUser && !isLocked && !hasAta;

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
    wareStatus: "nicht bereit",
    speditionId: "",
    subSpedition: "",
    bemerkungen: "",
    telefon: "",
  });

  const [formErrors, setFormErrors] = useState<Set<string>>(new Set());

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
        wareStatus: (shipment as any).wareStatus || "",
        speditionId: shipment.speditionId ? String(shipment.speditionId) : "",
        subSpedition: (shipment as any).subSpedition || "",
        bemerkungen: shipment.bemerkungen || "",
        telefon: shipment.telefon || "",
      });
    } else if (!shipmentId && open) {
      setForm({ bezeichnung: "", kennzeichen: "", relation: "", lkwArt: "", etaDate: "", etaTime: "", ataDate: "", ataTime: "", tor: "", status: "Angemeldet", wareStatus: "nicht bereit", speditionId: user?.speditionId ? String(user.speditionId) : "", subSpedition: "", bemerkungen: "", telefon: "" });
    }
    if (open) setFormErrors(new Set());
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

  const quickUpdateMutation = useUpdateShipment({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "ATA eingetragen" }); },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
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

  const spedIdForSuggestions = parseInt(form.speditionId || "0", 10) || null;
  const { data: relationenSuggestions } = useQuery<{ id: number; name: string; kuerzel: string | null }[]>({
    queryKey: ["spedition-relationen", spedIdForSuggestions],
    queryFn: () => customFetch(`/api/speditionen/${spedIdForSuggestions}/relationen`),
    enabled: !!spedIdForSuggestions && open,
    staleTime: 60_000,
  });

  // Unknown-relation confirmation dialog state
  const [unknownRelDialog, setUnknownRelDialog] = useState<{ relation: string; spedId: number } | null>(null);
  const [unknownRelOrt, setUnknownRelOrt] = useState("");
  const [unknownRelCreating, setUnknownRelCreating] = useState(false);

  const createRelationMutation = useMutation({
    mutationFn: ({ spedId, kuerzel, ort }: { spedId: number; kuerzel: string; ort: string }) =>
      customFetch(`/api/speditionen/${spedId}/relationen`, {
        method: "POST",
        body: JSON.stringify({ kuerzel, ort }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spedition-relationen", spedIdForSuggestions] });
    },
  });

  const executeSave = () => {
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
    if (form.wareStatus) data.wareStatus = form.wareStatus;
    if (isCometUser && canEditPerm) {
      data.speditionId = form.speditionId ? parseInt(form.speditionId) : undefined;
      data.subSpedition = form.subSpedition || null;
    }
    if (isEditing && shipmentId) {
      updateMutation.mutate({ id: shipmentId, data });
    } else {
      createMutation.mutate({ data: { ...data, status: form.status || "Angemeldet" } });
    }
  };

  const handleSave = () => {
    if (!isEditing) {
      const missing = new Set<string>();
      const missingLabels: string[] = [];
      if (isCometUser && !form.speditionId) { missing.add("speditionId"); missingLabels.push("Spedition"); }
      if (!form.lkwArt) { missing.add("lkwArt"); missingLabels.push("LKW-Art"); }
      if (!form.relation.trim()) { missing.add("relation"); missingLabels.push("Relation"); }
      if (!form.etaDate) { missing.add("etaDate"); missingLabels.push("ETA Datum"); }
      if (!form.etaTime) { missing.add("etaTime"); missingLabels.push("ETA Uhrzeit"); }
      if (missing.size > 0) {
        setFormErrors(missing);
        toast({ title: "Pflichtfelder fehlen", description: `Bitte ausfüllen: ${missingLabels.join(", ")}`, variant: "destructive" });
        return;
      }
      setFormErrors(new Set());

      // Check if relation is known in Stammdaten
      const enteredRel = form.relation.trim().toLowerCase();
      const knownRelations = relationenSuggestions ?? [];
      const isKnown = knownRelations.length === 0 || knownRelations.some(
        (r) => (r.kuerzel ?? "").toLowerCase() === enteredRel || r.name.toLowerCase() === enteredRel
      );
      if (!isKnown && spedIdForSuggestions) {
        setUnknownRelOrt("");
        setUnknownRelDialog({ relation: form.relation.trim(), spedId: spedIdForSuggestions });
        return;
      }
    }

    executeSave();
  };

  const isSaving = updateMutation.isPending || createMutation.isPending;

  async function handlePrintDeckblatt() {
    if (!shipment || !shipmentId) return;
    const sped = speditionen?.find((s) => s.id === shipment.speditionId);
    await printDeckblatt({
      shipmentId: shipment.id,
      bezeichnung: shipment.bezeichnung,
      kennzeichen: shipment.kennzeichen,
      relation: shipment.relation,
      lkwArt: shipment.lkwArt,
      etaDate: shipment.etaDate,
      etaTime: (shipment as any).etaTime,
      tor: shipment.tor,
      status: shipment.status,
      bemerkungen: shipment.bemerkungen,
      speditionName: (shipment as any).speditionName ?? sped?.name ?? null,
      username: user?.username ?? user?.email ?? "—",
    });
    updateMutation.mutate({ id: shipmentId, data: { wareStatus: "ausgedruckt" } });
  }

  return (
    <>
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
              {isCometUser && isEditing && shipment && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handlePrintDeckblatt}
                  title="Deckblatt drucken"
                >
                  <Printer className="w-3 h-3 mr-1" />Deckblatt
                </Button>
              )}
              {canLockPerm && isEditing && (
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
          {isSpedUser && !isLocked && isAusgedruckt && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mt-1">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Das Deckblatt wurde bereits gedruckt. Die Verladungsdaten können nicht mehr geändert werden.
            </div>
          )}
          {otherEditors.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mt-1">
              <Pencil className="w-4 h-4 flex-shrink-0" />
              Wird gerade bearbeitet von: {otherEditors.map((e) => e.username).join(", ")}
            </div>
          )}
          {(() => {
            const sla = computeSlaWarning(shipment);
            if (!sla) return null;
            const isDanger = sla.level === "danger";
            return (
              <div className={cn(
                "flex items-center gap-2 text-sm rounded-md px-3 py-2 mt-1 border",
                isDanger
                  ? "text-red-700 bg-red-50 border-red-200"
                  : "text-amber-700 bg-amber-50 border-amber-200",
              )}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {sla.label}
              </div>
            );
          })()}
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
              {isEditing && isCometUser && (
                <TabsTrigger value="gefahrgut" className="flex-1 gap-1">
                  Gefahrgut
                  {gefahrgutChecklisten && gefahrgutChecklisten.length > 0 && (
                    <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] leading-none px-1 py-0.5 rounded-full">
                      {gefahrgutChecklisten.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {isEditing && canViewFotos && (
                <TabsTrigger value="fotos" className="flex-1 gap-1">
                  Fotos
                  {shipmentFotos && shipmentFotos.length > 0 && (
                    <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] leading-none px-1 py-0.5 rounded-full">
                      {shipmentFotos.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              {isCometUser && canEditPerm && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Spedition {!isEditing && <span className="text-red-500">*</span>}</Label>
                  <Select value={form.speditionId} onValueChange={v => { setForm(f => ({ ...f, speditionId: v })); setFormErrors(prev => { if (!prev.has("speditionId")) return prev; const next = new Set(prev); next.delete("speditionId"); return next; }); }}>
                    <SelectTrigger className={cn("h-9", formErrors.has("speditionId") && "border-red-400 ring-1 ring-red-400")}><SelectValue placeholder="Spedition wählen" /></SelectTrigger>
                    <SelectContent>
                      {speditionen?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isCometUser && canEditPerm && (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Sub-Spedition</Label>
                  <Input value={form.subSpedition} onChange={e => setForm(f => ({ ...f, subSpedition: e.target.value }))} placeholder="Optional" />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Bezeichnung</Label>
                <Input value={form.bezeichnung} onChange={e => setForm(f => ({ ...f, bezeichnung: e.target.value }))} disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))} placeholder="z.B. MTG-001 Containerbeladung" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Kennzeichen</Label>
                  <Input value={form.kennzeichen} onChange={e => setForm(f => ({ ...f, kennzeichen: e.target.value }))} disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))} placeholder="M-AB 1234" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">LKW-Art {!isEditing && <span className="text-red-500">*</span>}</Label>
                  <Select value={form.lkwArt} onValueChange={v => { setForm(f => ({ ...f, lkwArt: v })); setFormErrors(prev => { if (!prev.has("lkwArt")) return prev; const next = new Set(prev); next.delete("lkwArt"); return next; }); }} disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))}>
                    <SelectTrigger className={cn("h-9", formErrors.has("lkwArt") && "border-red-400 ring-1 ring-red-400")}><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>{LKW_ART_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Relation {!isEditing && <span className="text-red-500">*</span>}</Label>
                <Input
                  value={form.relation}
                  onChange={e => { setForm(f => ({ ...f, relation: e.target.value })); if (e.target.value.trim()) setFormErrors(prev => { if (!prev.has("relation")) return prev; const next = new Set(prev); next.delete("relation"); return next; }); }}
                  disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))}
                  placeholder="Start → Ziel"
                  className={cn(formErrors.has("relation") && "border-red-400 ring-1 ring-red-400")}
                  list="relation-datalist"
                />
                {relationenSuggestions && relationenSuggestions.length > 0 && (
                  <datalist id="relation-datalist">
                    {relationenSuggestions.map(r => <option key={r.id} value={r.kuerzel ?? r.name} />)}
                  </datalist>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Telefon Fahrer</Label>
                <Input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))} placeholder="+49 ..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">ETA Datum {!isEditing && <span className="text-red-500">*</span>}</Label>
                  <Input
                    type="date"
                    value={form.etaDate}
                    onChange={e => { setForm(f => ({ ...f, etaDate: e.target.value })); if (e.target.value) setFormErrors(prev => { if (!prev.has("etaDate")) return prev; const next = new Set(prev); next.delete("etaDate"); return next; }); }}
                    disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))}
                    className={cn(formErrors.has("etaDate") && "border-red-400 ring-1 ring-red-400")}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">ETA Zeit {!isEditing && <span className="text-red-500">*</span>}</Label>
                  <Input
                    type="time"
                    value={form.etaTime}
                    onChange={e => { setForm(f => ({ ...f, etaTime: e.target.value })); if (e.target.value) setFormErrors(prev => { if (!prev.has("etaTime")) return prev; const next = new Set(prev); next.delete("etaTime"); return next; }); }}
                    disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))}
                    className={cn(formErrors.has("etaTime") && "border-red-400 ring-1 ring-red-400")}
                  />
                </div>
              </div>

              {(isCometUser || (isEditing && (shipment?.ataDate || shipment?.ataTime))) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-500">ATA <span className="text-slate-400">(COMET)</span></Label>
                    {isCometUser && isEditing && shipmentId && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={quickUpdateMutation.isPending}
                          onClick={() => {
                            const now = new Date();
                            const date = now.toISOString().slice(0, 10);
                            const time = now.toTimeString().slice(0, 5);
                            const shouldSetAngekommen = ["Angemeldet", "Erwartet"].includes(form.status);
                            setForm(f => ({ ...f, ataDate: date, ataTime: time, ...(shouldSetAngekommen ? { status: "Angekommen" } : {}) }));
                            quickUpdateMutation.mutate({ id: shipmentId, data: { ataDate: date, ataTime: time, ...(shouldSetAngekommen ? { status: "Angekommen" } : {}) } });
                          }}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
                        >
                          {quickUpdateMutation.isPending
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Clock className="w-3 h-3" />}
                          Jetzt eintragen
                        </button>
                        {(form.ataDate || form.ataTime) && (
                          <button
                            type="button"
                            disabled={quickUpdateMutation.isPending}
                            onClick={() => {
                              setForm(f => ({ ...f, ataDate: "", ataTime: "" }));
                              quickUpdateMutation.mutate({ id: shipmentId, data: { ataDate: null, ataTime: null } });
                            }}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" />
                            Löschen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="date" value={form.ataDate} onChange={e => setForm(f => ({ ...f, ataDate: e.target.value }))} disabled={!isCometUser} />
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
                <Label className="text-xs text-slate-500">Ware Status</Label>
                <Select
                  value={form.wareStatus || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, wareStatus: v === "__none__" ? "" : v }))}
                  disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="nicht bereit">Nicht bereit</SelectItem>
                    <SelectItem value="ausgedruckt">Ausgedruckt</SelectItem>
                    <SelectItem value="in bearbeitung">In Bearbeitung</SelectItem>
                    <SelectItem value="vorbereitet">Vorbereitet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Bemerkungen</Label>
                <Input value={form.bemerkungen} onChange={e => setForm(f => ({ ...f, bemerkungen: e.target.value }))} disabled={!canEdit || (isSpedUser && (isLocked || isAusgedruckt))} placeholder="Optional" />
              </div>

              {canEdit && (!isSpedUser || (!isLocked && !isAusgedruckt)) && (
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
              <TabsContent value="history" className="space-y-4">
                {/* ── Status-Timeline ── */}
                {(() => {
                  const statusEntries = [...(history ?? [])]
                    .filter((e) => e.field === "status")
                    .sort((a, b) => new Date(a.changedAt!).getTime() - new Date(b.changedAt!).getTime());

                  if (statusEntries.length === 0) {
                    return (
                      <p className="text-sm text-slate-400 text-center py-3">
                        Noch kein Statusverlauf aufgezeichnet.
                      </p>
                    );
                  }

                  return (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                        Statusverlauf
                      </p>
                      <div className="relative pl-6">
                        {/* vertical connector line */}
                        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />

                        {statusEntries.map((entry, i) => {
                          const next = statusEntries[i + 1];
                          const isLast = i === statusEntries.length - 1;
                          const durationMin = next
                            ? (new Date(next.changedAt!).getTime() - new Date(entry.changedAt!).getTime()) / 60_000
                            : shipment
                            ? (Date.now() - new Date(entry.changedAt!).getTime()) / 60_000
                            : null;

                          const dotColor = STATUS_DOT[entry.newValue ?? ""] ?? "bg-slate-300";

                          return (
                            <div key={entry.id} className="relative mb-4 last:mb-0">
                              {/* dot */}
                              <div className={cn(
                                "absolute left-[-20px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm",
                                dotColor,
                              )} />

                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-semibold text-slate-800">
                                      {entry.newValue || "—"}
                                    </span>
                                    {isLast && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium border border-green-200">
                                        <CheckCircle2 className="w-2.5 h-2.5" /> aktuell
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    {entry.changedAt
                                      ? format(new Date(entry.changedAt), "dd.MM.yyyy HH:mm")
                                      : "—"}
                                    {entry.username && (
                                      <span className="ml-1.5">· {entry.username}</span>
                                    )}
                                  </div>
                                </div>
                                {durationMin !== null && (
                                  <div className="text-[11px] text-slate-400 shrink-0 mt-1 tabular-nums">
                                    {isLast ? "seit " : ""}{fmtDuration(durationMin)}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Alle Feldänderungen (collapsible) ── */}
                {history && history.length > 0 && (() => {
                  const allChanges = [...history].sort(
                    (a, b) => new Date(b.changedAt!).getTime() - new Date(a.changedAt!).getTime(),
                  );
                  return (
                    <AllChangesSection entries={allChanges} />
                  );
                })()}
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
                          {canDeleteAustrag && (
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

                    {/* Auto-calculated net amount */}
                    {(() => {
                      const vonNet = (austragForm.vonCometEuropaletten ?? 0) + (austragForm.vonCometLadungssicherung ?? 0) - (austragForm.vonDefektePaletten ?? 0);
                      const anNet = (austragForm.anCometEuropaletten ?? 0) + (austragForm.anCometLadungssicherung ?? 0) - (austragForm.anDefektePaletten ?? 0);
                      const net = vonNet - anNet;
                      const isPositive = net > 0;
                      const isNegative = net < 0;
                      return (
                        <div className={`rounded-md border p-3 flex items-center justify-between ${isPositive ? "border-green-200 bg-green-50" : isNegative ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                          <div className="text-xs text-slate-500 space-y-0.5">
                            <div className="font-semibold text-slate-700 uppercase tracking-wide text-xs">Netto-Palettenbuchung</div>
                            <div className="text-slate-400">({(austragForm.vonCometEuropaletten ?? 0)} + {(austragForm.vonCometLadungssicherung ?? 0)} − {(austragForm.vonDefektePaletten ?? 0)}) − ({(austragForm.anCometEuropaletten ?? 0)} + {(austragForm.anCometLadungssicherung ?? 0)} − {(austragForm.anDefektePaletten ?? 0)})</div>
                          </div>
                          <div className={`text-2xl font-bold ${isPositive ? "text-green-700" : isNegative ? "text-red-700" : "text-slate-400"}`}>
                            {isPositive ? "+" : ""}{net}
                          </div>
                        </div>
                      );
                    })()}
                    {(austragForm.vonDefektePaletten ?? 0) + (austragForm.anDefektePaletten ?? 0) > 0 && (
                      <p className="text-xs text-amber-600">Defekte Paletten werden vom Nettobetrag abgezogen.</p>
                    )}

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
            {isEditing && isCometUser && (
              <TabsContent value="gefahrgut" className="space-y-3">
                {gefahrgutLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : !gefahrgutChecklisten || gefahrgutChecklisten.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500">Noch keine Checkliste eingereicht.</p>
                    <p className="text-xs text-slate-400">
                      Scanner:{" "}
                      <a href="/scanner" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        /scanner
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gefahrgutChecklisten.map((cl: any) => {
                      const items = (cl.items ?? {}) as Record<string, any>;
                      const bCount = Object.entries(items).filter(([k, v]) => k.endsWith("_b") && v === true).length;
                      const vCount = Object.entries(items).filter(([k, v]) => k.endsWith("_v") && v === true).length;
                      return (
                        <div key={cl.id} className="border border-slate-200 rounded-md p-3 bg-slate-50 text-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-slate-700 text-xs">
                              {cl.eingereichtAt ? format(new Date(cl.eingereichtAt), "dd.MM.yyyy HH:mm") : "—"} Uhr
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-slate-500 hover:text-slate-700"
                                title="PDF / Drucken"
                                onClick={() => printGefahrgutCheckliste({
                                  kennzeichen: cl.kennzeichen,
                                  anhaenger: cl.anhaenger,
                                  spedition: cl.spedition,
                                  nameFahrer: cl.nameFahrer,
                                  unterschriftFahrer: cl.unterschriftFahrer,
                                  nameVerlader: cl.nameVerlader,
                                  unterschriftVerlader: cl.unterschriftVerlader,
                                  datum: cl.datum,
                                  items: cl.items as Record<string, unknown>,
                                  vonCometEuropaletten: cl.vonCometEuropaletten,
                                  vonCometLadungssicherung: cl.vonCometLadungssicherung,
                                  vonDefektePaletten: cl.vonDefektePaletten,
                                  anCometEuropaletten: cl.anCometEuropaletten,
                                  anCometLadungssicherung: cl.anCometLadungssicherung,
                                  anDefektePaletten: cl.anDefektePaletten,
                                  bemerkungen: cl.bemerkungen,
                                })}
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-400 hover:text-red-600"
                                onClick={() => resetGefahrgutMutation.mutate(cl.id)}
                                disabled={resetGefahrgutMutation.isPending}
                                title="Checkliste zurücksetzen (Berechtigung: gefahrgut.reset)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                            {cl.nameFahrer && <div><span className="text-slate-400">Fahrer:</span> {cl.nameFahrer}</div>}
                            {cl.nameVerlader && <div><span className="text-slate-400">Verlader:</span> {cl.nameVerlader}</div>}
                            {cl.spedition && <div><span className="text-slate-400">Spedition:</span> {cl.spedition}</div>}
                            {cl.anhaenger && <div><span className="text-slate-400">Anhänger:</span> {cl.anhaenger}</div>}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">B: {bCount}/17</span>
                            <span className="font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">V: {vCount}/17</span>
                            {cl.unterschriftFahrer && <span className="text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full bg-white">✓ Unterschrift F.</span>}
                            {cl.unterschriftVerlader && <span className="text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full bg-white">✓ Unterschrift V.</span>}
                          </div>
                          {(cl.vonCometEuropaletten != null || cl.anCometEuropaletten != null) && (
                            <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-200 pt-1.5">
                              {cl.vonCometEuropaletten != null && (
                                <div className="bg-white border border-slate-200 rounded p-1.5">
                                  <div className="text-slate-400 font-medium mb-0.5">Von COMET</div>
                                  <div>Europal.: <b>{cl.vonCometEuropaletten}</b></div>
                                  {cl.vonCometLadungssicherung != null && <div>Lasich.: <b>{cl.vonCometLadungssicherung}</b></div>}
                                  {cl.vonDefektePaletten != null && <div className="text-amber-600">Defekt: <b>{cl.vonDefektePaletten}</b></div>}
                                </div>
                              )}
                              {cl.anCometEuropaletten != null && (
                                <div className="bg-white border border-slate-200 rounded p-1.5">
                                  <div className="text-slate-400 font-medium mb-0.5">An COMET</div>
                                  <div>Europal.: <b>{cl.anCometEuropaletten}</b></div>
                                  {cl.anCometLadungssicherung != null && <div>Lasich.: <b>{cl.anCometLadungssicherung}</b></div>}
                                  {cl.anDefektePaletten != null && <div className="text-amber-600">Defekt: <b>{cl.anDefektePaletten}</b></div>}
                                </div>
                              )}
                            </div>
                          )}
                          {cl.bemerkungen && (
                            <div className="text-xs text-slate-500 border-t border-slate-200 pt-1.5 italic">
                              {cl.bemerkungen}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            )}
            {isEditing && canViewFotos && (
              <TabsContent value="fotos" className="space-y-3">
                {fotosLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : !shipmentFotos || shipmentFotos.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <ImageIcon className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500">Noch keine Fotos vorhanden.</p>
                    <p className="text-xs text-slate-400">
                      Fotos können optional beim Ausfüllen der Gefahrgut-Checkliste im Scanner aufgenommen werden.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {shipmentFotos.map((f: any) => {
                      const imgUrl = f.objectPath ? `${API_BASE}/storage/objects${String(f.objectPath).replace(/^\/objects/, "")}` : null;
                      return (
                        <a
                          key={f.id}
                          href={imgUrl ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="block border border-slate-200 rounded-md overflow-hidden bg-slate-50 hover:border-primary transition-colors"
                        >
                          {imgUrl && (
                            <img src={imgUrl} alt={f.fileName ?? "Foto"} className="w-full h-32 object-cover" />
                          )}
                          <div className="p-2 text-xs text-slate-500">
                            {f.createdAt ? format(new Date(f.createdAt), "dd.MM.yyyy HH:mm") : "—"} Uhr
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}
      </SheetContent>
    </Sheet>

    {/* Unknown-relation confirmation dialog */}
    <Dialog
      open={!!unknownRelDialog}
      onOpenChange={(o) => { if (!o) { setUnknownRelDialog(null); setUnknownRelCreating(false); } }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Unbekannte Relation
          </DialogTitle>
          <DialogDescription>
            Die Relation <strong className="text-slate-900 font-mono">{unknownRelDialog?.relation}</strong> ist nicht
            in den Stammdaten hinterlegt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Soll diese Relation in den Stammdaten angelegt werden?</p>
            <div className="flex gap-2">
              <div className="w-24 shrink-0">
                <Label className="text-xs text-slate-400 mb-1 block">Kürzel</Label>
                <Input
                  value={unknownRelDialog?.relation ?? ""}
                  disabled
                  className="h-8 text-sm font-mono bg-slate-50"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-slate-400 mb-1 block">Ort (optional)</Label>
                <Input
                  value={unknownRelOrt}
                  onChange={(e) => setUnknownRelOrt(e.target.value.toUpperCase())}
                  placeholder="ORT"
                  className="h-8 text-sm uppercase"
                  autoFocus
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full"
            disabled={unknownRelCreating}
            onClick={async () => {
              if (!unknownRelDialog) return;
              setUnknownRelCreating(true);
              try {
                await createRelationMutation.mutateAsync({
                  spedId: unknownRelDialog.spedId,
                  kuerzel: unknownRelDialog.relation,
                  ort: unknownRelOrt.trim(),
                });
                toast({ title: `Relation „${unknownRelDialog.relation}" angelegt` });
              } catch {
                toast({ title: "Relation konnte nicht angelegt werden", variant: "destructive" });
              }
              setUnknownRelCreating(false);
              setUnknownRelDialog(null);
              executeSave();
            }}
          >
            {unknownRelCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Relation anlegen + LKW anlegen
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={unknownRelCreating}
            onClick={() => { setUnknownRelDialog(null); executeSave(); }}
          >
            LKW trotzdem anlegen (ohne Stammdaten-Eintrag)
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-500"
            disabled={unknownRelCreating}
            onClick={() => setUnknownRelDialog(null)}
          >
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
