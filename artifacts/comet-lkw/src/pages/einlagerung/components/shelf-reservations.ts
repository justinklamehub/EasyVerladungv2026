import type { D, Rec } from "../lib";

/** A display projection only: never contributes to imported loads or occupancy. */
export function openReservationsByShelf(reservations: Rec[], carriers: Rec[], spedName: (id: unknown) => string) {
  const result = new Map<number, D[]>();
  for (const reservation of reservations) {
    if (reservation.d.status !== "offen") continue;
    const d = reservation.d;
    const carrier = carriers.find((c) => c.id === Number(d.carrierId)) ??
      carriers.find((c) => d.speditionId != null && Number(c.d.speditionId) === Number(d.speditionId)) ??
      carriers.find((c) => d.speditionName && c.d.name === d.speditionName);
    const shelfId = Number(d.shelfId);
    const rows = result.get(shelfId) ?? [];
    rows.push({ ...d, id: reservation.id, carrierId: carrier?.id,
      spedition: d.speditionName || carrier?.d.name || spedName(d.speditionId) || "Ohne Spedition" });
    result.set(shelfId, rows);
  }
  return result;
}
