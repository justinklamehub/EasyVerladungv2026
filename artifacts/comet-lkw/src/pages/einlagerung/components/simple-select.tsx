import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all";
export function SimpleSelect({ value, onChange, options, allLabel, placeholder, testId, className }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string; placeholder?: string; testId?: string; className?: string;
}) {
  return (
    <Select value={value === "" && allLabel ? ALL : value} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className={className} data-testid={testId}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent position="popper" sideOffset={4}
        style={{ maxHeight: "min(18rem, var(--radix-select-content-available-height))" }}>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
