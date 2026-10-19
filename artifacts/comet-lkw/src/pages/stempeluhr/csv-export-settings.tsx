import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CLOCK_CSV_KEY, CSV_FIELDS, defaultClockCsvConfig, legacyClockCsvConfig, parseClockCsvConfig, validateClockCsvConfig, type ClockCsvConfig } from "./csv-export";
import { errMsg, sel } from "./lib";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export function useClockCsvPreferences(enabled: boolean) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ["clock-csv-preferences", user?.id];
  const query = useQuery({
    queryKey: key, enabled: enabled && !!user, staleTime: 0, refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch(`${API}/user-preferences/${CLOCK_CSV_KEY}`, { credentials: "include", cache: "no-store" });
      if (response.status === 404) return defaultClockCsvConfig();
      if (!response.ok) throw new Error("CSV-Einstellungen konnten nicht geladen werden.");
      const data = await response.json();
      return parseClockCsvConfig(data.value);
    },
  });
  const save = useMutation({
    mutationFn: async (value: ClockCsvConfig) => {
      const config = parseClockCsvConfig(value);
      const response = await fetch(`${API}/user-preferences/${CLOCK_CSV_KEY}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: config }),
      });
      if (!response.ok) throw new Error("CSV-Einstellungen konnten nicht gespeichert werden.");
      return config;
    },
    onSuccess: (value) => { client.setQueryData(key, value); },
  });
  return { query, save };
}

export function CsvExportSettings({ config, onSave, saving }: {
  config: ClockCsvConfig; onSave: (config: ClockCsvConfig) => Promise<unknown>; saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const move = (index: number, offset: number) => {
    const columns = [...draft.columns];
    [columns[index], columns[index + offset]] = [columns[index + offset], columns[index]];
    setDraft({ ...draft, columns });
  };
  const submit = async () => {
    const invalid = validateClockCsvConfig(draft);
    if (invalid) { setError(invalid); return; }
    setError("");
    try {
      await onSave(draft);
      setOpen(false);
      toast({ title: "CSV-Spalten gespeichert", description: "Die Auswahl gilt für dein Benutzerkonto." });
    } catch (e) { setError(errMsg(e)); }
  };
  return <>
    <Button variant="outline" onClick={() => { setDraft(structuredClone(config)); setError(""); setOpen(true); }} data-testid="button-csv-settings">
      <Settings2 className="mr-1 h-4 w-4" />CSV-Spalten
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>CSV-Spalten einstellen</DialogTitle>
          <DialogDescription>Spalten auswählen, Überschriften ändern und mit den Pfeilen sortieren. Gespeichert für dein Benutzerkonto; der Download berücksichtigt weiterhin den gewählten Zeitraum und die Filter.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
          <p className="text-xs text-slate-600">Arbeitsbeginn/-ende sind die gebuchten Zeiten in Berlin, inklusive Datum. Gesamtarbeitszeit = Bruttozeit, Pausenzeit = Pausenabzug, Arbeitszeit = Nettozeit. Offene Buchungen haben noch keine End- oder Gesamtzeiten.</p>
          <label className="block text-sm font-medium">Format der Arbeits- und Pausenzeiten
            <select className={`${sel} mt-1`} value={draft.durationFormat} disabled={saving} onChange={(e) => setDraft({ ...draft, durationFormat: e.target.value as ClockCsvConfig["durationFormat"] })} data-testid="select-csv-duration-format">
              <option value="hhmm">Stunden:Minuten (z. B. 8:30)</option>
              <option value="minutes">Minuten (z. B. 510)</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={saving} onClick={() => { setDraft(defaultClockCsvConfig()); setError(""); }}>Neun Standardspalten</Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => { setDraft(legacyClockCsvConfig()); setError(""); }}>Bisheriger vollständiger Export</Button>
          </div>
          <div className="space-y-2">
            {draft.columns.map((column, i) => <div key={column.id} className="flex items-center gap-2 rounded-md border p-2">
              <Checkbox id={`csv-${column.id}`} checked={column.enabled} disabled={saving} onCheckedChange={(checked) => setDraft({ ...draft, columns: draft.columns.map((c) => c.id === column.id ? { ...c, enabled: checked === true } : c) })} aria-label={`${CSV_FIELDS.find(([id]) => id === column.id)![1]} exportieren`} />
              <div className="min-w-0 flex-1">
                <label htmlFor={`csv-header-${column.id}`} className="mb-1 block text-xs text-slate-500">{CSV_FIELDS.find(([id]) => id === column.id)![1]}</label>
                <Input id={`csv-header-${column.id}`} value={column.header} disabled={!column.enabled || saving} maxLength={100}
                  onChange={(e) => setDraft({ ...draft, columns: draft.columns.map((c) => c.id === column.id ? { ...c, header: e.target.value } : c) })}
                  aria-label={`Überschrift für ${CSV_FIELDS.find(([id]) => id === column.id)![1]}`} />
              </div>
              <Button size="icon" variant="ghost" disabled={i === 0 || saving} onClick={() => move(i, -1)} aria-label={`${column.header} nach oben`}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" disabled={i === draft.columns.length - 1 || saving} onClick={() => move(i, 1)} aria-label={`${column.header} nach unten`}><ArrowDown className="h-4 w-4" /></Button>
            </div>)}
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-xs break-words" data-testid="csv-header-preview">
            <strong>Vorschau der Kopfzeile:</strong><p className="mt-1">{draft.columns.filter((c) => c.enabled).map((c) => c.header).join("; ") || "Keine Spalten ausgewählt"}</p>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button disabled={saving} onClick={submit} data-testid="button-save-csv-settings">{saving ? "Speichern …" : "Spalten speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
