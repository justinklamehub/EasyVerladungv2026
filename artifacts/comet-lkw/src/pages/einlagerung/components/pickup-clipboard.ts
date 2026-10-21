import type { WarehousePickupPlan } from "@workspace/api-client-react";

export function shipmentPickupNumbers(plans: readonly WarehousePickupPlan[], shipmentId: number): string[] {
  return [...new Set(plans.filter((p) => p.planned && p.shipmentId === shipmentId)
    .map((p) => p.deliveryNumber.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
}

/** One delivery per Excel row, with no header, separators, or trailing blank row. */
export const pickupClipboardText = (numbers: readonly string[]) => numbers.join("\n");

export async function writePickupClipboard(text: string, clipboard?: { writeText(text: string): Promise<void> }) {
  if (!text) throw new Error("Keine Liefernummern zum Kopieren vorhanden.");
  if (!clipboard?.writeText) throw new Error("Der Browser unterstützt das automatische Kopieren hier nicht.");
  await clipboard.writeText(text);
}
