import { Link } from "wouter";
import { useListWarehousePickupPlans, getListWarehousePickupPlansQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export function PickupShipmentSummary({ shipmentId }: { shipmentId: number }) {
  const q = useListWarehousePickupPlans({ query: { queryKey: getListWarehousePickupPlansQueryKey(), refetchInterval: 30000 } });
  const plans = q.data?.filter((p) => p.planned && p.shipmentId === shipmentId) ?? [];
  return <section className="rounded-md border bg-slate-50 p-3 mb-4 space-y-2" data-testid="shipment-pickup-deliveries">
    <h3 className="text-sm font-semibold">Eingeplante Lieferungen aus der Einlagerung</h3>
    {q.isLoading ? <p className="text-xs">Abholplanung wird geladen …</p> : q.isError ?
      <div role="alert" className="text-xs text-red-700">Abholplanung konnte nicht geladen werden. <Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div> :
      !plans.length ? <p className="text-xs text-slate-500">Keine Lieferungen zugeordnet.</p> :
      <div className="flex flex-wrap gap-2">{plans.map((p) => <Link key={p.deliveryNumber} href={`/einlagerung/auftraege?deliveryNumber=${encodeURIComponent(p.deliveryNumber)}`} className="rounded-md border bg-white px-2 py-1 text-xs text-blue-700 underline">{p.deliveryNumber}</Link>)}</div>}
  </section>;
}
