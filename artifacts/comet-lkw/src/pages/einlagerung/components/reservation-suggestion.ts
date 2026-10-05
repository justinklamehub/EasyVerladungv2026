import type { Rec } from "../lib";

export function suggestReservationShelf(
  shelves: Rec[], occupancy: { shelf: string; ist: number; retouren: number; auftraege: number }[], reservations: Rec[],
) {
  const eligible = shelves.filter((s) => s.d.active !== false && !s.d.full);
  const reserved = new Set(reservations.filter((r) => r.d.status === "offen").map((r) => Number(r.d.shelfId)));
  const occupied = new Set(occupancy.filter((o) => o.ist > 0 || o.retouren > 0 || o.auftraege > 0).map((o) => o.shelf));
  return eligible.find((s) => !reserved.has(s.id) && !occupied.has(String(s.d.name))) ??
    eligible.find((s) => !reserved.has(s.id)) ?? eligible[0];
}
