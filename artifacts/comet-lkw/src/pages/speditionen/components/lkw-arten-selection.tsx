import { useLkwArten } from "@/hooks/use-lkw-arten";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function LkwArtenSelection({ value, onChange, enabled }: {
  value: number[] | null;
  onChange: (value: number[] | null) => void;
  enabled: boolean;
}) {
  const { data, isLoading, isError } = useLkwArten(enabled);
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Erlaubte LKW-Arten</legend>
      <p className="text-xs text-slate-500">
        Gilt für die Benutzer dieser Spedition, auch beim Anlegen für freigegebene Speditionen. COMET-Mitarbeiter bleiben uneingeschränkt.
      </p>
      <Label className="flex items-center gap-2">
        <Checkbox checked={value === null} onCheckedChange={(checked) => onChange(checked ? null : (data ?? []).filter((type) => type.aktiv).map((type) => type.id))} />
        Alle aktiven LKW-Arten erlauben
      </Label>
      {isLoading && <p className="text-xs text-slate-500">LKW-Arten werden geladen …</p>}
      {isError && <p role="alert" className="text-xs text-red-600">LKW-Arten konnten nicht geladen werden.</p>}
      {value !== null && (
        <div className="max-h-40 overflow-y-auto space-y-2">
          {data?.map((type) => (
            <Label key={type.id} className="flex items-center gap-2">
              <Checkbox checked={value.includes(type.id)} onCheckedChange={(checked) => onChange(checked ? [...new Set([...value, type.id])] : value.filter((id) => id !== type.id))} />
              {type.name}{!type.aktiv && " (inaktiv)"}
            </Label>
          ))}
          <p className="text-xs text-slate-500">Ohne Auswahl ist keine LKW-Art erlaubt. Neue Arten werden nicht automatisch freigegeben.</p>
        </div>
      )}
    </fieldset>
  );
}
