import type { Rec } from "../lib";
import { buildShelfMatrix, type ShelfAisle } from "./shelf-layout";

export type Art = { id: number; number: string; name: string; priority: number; color: string; group: string };
export type Occ = { shelf: string; ist: number; retouren: number; auftraege: number };
export type StatusFilter = "" | "free" | "occupied" | "full";
export type ShelfState = "free" | "occupied" | "full";
export type MatrixFilters = { status: StatusFilter; orders: boolean; returns: boolean; hideFull: boolean; q: string };

export const ZOOM_MIN = 60, ZOOM_MAX = 160, ZOOM_STEP = 10, ZOOM_DEFAULT = 100;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Number(z)) || ZOOM_DEFAULT));

export const isUsed = (o?: Occ) => !!o && (o.ist > 0 || o.retouren > 0 || o.auftraege > 0);
export function shelfStatus(s: Rec, o?: Occ): ShelfState {
  return s.d.full ? "full" : isUsed(o) ? "occupied" : "free";
}
export const filtersActive = (f: MatrixFilters) => !!(f.status || f.orders || f.returns || f.hideFull || f.q.trim());

export function shelfMatches(s: Rec, o: Occ | undefined, arts: Art[], f: MatrixFilters, extraSearch = ""): boolean {
  const used = isUsed(o);
  if (f.hideFull && s.d.full) return false;
  if (f.status === "full" && !s.d.full) return false;
  if (f.status === "occupied" && shelfStatus(s, o) !== "occupied") return false;
  if (f.status === "free" && (used || s.d.full)) return false;
  if (f.orders && !(o && o.auftraege > 0)) return false;
  if (f.returns && !(o && o.retouren > 0)) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !String(s.d.name).toLowerCase().includes(q) &&
    !arts.some((a) => a.number.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) &&
    !extraSearch.toLowerCase().includes(q)) return false;
  return true;
}

/** Shelves in reading order of the matrix: positions descending, then columns left to right. */
export function orderedShelves(groups: ShelfAisle[]): Rec[] {
  const { halls, positions } = buildShelfMatrix(groups);
  return positions.flatMap((p) => halls.flatMap((h) => h.columns.flatMap((c) => c.shelvesByPosition.get(p) ?? [])));
}

export function nextTarget(ids: number[], current: number | null, dir: 1 | -1): number | null {
  if (ids.length === 0) return null;
  const i = current == null ? -1 : ids.indexOf(current);
  if (i < 0) return dir > 0 ? ids[0] : ids[ids.length - 1];
  return ids[(i + dir + ids.length) % ids.length];
}

export function matrixCounts(shelves: Rec[], occ: Map<string, Occ>, assigned: Map<number, Art[]>) {
  const c = { total: shelves.length, free: 0, occupied: 0, full: 0, orders: 0, returns: 0, unplanned: 0 };
  for (const s of shelves) {
    const o = occ.get(String(s.d.name));
    c[shelfStatus(s, o)]++;
    if (o && o.auftraege > 0) c.orders++;
    if (o && o.retouren > 0) c.returns++;
    if ((assigned.get(s.id) ?? []).length === 0) c.unplanned++;
  }
  return c;
}

/** Scrolls the internal scroller so the element sits centered below the sticky headers. */
export function scrollToShelf(scroller: HTMLElement, el: HTMLElement) {
  const corner = scroller.querySelector<HTMLElement>("[data-matrix-corner]");
  const top = corner?.offsetHeight ?? 0, left = corner?.offsetWidth ?? 0;
  const s = scroller.getBoundingClientRect(), r = el.getBoundingClientRect();
  const x = r.left - s.left + scroller.scrollLeft - left - Math.max(0, (scroller.clientWidth - left - r.width) / 2);
  const y = r.top - s.top + scroller.scrollTop - top - Math.max(0, (scroller.clientHeight - top - r.height) / 2);
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
}
