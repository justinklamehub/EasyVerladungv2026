import type { Rec } from "../lib";

export type ShelfAisle = { aisle: Rec; hall?: Rec; shelves: Rec[] };

export function shelfPosition(shelf: Rec) {
  return Number(shelf.d.position) || 0;
}

// Physical shelf position, not ascending legacy import/insertion order.
export function compareShelvesDescending(a: Rec, b: Rec) {
  return shelfPosition(b) - shelfPosition(a) ||
    String(b.d.name).localeCompare(String(a.d.name), "de", { numeric: true });
}

export function buildShelfMatrix(groups: ShelfAisle[]) {
  const halls = new Map<number, {
    hall?: Rec; columns: { aisle: Rec; shelvesByPosition: Map<number, Rec[]> }[];
  }>();
  const positions = new Set<number>();
  for (const group of groups) {
    const hallId = group.hall?.id ?? 0;
    const hall = halls.get(hallId) ?? { hall: group.hall, columns: [] };
    const shelvesByPosition = new Map<number, Rec[]>();
    for (const shelf of [...group.shelves].sort(compareShelvesDescending)) {
      const position = shelfPosition(shelf);
      positions.add(position);
      const shelves = shelvesByPosition.get(position) ?? [];
      shelves.push(shelf);
      shelvesByPosition.set(position, shelves);
    }
    hall.columns.push({ aisle: group.aisle, shelvesByPosition });
    halls.set(hallId, hall);
  }
  return {
    halls: [...halls.values()].sort((a, b) => Number(a.hall?.d.sort ?? 0) - Number(b.hall?.d.sort ?? 0) ||
      String(a.hall?.d.name ?? "").localeCompare(String(b.hall?.d.name ?? ""), "de", { numeric: true })),
    positions: [...positions].sort((a, b) => b - a),
  };
}
