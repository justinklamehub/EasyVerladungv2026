import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseDeliveryNumbers } from "./delivery-number-list";

export function DeliveryNumberFilter({ value, onChange, testId }: { value: string[]; onChange: (values: string[]) => void; testId: string }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const apply = (raw: string) => {
    try { const numbers = parseDeliveryNumbers(raw); onChange(numbers); setError(""); }
    catch (e) { setError(`${e instanceof Error ? e.message : "Ungültige Liste."} Die Liste wurde nicht übernommen.`); }
  };
  return <div className="min-w-0">
    <Popover onOpenChange={(open) => { if (open) { setDraft(value.join("\n")); setError(""); } }}>
      <PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start font-normal" data-testid={`${testId}-trigger`}>Liefernummern{value.length ? ` (${value.length})` : " / Excel-Liste"}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2" data-testid={`${testId}-content`}>
        <label htmlFor={`${testId}-input`} className="text-sm font-semibold">Liefernummern aus Excel einfügen</label>
        <p className="text-xs text-slate-500">Eine oder mehrere Spalten/Zeilen kopieren. Zeilenumbrüche, Tabulatoren, Komma und Semikolon sind erlaubt. Einfügen übernimmt alle Nummern sofort und ersetzt die bisherige Liste.</p>
        <Textarea id={`${testId}-input`} rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={"80001234\n80005678"} data-testid={`${testId}-input`}
          onPaste={(e) => { e.preventDefault(); const raw = e.clipboardData.getData("text/plain"); setDraft(raw); apply(raw); }}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); apply(draft); } }} />
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => apply(draft)} data-testid={`${testId}-apply`}>Liste übernehmen</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setDraft(""); setError(""); onChange([]); }} data-testid={`${testId}-clear`}>Liste leeren</Button>
        </div>
        <p className="text-xs text-slate-500" data-testid={`${testId}-active`}>{value.length ? `${value.length} Liefernummern aktiv · exakte Treffer · innerhalb der Liste „oder“` : "Keine Liefernummernliste aktiv."}</p>
      </PopoverContent>
    </Popover>
    {value.length > 0 && <div className="mt-1 flex items-start justify-between gap-1 text-xs text-slate-600" data-testid={`${testId}-summary`}>
      <span className="break-words">{value.slice(0, 4).join(", ")}{value.length > 4 ? ` und ${value.length - 4} weitere` : ""}</span>
      <button type="button" className="shrink-0 underline" onClick={() => onChange([])} aria-label="Liefernummernfilter löschen">Löschen</button>
    </div>}
  </div>;
}
