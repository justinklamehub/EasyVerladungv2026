import type { WarehousePickupPlan } from "@workspace/api-client-react";

export type PickupStage = "unplanned" | "planned" | "completed" | "cancelled" | "unavailable";
export const PICKUP_FILTERS = [
  ["all", "Alle Lieferungen"], ["unplanned", "Noch nicht eingeplant"],
  ["planned", "Abholung eingeplant (offen)"], ["completed", "LKW abgefertigt"],
  ["attention", "LKW storniert / Zuordnung prüfen"], ["without-truck", "Eingeplant ohne LKW-Zuordnung"],
] as const;
export function pickupStage(plan?: WarehousePickupPlan): PickupStage {
  if (!plan?.planned) return "unplanned";
  if (plan.shipment?.status === "Abgefertigt") return "completed";
  if (plan.shipment?.status === "Storniert") return "cancelled";
  if (plan.shipmentId && !plan.shipment) return "unavailable";
  return "planned";
}
export function pickupStatus(plan?: WarehousePickupPlan) {
  switch (pickupStage(plan)) {
    case "completed": return "LKW abgefertigt";
    case "cancelled": return "Planung prüfen – LKW storniert";
    case "unavailable": return "Zuordnung prüfen – LKW nicht verfügbar";
    case "planned": return "Abholung eingeplant";
    default: return "Noch nicht eingeplant";
  }
}
export function matchesPickupFilter(plan: WarehousePickupPlan | undefined, filter: string) {
  if (filter === "all") return true;
  const stage = pickupStage(plan);
  if (filter === "attention") return stage === "cancelled" || stage === "unavailable";
  if (filter === "without-truck") return !!plan?.planned && plan.shipmentId == null;
  return stage === filter;
}
export const pickupFilterLabel = (filter: string) => PICKUP_FILTERS.find(([key]) => key === filter)?.[1] ?? "Alle Lieferungen";
