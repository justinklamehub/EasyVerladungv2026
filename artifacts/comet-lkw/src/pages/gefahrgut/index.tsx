import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ShieldAlert, Trash2, Eye, ClipboardCheck, Printer, Link2, Search, X, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { printGefahrgutCheckliste } from "@/lib/print-gefahrgut";
import { customFetch } from "@workspace/api-client-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const ITEMS = [
  { id: 1,  text: "zwei plombierte Feuerlöscher (min. 6 kg) mit Prüfdatum" },
  { id: 2,  text: "mind. zwei Unterlegkeile" },
  { id: 3,  text: "Fahrzeugkennzeichnung (Warntafel und Gefahrzettel)" },
  { id: 4,  text: "zwei selbststehende Warnzeichen" },
  { id: 5,  text: "Warnweste oder Warnkleidung (EN 471)" },
  { id: 6,  text: "keine sichtbaren Mängel am Fahrzeug" },
  { id: 7,  text: "gültige Fahrerlaubnis" },
  { id: 8,  text: "Lichtbildausweis" },
  { id: 9,  text: "ADR–Schein mit Eintrag der Klasse 1" },
  { id: 10, text: "Zusammenladungsverbot beachtet" },
  { id: 11, text: "Ladungssicherung durchgeführt" },
  { id: 12, text: "Beförderungspapier" },
  { id: 13, text: "schriftliche Weisung gem. ADR 2023 an Bord" },
  { id: 14, text: "Fahrzeug verschlussfähig" },
  { id: 15, text: "Rauchverbot hingewiesen" },
  { id: 16, text: "Plomben übergeben" },
  { id: 17, text: "Ladung auf LKW fotografiert" },
];

function itemStats(items: Record<string, any>) {
  let ok = 0, nok = 0;
  ITEMS.forEach(({ id }) => {
    if (items[`${id}_b`] === true || items[`${id}_v`] === true) ok++;
    if (items[`${id}_b`] === false || items[`${id}_v`] === false) nok++;
  });
  return { ok, nok, total: ITEMS.length };
}

function ChecklistDetail({ cl, onClose }: { cl: any; onClose: () => void }) {
  const items = (cl.items ?? {}) as Record<string, any>;
  const { ok, nok } = itemStats(items);

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          Blanko Gefahrgut-Checkliste #{cl.id}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Kennzeichen", cl.kennzeichen || "—"],
            ["Spedition", cl.spedition || "—"],
            ["Fahrer", cl.nameFahrer || cl.name_fahrer || "—"],
            ["Verlader", cl.nameVerlader || cl.name_verlader || "—"],
            ["Datum", cl.datum ? format(new Date(cl.datum), "dd.MM.yyyy") : "—"],
            ["Eingereicht", cl.eingereichtAt || cl.eingereicht_at
              ? format(new Date(cl.eingereichtAt ?? cl.eingereicht_at), "dd.MM.yyyy HH:mm", { locale: de })
              : "—"],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 rounded p-2">
              <div className="text-xs text-slate-500 font-medium">{label}</div>
              <div className="font-medium text-slate-800">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Badge variant={nok === 0 ? "default" : "destructive"} className="gap-1">
            <ClipboardCheck className="w-3 h-3" />
            {ok}/{ITEMS.length} OK
          </Badge>
          {nok > 0 && (
            <Badge variant="destructive">{nok} NICHT OK</Badge>
          )}
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Punkt</th>
                <th className="text-center px-2 py-2 font-medium text-slate-600 w-16">Bestätigt</th>
                <th className="text-center px-2 py-2 font-medium text-slate-600 w-16">Verladen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ITEMS.map((item) => {
                const bVal = items[`${item.id}_b`];
                const vVal = items[`${item.id}_v`];
                const nok = bVal === false || vVal === false;
                return (
                  <tr key={item.id} className={nok ? "bg-red-50" : ""}>
                    <td className="px-3 py-1.5 text-slate-700">{item.id}. {item.text}</td>
                    <td className="text-center px-2 py-1.5">
                      {bVal === true ? "✅" : bVal === false ? "❌" : "—"}
                    </td>
                    <td className="text-center px-2 py-1.5">
                      {vVal === true ? "✅" : vVal === false ? "❌" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {cl.bemerkungen && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <div className="text-xs font-medium text-amber-700 mb-1">Bemerkungen</div>
            <div className="text-slate-700">{cl.bemerkungen}</div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-xs">
          {[
            ["Von COMET – Europaletten", cl.vonCometEuropaletten ?? cl.von_comet_europaletten],
            ["Von COMET – Ladungssich.", cl.vonCometLadungssicherung ?? cl.von_comet_ladungssicherung],
            ["Von COMET – Defekt", cl.vonDefektePaletten ?? cl.von_defekte_paletten],
            ["An COMET – Europaletten", cl.anCometEuropaletten ?? cl.an_comet_europaletten],
            ["An COMET – Ladungssich.", cl.anCometLadungssicherung ?? cl.an_comet_ladungssicherung],
            ["An COMET – Defekt", cl.anDefektePaletten ?? cl.an_defekte_paletten],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-slate-50 rounded p-2">
              <div className="text-slate-500">{label}</div>
              <div className="font-semibold">{value ?? "—"}</div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={async () => {
            let logoUrl: string | null = null;
            try {
              const pubRes = await fetch(`${API_BASE}/settings/public`);
              if (pubRes.ok) {
                const pub = await pubRes.json();
                logoUrl = pub["company_logo"] || null;
              }
            } catch { /* kein Logo – kein Problem */ }
            printGefahrgutCheckliste({
              ...cl,
              shipmentId: cl.shipmentId ?? cl.shipment_id ?? null,
              ladelistennummer: cl.ladelistennummer ?? null,
              logoUrl,
            });
          }}
        >
          <Printer className="w-4 h-4" />
          Checkliste drucken / PDF
        </Button>
      </div>
    </DialogContent>
  );
}

type Shipment = {
  id: number;
  kennzeichen: string | null;
  bezeichnung: string | null;
  relation: string | null;
  status: string;
  etaDate: string | null;
};

function AssignDialog({
  cl,
  onClose,
  onAssigned,
}: {
  cl: any;
  onClose: () => void;
  onAssigned: (shipmentId: number) => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState(cl.kennzeichen ?? "");
  const [selected, setSelected] = useState<Shipment | null>(null);

  const { data: shipments = [], isFetching } = useQuery<Shipment[]>({
    queryKey: ["shipments-assign-search", search],
    queryFn: () =>
      customFetch<Shipment[]>(`/api/shipments?search=${encodeURIComponent(search)}&limit=30`),
    enabled: search.trim().length >= 1,
    staleTime: 10_000,
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      customFetch<{ success: boolean }>(`/api/gefahrgut-checklisten/${cl.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: selected!.id }),
      }),
    onSuccess: () => {
      toast({ title: `Checkliste #${cl.id} wurde Verladung #${selected!.id} zugeordnet` });
      onAssigned(selected!.id);
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
          Checkliste #{cl.id} einem LKW zuordnen
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-1">
        <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          Kennzeichen: <span className="font-medium text-slate-700">{cl.kennzeichen || "—"}</span>
          · Fahrer: <span className="font-medium text-slate-700">{cl.nameFahrer ?? cl.name_fahrer ?? "—"}</span>
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
                    {s.etaDate && <span>{format(new Date(s.etaDate), "dd.MM.yyyy")}</span>}
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
          disabled={!selected || assignMutation.isPending}
          onClick={() => assignMutation.mutate()}
          className="gap-1.5"
        >
          {assignMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <Link2 className="w-3.5 h-3.5" />
          Zuordnen
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function GefahrgutPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [assigning, setAssigning] = useState<any | null>(null);

  const canReset = useMemo(() => {
    const resetRoles = ["comet_admin", "comet_leitstand"];
    return resetRoles.includes(user?.role ?? "");
  }, [user?.role]);

  // Load permission for assigning shipments
  const { data: permsData } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: () => customFetch<{ [key: string]: boolean }>("/api/auth/permissions"),
  });
  const canAssign = permsData?.["gefahrgut.assign_shipment"] === true;

  const { data: checklisten, isLoading, refetch } = useQuery({
    queryKey: ["gefahrgut-checklisten-blanko"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/gefahrgut-checklisten?blanko=true`, { credentials: "include" });
      if (!res.ok) return [] as any[];
      return res.json() as Promise<any[]>;
    },
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/gefahrgut-checklisten/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["gefahrgut-checklisten-blanko"] });
      toast({ title: "Checkliste gelöscht" });
      setSelected(null);
    },
    onError: (e: any) => toast({ title: e.message ?? "Fehler", variant: "destructive" }),
  });

  const handleAssigned = useCallback((shipmentId: number) => {
    queryClient.invalidateQueries({ queryKey: ["gefahrgut-checklisten-blanko"] });
    queryClient.invalidateQueries({ queryKey: ["gefahrgut-status"] });
    queryClient.invalidateQueries({ queryKey: ["gefahrgut-checklisten", shipmentId] });
    refetch();
  }, [queryClient, refetch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            Blanko Gefahrgut-Checklisten
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Checklisten ohne zugeordnete Verladungs-ID (FB LOG – 016)
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {checklisten?.length ?? 0} Einträge
        </Badge>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : !checklisten || checklisten.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <ShieldAlert className="w-12 h-12 opacity-30" />
            <p className="text-sm">Noch keine Blanko-Checklisten vorhanden.</p>
            <p className="text-xs text-slate-400">Blanko-Checklisten werden über den Scanner ohne Verladungs-ID erstellt.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead>Kennzeichen</TableHead>
                <TableHead>Fahrer</TableHead>
                <TableHead>Spedition</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Eingereicht</TableHead>
                <TableHead className="text-center">Prüfpunkte</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checklisten.map((cl: any) => {
                const items = (cl.items ?? {}) as Record<string, any>;
                const { ok, nok } = itemStats(items);
                const datum = cl.datum ? format(new Date(cl.datum), "dd.MM.yyyy") : "—";
                const eingereicht = cl.eingereichtAt ?? cl.eingereicht_at;
                return (
                  <TableRow
                    key={cl.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    onClick={() => setSelected(cl)}
                  >
                    <TableCell className="text-xs text-slate-400 font-mono">{cl.id}</TableCell>
                    <TableCell className="font-medium">{cl.kennzeichen || "—"}</TableCell>
                    <TableCell>{cl.nameFahrer ?? cl.name_fahrer ?? "—"}</TableCell>
                    <TableCell>{cl.spedition || "—"}</TableCell>
                    <TableCell>{datum}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {eingereicht ? format(new Date(eingereicht), "dd.MM.yy HH:mm", { locale: de }) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Badge
                          variant={nok === 0 && ok > 0 ? "default" : nok > 0 ? "destructive" : "outline"}
                          className="text-[11px] px-1.5"
                        >
                          {ok}/{ITEMS.length}
                        </Badge>
                        {nok > 0 && (
                          <Badge variant="destructive" className="text-[11px] px-1.5">{nok}✗</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={(e) => { e.stopPropagation(); setSelected(cl); }}
                          title="Details anzeigen"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {canAssign && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-400 hover:text-blue-600"
                            onClick={(e) => { e.stopPropagation(); setAssigning(cl); }}
                            title="LKW zuordnen"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canReset && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Checkliste wirklich löschen?")) deleteMutation.mutate(cl.id);
                            }}
                            disabled={deleteMutation.isPending}
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {selected && (
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <ChecklistDetail cl={selected} onClose={() => setSelected(null)} />
        </Dialog>
      )}

      {assigning && (
        <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
          <AssignDialog
            cl={assigning}
            onClose={() => setAssigning(null)}
            onAssigned={handleAssigned}
          />
        </Dialog>
      )}
    </div>
  );
}
