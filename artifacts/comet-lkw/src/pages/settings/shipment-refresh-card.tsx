import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SHIPMENT_REFRESH_KEY, SHIPMENT_REFRESH_MIN, SHIPMENT_REFRESH_MAX, resolveShipmentRefreshSeconds, parseShipmentRefreshSeconds } from "@workspace/api-zod/shipment-refresh";

export function ShipmentRefreshCard({ value, onSave, isSaving }: {
  value?: string; onSave: (key: string, value: string) => void; isSaving: boolean;
}) {
  const saved = String(resolveShipmentRefreshSeconds(value));
  const [local, setLocal] = useState(saved);
  useEffect(() => { setLocal(saved); }, [saved]);
  let error = "";
  try { parseShipmentRefreshSeconds(local); } catch (e) { error = (e as Error).message; }
  return <Card className="shadow-sm">
    <CardHeader>
      <CardTitle className="text-base">Automatische Aktualisierung der LKW-Übersicht</CardTitle>
      <CardDescription>Gilt global für alle Benutzer, einschließlich Monitor, in Tabellen- und Kartenansicht. Die Echtzeit-Aktualisierung bleibt zusätzlich aktiv.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <Label htmlFor="shipment-refresh-seconds">Aktualisierungsintervall in Sekunden</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Input id="shipment-refresh-seconds" type="number" min={SHIPMENT_REFRESH_MIN} max={SHIPMENT_REFRESH_MAX} step={1}
          value={local} onChange={(e) => setLocal(e.target.value)} className="w-36"
          aria-invalid={!!error} aria-describedby="shipment-refresh-help" disabled={isSaving} />
        <Button type="button" disabled={isSaving || !!error || local === saved}
          onClick={() => onSave(SHIPMENT_REFRESH_KEY, String(parseShipmentRefreshSeconds(local)))}>
          {isSaving ? "Wird gespeichert …" : "Speichern"}
        </Button>
      </div>
      <p id="shipment-refresh-help" className="text-xs text-slate-500">5–3600 Sekunden (maximal 60 Minuten). Standard: 30 Sekunden. Bereits geöffnete Übersichten übernehmen Änderungen automatisch, ohne Echtzeit-Verbindung spätestens nach etwa 30 Sekunden. Filter und Eingaben bleiben erhalten.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </CardContent>
  </Card>;
}
