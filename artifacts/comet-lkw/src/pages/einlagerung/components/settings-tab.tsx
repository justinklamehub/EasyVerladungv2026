import { useEffect, useState } from "react";
import { useUpdateEinlagerungSettings } from "@workspace/api-client-react";
import type { EinlagerungState } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRefreshEinlagerung } from "../use-einlagerung";
import { errMsg } from "../lib";

export function SettingsTab({ state }: { state: EinlagerungState }) {
  const [hideFull, setHideFull] = useState(state.settings.hideFull);
  const [hours, setHours] = useState(String(state.settings.staleHours));
  const [colors, setColors] = useState(state.settings.colors);
  const m = useUpdateEinlagerungSettings();
  const refresh = useRefreshEinlagerung();
  const { toast } = useToast();
  useEffect(() => { setHideFull(state.settings.hideFull); setHours(String(state.settings.staleHours)); setColors(state.settings.colors); },
    [state.settings.hideFull, state.settings.staleHours, state.settings.colors.free, state.settings.colors.occupied, state.settings.colors.full]);

  const save = () => {
    const n = Number(hours);
    if (!Number.isInteger(n) || n < 1 || n > 8760) { toast({ title: "Veraltet-Schwelle muss zwischen 1 und 8760 Stunden liegen", variant: "destructive" }); return; }
    if (Object.values(colors).some((c) => !/^#[0-9a-fA-F]{6}$/.test(c))) {
      toast({ title: "Bitte gültige Farben im Format #RRGGBB eingeben", variant: "destructive" }); return;
    }
    m.mutate({ data: { hideFull, staleHours: n, profiles: state.settings.profiles, colors } }, {
      onSuccess: () => { toast({ title: "Einstellungen gespeichert" }); refresh(); },
      onError: (e) => toast({ title: "Speichern fehlgeschlagen", description: errMsg(e), variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <div><Label htmlFor="s-hf">Volle Regale ausblenden</Label><p className="text-xs text-slate-500">Standard für Lagerplan und Vorschläge.</p></div>
          <Switch id="s-hf" checked={hideFull} onCheckedChange={setHideFull} data-testid="switch-settings-hide-full" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-h">Daten gelten als veraltet nach (Stunden)</Label>
          <Input id="s-h" type="number" min={1} max={8760} value={hours} onChange={(e) => setHours(e.target.value)} className="max-w-[10rem]" data-testid="input-stale-hours" />
        </div>
        <div className="space-y-2 border-t pt-4">
          <div><span className="text-sm font-medium">Farben der Lagerübersicht</span><p className="text-xs text-slate-500">Hintergrundfarbe der Regalkacheln nach Status.</p></div>
          {([{ key: "free", label: "Frei" }, { key: "occupied", label: "Belegt" }, { key: "full", label: "Voll" }] as const).map(({ key, label }) =>
            <div key={key} className="flex items-center gap-3">
              <Label htmlFor={`color-${key}`} className="w-16 shrink-0">{label}</Label>
              <input type="color" aria-label={`${label} auswählen`} value={/^#[0-9a-fA-F]{6}$/.test(colors[key]) ? colors[key] : "#ffffff"}
                onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-9 w-12 rounded border border-input bg-transparent p-1 cursor-pointer" data-testid={`picker-color-${key}`} />
              <Input id={`color-${key}`} value={colors[key]} maxLength={7} onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-28 font-mono" data-testid={`input-color-${key}`} />
            </div>)}
        </div>
        <Button onClick={save} disabled={m.isPending} data-testid="button-save-settings">{m.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Speichern</Button>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-900">Verlauf</div>
        {state.events.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Noch keine Ereignisse.</p> : (
          <div className="overflow-x-auto">
            <Table className="app-table">
              <TableHeader><TableRow><TableHead>Zeit</TableHead><TableHead>Benutzer</TableHead><TableHead>Aktion</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
              <TableBody>{state.events.map((e) => (
                <TableRow key={e.id} data-testid={`row-event-${e.id}`}>
                  <TableCell className="whitespace-nowrap">{format(new Date(e.createdAt), "dd.MM.yyyy HH:mm")}</TableCell>
                  <TableCell>{e.username}</TableCell><TableCell className="font-medium">{e.action}</TableCell><TableCell className="text-slate-600">{e.detail}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
