import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Wrench } from "lucide-react";
import type { MaintenanceStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_MESSAGE = "Wir führen gerade Wartungsarbeiten durch. Bitte versuchen Sie es später erneut.";

function readConfig(value?: string): MaintenanceStatus {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<MaintenanceStatus>;
    if (typeof parsed.enabled === "boolean" && typeof parsed.message === "string") return parsed as MaintenanceStatus;
  } catch { /* A missing setting starts with maintenance disabled. */ }
  return { enabled: false, message: DEFAULT_MESSAGE };
}

export function MaintenanceModeCard({
  value,
  onSave,
  isSaving,
}: {
  value?: string;
  onSave: (key: string, value: string) => void;
  isSaving: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [error, setError] = useState("");
  const saved = readConfig(value);
  const hasUnsavedChanges = enabled !== saved.enabled || message !== saved.message;

  useEffect(() => {
    const config = readConfig(value);
    setEnabled(config.enabled);
    setMessage(config.message);
    setError("");
  }, [value]);

  const save = () => {
    const trimmed = message.trim();
    if (!trimmed) { setError("Bitte einen Hinweistext eingeben."); return; }
    if (trimmed.length > 1000) { setError("Der Hinweistext darf höchstens 1.000 Zeichen haben."); return; }
    setError("");
    onSave("maintenance_mode", JSON.stringify({ enabled, message: trimmed }));
  };

  return (
    <Card className="shadow-sm" data-testid="card-maintenance-mode">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Wartungsmodus</CardTitle>
          </div>
          <Badge variant={hasUnsavedChanges ? "outline" : enabled ? "destructive" : "secondary"} data-testid="badge-maintenance-status">
            {hasUnsavedChanges ? "Änderungen nicht gespeichert" : enabled ? <><AlertTriangle className="mr-1 h-3.5 w-3.5" />Aktiv</> : <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Inaktiv</>}
          </Badge>
        </div>
        <CardDescription>
          Aktiviert eine Wartungsseite für normale Nutzer und blockiert geschützte API-Zugriffe. COMET-Admins behalten den vollen Zugriff. Öffentliche Scanner und freigeschaltete Stempeluhrterminals funktionieren weiter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="maintenance-enabled" className="font-medium">Wartungsmodus aktivieren</Label>
            <p className="mt-1 text-xs text-slate-500">Die Änderung wird nach dem Speichern wirksam.</p>
          </div>
          <Switch id="maintenance-enabled" checked={enabled} onCheckedChange={setEnabled} data-testid="switch-maintenance-enabled" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance-message">Hinweis für normale Nutzer</Label>
          <Textarea id="maintenance-message" value={message} maxLength={1000} rows={4} onChange={(e) => setMessage(e.target.value)} data-testid="input-maintenance-message" />
          <p className="text-right text-xs text-slate-500">{message.length}/1.000</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" />
          <p>Die Sperre gilt auch für API-Anfragen und bestehende Sitzungen. Anmeldung, Passwortänderung, öffentliche Scanner und die Gerätefreigabe der Stempeluhr bleiben verfügbar. Admins können die Wartung jederzeit hier beenden.</p>
        </div>
        <Button onClick={save} disabled={isSaving} data-testid="button-save-maintenance">{isSaving ? "Speichern …" : "Wartungseinstellung speichern"}</Button>
      </CardContent>
    </Card>
  );
}
