import { aggregateStock, getSettings, isShelfActive, records, snapshots, type Client, type Data, type WarehouseRecord } from "./model";
import { matchesTerm } from "./calendar";

export async function loadWarehouse(client: Client) {
  const all = await records(client);
  const latest = await snapshots(client);
  const stock = Object.fromEntries(["istbestand", "retouren", "auftraege"].map((type) =>
    [type, aggregateStock(latest.find((s) => s.type === type)?.rows || [], type, all)]));
  return { all, latest, stock };
}
export function occupancy(latest: Data[]) {
  const map = new Map<string, { shelf: string; ist: Set<string>; retouren: Set<string>; auftraege: Set<string> }>();
  for (const snapshot of latest) {
    if (!["istbestand", "retouren", "auftraege"].includes(snapshot.type)) continue;
    for (const row of snapshot.rows) {
      const shelf = row.lagerplatz || row.platz;
      if (!map.has(shelf)) map.set(shelf, { shelf, ist: new Set(), retouren: new Set(), auftraege: new Set() });
      const entry = map.get(shelf)!;
      if (snapshot.type === "istbestand") entry.ist.add(row.lagereinh);
      else if (snapshot.type === "retouren") entry.retouren.add(row.hu);
      else entry.auftraege.add(row.handling_unit);
    }
  }
  return [...map.values()].map((r) => ({ shelf: r.shelf, ist: r.ist.size, retouren: r.retouren.size, auftraege: r.auftraege.size }));
}
export async function search(client: Client, query: Data) {
  const { all, stock, latest } = await loadWarehouse(client);
  const settings = await getSettings(client);
  const result: Data = { message: "", locations: [], orders: [], reservations: [] };
  const matches = (value: unknown, term: unknown) => !term || String(value ?? "").toLowerCase().includes(String(term).toLowerCase());
  const location = (shelf: WarehouseRecord, rule?: WarehouseRecord) => {
    const group = all.find((r) => r.kind === "group" && r.id === rule?.data.groupId);
    return { shelf, priority: rule?.data.priority ?? 1, note: rule?.data.note ?? "",
      group: group?.data.name ?? "", color: group?.data.color ?? "#64748b",
      ist: stock.istbestand!.filter((r) => r.shelf === shelf.data.name),
      retouren: stock.retouren!.filter((r) => r.shelf === shelf.data.name),
      orders: stock.auftraege!.filter((r) => r.shelf === shelf.data.name) };
  };
  if (query.mode === "artikel") {
    const article = all.find((r) => r.kind === "article" && r.data.active &&
      (r.data.number === query.q || (r.data.ean && r.data.ean === query.q)));
    if (!article) { result.message = "Artikel wurde nicht gefunden."; return result; }
    result.article = article;
    result.locations = all.filter((r) => r.kind === "rule" && r.data.active && r.data.articleId === article.id)
      .flatMap((r) => {
        const shelf = all.find((s) => s.kind === "shelf" && s.id === r.data.shelfId);
        return shelf && isShelfActive(shelf, all) && (!settings.hideFull || !shelf.data.full) ? [location(shelf, r)] : [];
      });
    result.locations.sort((a: Data, b: Data) => {
      const aAisle = all.find((r) => r.id === a.shelf.data.aisleId);
      const bAisle = all.find((r) => r.id === b.shelf.data.aisleId);
      const aHall = all.find((r) => r.id === aAisle?.data.hallId);
      const bHall = all.find((r) => r.id === bAisle?.data.hallId);
      return Number(!!a.shelf.data.full) - Number(!!b.shelf.data.full) ||
        a.priority - b.priority || (aHall?.data.sort ?? 0) - (bHall?.data.sort ?? 0) ||
        (aAisle?.data.sort ?? 0) - (bAisle?.data.sort ?? 0) ||
        (a.shelf.data.sort ?? a.shelf.data.position ?? 0) - (b.shelf.data.sort ?? b.shelf.data.position ?? 0) ||
        a.shelf.data.name.localeCompare(b.shelf.data.name, "de", { numeric: true });
    });
    result.message = result.locations.length ? "" : "Artikel gefunden, aber keine verfügbare Einlagerungsvorgabe hinterlegt.";
  } else if (query.mode === "regal") {
    const shelf = all.find((s) => s.kind === "shelf" && s.id === Number(query.shelfId));
    if (!shelf) { result.message = "Regal wurde nicht gefunden."; return result; }
    result.locations = [location(shelf)];
    result.reservations = all.filter((r) => r.kind === "reservation" && r.data.shelfId === shelf.id);
  } else {
    const shelf = all.find((s) => s.kind === "shelf" && s.id === Number(query.shelfId));
    // Filter individual order/HU rows before grouping; scanning one Beleg
    // must not include unrelated orders sharing the same carrier and week.
    const orders = query.q ? aggregateStock(
      (latest.find((s) => s.type === "auftraege")?.rows || []).filter((r: Data) =>
        matches(Object.values(r).join(" "), query.q)), "auftraege", all) : stock.auftraege!;
    result.orders = orders.filter((r) =>
      (!query.shelfId || r.shelf === shelf?.data.name) &&
      (!query.spedition || String(r.speditionId) === query.spedition || matches(r.spedition, query.spedition)) &&
      matches(r.relation, query.relation) && matchesTerm(r.termin, r.plusKw, query.termin) &&
      matches(`${r.shelf} ${r.spedition} ${r.relation} ${r.termin} ${(r.belege || []).join(" ")} ${(r.hus || []).join(" ")}`, query.q));
    result.reservations = all.filter((r) => {
      if (r.kind !== "reservation") return false;
      const shelf = all.find((s) => s.id === r.data.shelfId);
      const spedition = r.data.speditionName || all.find((s) => s.kind === "carrier" && s.data.speditionId === r.data.speditionId)?.data.name || "";
      return (!query.shelfId || r.data.shelfId === Number(query.shelfId)) &&
        (!query.spedition || String(r.data.speditionId) === query.spedition || matches(spedition, query.spedition)) &&
        matches(r.data.relation, query.relation) && matchesTerm(r.data.termin, r.data.plusKw, query.termin) &&
        matches(`${shelf?.data.name} ${spedition} ${r.data.relation} ${r.data.termin}`, query.q);
    });
    if (!result.orders.length && !result.reservations.length) result.message = "Keine Treffer.";
  }
  return result;
}
