import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWarehousePickupPlans, getListWarehousePickupPlansQueryKey, useSaveWarehousePickupPlan, useListShipments,
  useSaveWarehousePickupPlansBulk, type WarehousePickupBatchTarget, type WarehousePickupPlan,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "../lib";
import { matchesPickupFilter, PICKUP_FILTERS, pickupStage, pickupStatus } from "./pickup-status";

export function pickupTruck(plan?: WarehousePickupPlan) {
  if (!plan?.shipmentId) return "";
  const s = plan.shipment;
  return s ? [`LKW #${s.id}`, s.kennzeichen, s.speditionName, [s.etaDate.split("-").reverse().join("."), s.etaTime].filter(Boolean).join(" "), s.status].filter(Boolean).join(" · ")
    : `LKW #${plan.shipmentId} – Anmeldung nicht verfügbar oder nicht freigegeben`;
}

export function usePickupPlanning(enabled = true) {
  const query = useListWarehousePickupPlans({ query: { queryKey: getListWarehousePickupPlansQueryKey(), enabled, refetchInterval: 30000, refetchIntervalInBackground: false } });
  const plans = useMemo(() => new Map((query.data ?? []).map((p) => [p.deliveryNumber, p])), [query.data]);
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState<{ number: string; plan?: WarehousePickupPlan } | null>(null);
  const matches = (number: unknown) => filter === "all" || (query.isSuccess && matchesPickupFilter(plans.get(String(number ?? "").trim()), filter));
  const enrich = <T extends Record<string, any>>(row: T) => {
    const p = plans.get(String(row.deliveryNumber ?? "").trim());
    return { ...row, pickupStatus: row.deliveryNumber ? pickupStatus(p) : "Ohne Liefernummer nicht planbar", pickupTruck: pickupTruck(p) };
  };
  return { query, plans, filter, setFilter, edit, setEdit, matches, enrich };
}
type Planning = ReturnType<typeof usePickupPlanning>;

export function PickupFilter({ planning: p }: { planning: Planning }) {
  return <div className="flex flex-wrap gap-2 items-center">
    <Label htmlFor="pickup-status-filter">Abholplanung</Label>
    <select id="pickup-status-filter" className="h-9 rounded-md border bg-white px-2 text-sm" value={p.filter} onChange={(e) => p.setFilter(e.target.value)} data-testid="select-pickup-filter">
      {PICKUP_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    {p.query.isLoading && <span className="text-xs text-slate-500">Abholplanung wird geladen …</span>}
    {p.query.isError && <div role="alert" className="text-sm text-red-700">Abholplanung konnte nicht geladen werden: {errMsg(p.query.error)} <Button type="button" size="sm" variant="outline" onClick={() => p.query.refetch()}>Erneut versuchen</Button></div>}
  </div>;
}

export function PickupCell({ number, planning: p, canEdit }: { number: unknown; planning: Planning; canEdit: boolean }) {
  const delivery = String(number ?? "").trim();
  const plan = p.plans.get(delivery);
  if (!delivery) return <span className="text-xs text-slate-500">Ohne Liefernummer nicht planbar</span>;
  return <div className="min-w-[12rem] max-w-sm space-y-1" data-testid={`pickup-${delivery}`}>
    {p.query.isError ? <span className="text-xs text-red-700">Planung nicht verfügbar</span> : p.query.isLoading ? "Wird geladen …" : <>
      <span data-testid={`pickup-status-${delivery}`} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${pickupStage(plan) === "completed" ? "bg-blue-100 text-blue-800" : ["cancelled", "unavailable"].includes(pickupStage(plan)) ? "bg-amber-100 text-amber-900" : plan?.planned ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{pickupStatus(plan)}</span>
      {plan?.shipmentId && <div className="text-xs">
        {plan.shipment ? <Link href={`/shipments?shipmentId=${plan.shipmentId}`} className="underline text-blue-700">{pickupTruck(plan)}</Link> : pickupTruck(plan)}
        {plan.shipment?.status === "Storniert" && <div className="font-semibold text-red-700">LKW storniert – Planung prüfen</div>}
      </div>}
      {canEdit && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => p.setEdit({ number: delivery, plan })} data-testid={`button-pickup-${delivery}`}>Planung bearbeiten</Button>}
    </>}
  </div>;
}

export function PickupEditor({ planning: p }: { planning: Planning }) {
  return p.edit ? <PickupDialog key={`${p.edit.number}-${p.edit.plan?.updatedAt ?? "new"}`} number={p.edit.number} plan={p.edit.plan} onClose={() => p.setEdit(null)} /> : null;
}

export function PickupDialog({ number, plan, batch, onClose }: { number?: string; plan?: WarehousePickupPlan; batch?: WarehousePickupBatchTarget[]; onClose: () => void }) {
  const [planned, setPlanned] = useState(batch ? true : plan?.planned ?? false);
  const [shipmentId, setShipmentId] = useState(plan?.shipmentId ? String(plan.shipmentId) : "");
  const [shipmentMode, setShipmentMode] = useState<"keep" | "assign" | "remove">("keep");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const save = useSaveWarehousePickupPlan();
  const bulkSave = useSaveWarehousePickupPlansBulk();
  const pending = save.isPending || bulkSave.isPending;
  const choosingTruck = !batch || (planned && shipmentMode === "assign");
  const trucks = useListShipments();
  const qc = useQueryClient();
  const { toast } = useToast();
  const needle = search.toLowerCase().trim();
  const options = (trucks.data ?? []).filter((s) => String(s.id) === shipmentId || !["Abgefertigt", "Storniert"].includes(s.status)).filter((s) => String(s.id) === shipmentId || !needle ||
    [s.id, s.kennzeichen, s.speditionName, s.etaDate, s.relation, s.bezeichnung].join(" ").toLowerCase().includes(needle));
  const submit = async () => {
    setError("");
    try {
      if (batch) {
        await bulkSave.mutateAsync({ data: { deliveries: batch, planned, shipmentMode: planned ? shipmentMode : "remove",
          shipmentId: planned && shipmentMode === "assign" && shipmentId ? Number(shipmentId) : null } });
      } else {
        await save.mutateAsync({ deliveryNumber: number!, data: { planned, shipmentId: planned && shipmentId ? Number(shipmentId) : null, expectedUpdatedAt: plan?.updatedAt ?? null } });
      }
      await qc.invalidateQueries({ queryKey: getListWarehousePickupPlansQueryKey() });
      toast({ title: batch ? `Abholplanung für ${batch.length} Lieferungen gespeichert` : "Abholplanung gespeichert" }); onClose();
    } catch (e) {
      void qc.invalidateQueries({ queryKey: getListWarehousePickupPlansQueryKey() });
      setError(errMsg(e));
    }
  };
  return <Dialog open onOpenChange={(o) => !o && !pending && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>Abholplanung · {batch ? `${batch.length} Lieferungen` : number}</DialogTitle><DialogDescription>Gilt für alle Positionen {batch ? "der ausgewählten Lieferungen" : "dieser Lieferung"} und bleibt bei Importen und beim Ersetzen erhalten.</DialogDescription></DialogHeader>
    <div className="min-w-0 space-y-4">
      {batch && <p className="text-xs break-words text-slate-600" data-testid="pickup-batch-targets">{batch.slice(0, 8).map((d) => d.deliveryNumber).join(", ")}{batch.length > 8 ? ` und ${batch.length - 8} weitere` : ""}</p>}
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={planned} disabled={pending} onChange={(e) => { setPlanned(e.target.checked); if (!e.target.checked) setShipmentId(""); }} data-testid="checkbox-pickup-planned" />{batch ? "Alle ausgewählten Abholungen einplanen" : "Abholung ist eingeplant"}</label>
      {!planned && batch && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">Die Planung aller {batch.length} ausgewählten Lieferungen wird zurückgesetzt und ihre LKW-Zuordnung entfernt. Die LKW-Anmeldungen selbst werden nicht geändert.</p>}
      <div className="space-y-2">
        {batch && <><Label htmlFor="pickup-shipment-mode">LKW-Zuordnung für die Auswahl</Label>
          <select id="pickup-shipment-mode" className="w-full min-w-0 h-10 rounded-md border bg-white px-2 text-sm" value={shipmentMode} disabled={!planned || pending}
            onChange={(e) => { setShipmentMode(e.target.value as typeof shipmentMode); setShipmentId(""); }} data-testid="select-pickup-shipment-mode">
            <option value="keep">Bestehende LKW-Zuordnungen beibehalten</option>
            <option value="assign">Allen denselben LKW zuordnen</option>
            <option value="remove">Ohne LKW planen / Zuordnungen entfernen</option>
          </select></>}
        {choosingTruck && <>
        <Label htmlFor="pickup-truck">{batch ? "Gemeinsamer LKW (erforderlich)" : "LKW-Anmeldung (optional)"}</Label>
        <Input placeholder="LKW suchen: Kennzeichen, Spedition, Termin, Relation" value={search} onChange={(e) => setSearch(e.target.value)} disabled={!planned || pending} data-testid="input-pickup-truck-search" />
        <select id="pickup-truck" className="w-full min-w-0 h-10 rounded-md border bg-white px-2 text-sm" value={shipmentId} disabled={!planned || trucks.isLoading || trucks.isError || pending} onChange={(e) => setShipmentId(e.target.value)} data-testid="select-pickup-truck">
          <option value="">{batch ? "Bitte gemeinsamen LKW auswählen" : "Eingeplant ohne konkrete LKW-Zuordnung"}</option>
          {shipmentId && !options.some((s) => String(s.id) === shipmentId) && <option value={shipmentId}>{pickupTruck(plan) || `LKW #${shipmentId}`}</option>}
          {options.map((s) => <option key={s.id} value={s.id}>#{s.id} · {s.kennzeichen || "Ohne Kennzeichen"} · {s.speditionName || "Ohne Spedition"} · {s.etaDate || "Ohne Datum"} {s.etaTime} · {s.relation} · {s.status}</option>)}
        </select>
        {trucks.isLoading && <p className="text-xs text-slate-500">LKW-Anmeldungen werden geladen …</p>}
        {trucks.isError && <div role="alert" className="text-sm text-red-700">LKW-Anmeldungen konnten nicht geladen werden. <Button size="sm" variant="outline" onClick={() => trucks.refetch()}>Erneut versuchen</Button></div>}
        </>}
        {plan?.shipment?.status === "Storniert" && <p className="text-sm text-red-700">Die bisherige LKW-Anmeldung wurde storniert. Bitte Zuordnung prüfen.</p>}
        {plan?.shipment?.status === "Abgefertigt" && <p className="text-sm text-blue-800" data-testid="pickup-dialog-completed">Der zugeordnete LKW wurde bereits abgefertigt. Dieser Vermerk wird in der Tabelle und im Export angezeigt.</p>}
        <p className="text-xs text-slate-500">Mehrere Lieferungen können demselben LKW zugeordnet werden. LKW-Status und Auftragsdaten werden dadurch nicht geändert.</p>
      </div>
      {error && <div role="alert" className="text-sm text-red-700">{error}</div>}
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose} disabled={pending}>Abbrechen</Button><Button onClick={submit} disabled={pending || !!(batch && planned && shipmentMode === "assign" && (!shipmentId || trucks.isError || trucks.isLoading))} data-testid="button-save-pickup">{pending ? "Speichert …" : batch ? `${batch.length} Lieferungen speichern` : "Speichern"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
