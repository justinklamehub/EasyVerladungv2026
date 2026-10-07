import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface OrderFilterOption { value: string; label: string; count?: number }

const CUSTOM = "__text__:";
function customText_(options: OrderFilterOption[], q: string) {
  const k = q.trim().toLowerCase();
  return k ? options.find((o) => o.value.toLowerCase() === k || o.label.toLowerCase() === k) : undefined;
}

export function OrderMultiFilter({ label, value, onChange, options, allowCustom = false, testId, disabled }: {
  label: string; value: string[]; onChange: (value: string[]) => void;
  options: OrderFilterOption[]; allowCustom?: boolean; testId: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const norm = (s: string) => s.trim().toLowerCase();
  const selectedKeys = useMemo(() => new Set(value.map(norm)), [value]);
  const term = norm(search);

  const filtered = useMemo(
    () => options.filter((o) => !term || o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term)),
    [options, term],
  );
  const labelOf = (v: string) => v.startsWith(CUSTOM) ? v.slice(CUSTOM.length)
    : options.find((o) => norm(o.value) === norm(v))?.label ?? v;

  const toggle = (v: string) => {
    if (selectedKeys.has(norm(v))) onChange(value.filter((x) => norm(x) !== norm(v)));
    else onChange([...value, v]);
  };
  const customText = search.trim();
  const exact = customText_(options, search);
  const canAdd = allowCustom && !!search.trim() && !value.some((x) => {
    const k = norm(x.startsWith(CUSTOM) ? x.slice(CUSTOM.length) : x);
    return k === norm(search) || (!!exact && norm(x) === norm(exact.value));
  });
  const addCustom = () => {
    if (!canAdd) return;
    onChange([...value, exact ? exact.value : CUSTOM + customText]);
    setSearch("");
  };

  return (
    <div className="min-w-0" data-testid={testId}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled} aria-label={`${label} filtern`}
            className="w-full justify-between font-normal px-3" data-testid={`${testId}-trigger`}>
            <span className="truncate text-left">
              {value.length === 0 ? <span className="text-muted-foreground">{label}</span>
                : value.length === 1 ? labelOf(value[0]) : `${label} (${value.length})`}
            </span>
            <ChevronDown className="w-4 h-4 ml-2 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2 space-y-2" data-testid={`${testId}-content`}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${label} suchen`}
            aria-label={`${label} durchsuchen`} data-testid={`${testId}-search`}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addCustom(); }
            }} />
          {canAdd && (
            <Button type="button" variant="outline" size="sm" className="w-full justify-start"
              onClick={addCustom} data-testid={`${testId}-add-custom`}>
              <Plus className="w-4 h-4 mr-2" /><span className="truncate">„{exact ? exact.label : customText}“ {exact ? "auswählen" : "als Text hinzufügen"}</span>
            </Button>
          )}
          <div role="group" aria-label={label} className="max-h-60 overflow-y-auto -mx-1 px-1" data-testid={`${testId}-list`}>
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500" data-testid={`${testId}-empty`}>Keine Treffer.</p>
            ) : filtered.map((o, i) => {
              const checked = selectedKeys.has(norm(o.value));
              const id = `${testId}-opt-${i}`;
              return (
                <label key={o.value} htmlFor={id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                  <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(o.value)} data-testid={id} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && <span className="text-xs text-slate-500 tabular-nums">{o.count}</span>}
                </label>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-xs text-slate-500 flex items-center"><Check className="w-3 h-3 mr-1" />{value.length} gewählt</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} data-testid={`${testId}-clear`}>
                Auswahl löschen
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1 mt-1" aria-label={`${label} ausgewählt`}>
          {value.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 pl-2 pr-0.5 text-xs max-w-full">
              <span className="truncate">{labelOf(v)}</span>
              <button type="button" disabled={disabled} aria-label={`${labelOf(v)} entfernen`}
                className="p-0.5 rounded hover:bg-slate-200" onClick={() => toggle(v)}
                data-testid={`${testId}-remove-${v}`}>
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
