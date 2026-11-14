import { Loader2 } from "lucide-react";

interface Props {
  shipmentId: number;
  label: string;
  field: string;
  value: string;
  options: readonly string[];
  allowEmpty?: boolean;
  disabled: boolean;
  saving: boolean;
  className?: string;
  onChange: (value: string) => void;
}

/** Native selects keep keyboard support and do not bubble portal events into the row drawer. */
export function InlineShipmentSelect({
  shipmentId, label, field, value, options, allowEmpty, disabled, saving, className, onChange,
}: Props) {
  const choices = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex items-center gap-1" onClick={event => event.stopPropagation()}>
      <select
        aria-label={`${label} für Verladung ${shipmentId}`}
        aria-busy={saving}
        data-testid={`inline-${field}-${shipmentId}`}
        className={`h-8 max-w-full rounded-md border px-2 pr-6 text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-wait ${className ?? "bg-white"}`}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      >
        {allowEmpty && <option value="">Kein Tor</option>}
        {choices.map(option => <option key={option} value={option} disabled={field === "status" && option === "Erwartet"}>{option}</option>)}
      </select>
      {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" aria-label="Wird gespeichert" />}
    </div>
  );
}
