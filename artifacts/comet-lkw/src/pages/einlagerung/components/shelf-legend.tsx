import type { ContentMode } from "./shelf-load-content";

export function ShelfLegend({ colors, mode = "planned" }: { colors: { free: string; occupied: string; full: string }; mode?: ContentMode }) {
  const sw = (c: string, l: string, border = "border-slate-400") => (
    <span className="inline-flex items-center gap-1.5"><span className={`w-4 h-3 rounded-sm border ${border}`} style={{ backgroundColor: c }} />{l}</span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 rounded-md border border-slate-200 bg-white px-3 py-1.5" data-testid="matrix-legend" aria-label="Legende">
      <span className="font-semibold text-slate-800">Legende</span>
      {sw(colors.free, "Frei")}{sw(colors.occupied, "Belegt")}{sw(colors.full, "Voll", "border-red-600 border-2")}
      <span className="inline-flex items-center gap-1.5"><span className={`w-8 h-3 rounded-full ${mode === "orders" ? "bg-green-600" : mode === "returns" ? "bg-amber-500" : "bg-slate-300"}`} />
        {mode === "planned" ? "Artikelstreifen (Gruppenfarbe)" : mode === "orders" ? "Aufträge (Speditionsfarbe)" : "Retouren (Kunde / Parcours)"}</span>
      <span className="inline-flex items-center gap-1.5"><span className="rounded-full bg-blue-700 text-white font-bold px-1 text-[10px]">12</span>IST</span>
      <span className="inline-flex items-center gap-1.5"><span className="rounded-full bg-amber-500 text-slate-900 font-bold px-1 text-[10px]">R3</span>Retouren</span>
      <span className="inline-flex items-center gap-1.5"><span className="rounded-full bg-violet-700 text-white font-bold px-1 text-[10px]">A5</span>Aufträge</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm border border-slate-400" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(100,116,139,0.3) 3px, rgba(100,116,139,0.3) 6px)" }} />{mode === "planned" ? "nicht verplant" : "keine Einträge in dieser Ansicht"}</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm bg-slate-300 opacity-40" />abgeblendet (Filter)</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm ring-2 ring-amber-400" />aktueller Treffer</span>
      <span>Positionen absteigend, 0 = Sonderposition</span>
    </div>
  );
}
