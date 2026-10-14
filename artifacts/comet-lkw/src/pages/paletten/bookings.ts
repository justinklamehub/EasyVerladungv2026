import type { PalletMovement, PalletPurchase } from "@workspace/api-client-react";

export function mergePalletBookings(movements: PalletMovement[], purchases: PalletPurchase[], filters: {
  internal: boolean; speditionId: string; dateFrom: string; dateTo: string; reference: string;
}) {
  const reference = filters.reference.trim().toLowerCase();
  return [
    ...movements,
    ...(filters.internal && filters.speditionId === "__all__" ? purchases
      .filter((p) => (!filters.dateFrom || p.purchaseDate >= filters.dateFrom) &&
        (!filters.dateTo || p.purchaseDate <= filters.dateTo) &&
        (!reference || p.reference.toLowerCase().includes(reference)))
      .map((p) => ({
        id: `purchase-${p.id}`, movementType: "kauf", movementDate: p.purchaseDate, speditionId: null,
        speditionName: p.speditionName, palettenscheinnummer: p.reference, bemerkungen: p.note,
        amount: p.amount, shipmentId: null, shipmentBezeichnung: null, purchase: p,
      })) : []),
  ].sort((a, b) => b.movementDate.localeCompare(a.movementDate));
}

export function bookingsCsv(rows: ReturnType<typeof mergePalletBookings>) {
  const cell = (value: unknown) => {
    let s = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [
    ["ID", "Datum", "Spedition", "Art", "Menge", "Palettenschein / Beleg", "Bemerkungen"],
    ...rows.map((r) => [r.id, r.movementDate, r.speditionName, r.movementType === "kauf" ? "Kaufpaletten" : r.movementType,
      r.amount, r.palettenscheinnummer, r.bemerkungen]),
  ].map((r) => r.map(cell).join(";")).join("\r\n");
}
