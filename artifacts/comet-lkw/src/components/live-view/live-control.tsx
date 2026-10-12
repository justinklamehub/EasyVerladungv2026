import { useEffect, useState } from "react";
import { Hand, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LiveViewController } from "@/hooks/use-live-view";

type Safe = (fn: () => Promise<unknown>) => Promise<void>;
const EMPTY = "__empty__";
function useCountdownClock(pending: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!pending) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pending]);
  return now;
}

export function SourceControlBanner({ controller, busy, safe }: { controller: LiveViewController; busy: boolean; safe: Safe }) {
  const { watchers, respondControl, stopControl } = controller;
  const pending = watchers.filter(w => w.control?.state === "pending" && w.control.requestId);
  const active = watchers.filter(w => w.control?.state === "active" && w.control.requestId);
  const now = useCountdownClock(pending.length > 0);
  return (
    <>
      {pending.map(w => (
        <div key={w.socketId} data-testid="live-control-consent" role="alertdialog"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 text-amber-950 px-3 py-2 text-sm border-t border-amber-300">
          <Hand className="h-4 w-4 shrink-0" />
          <span className="font-medium" data-testid="text-live-control-requester">{w.username} möchte Ihre Ansicht steuern</span>
          <span className="opacity-80">Volle Appsteuerung per Maus, Klick und Tastatur, inklusive Bearbeiten, Speichern und Löschen, mit Ihren Rechten. Maximal 15 Minuten.</span>
          <span className="font-semibold" data-testid="text-live-control-countdown">
            Automatische Übernahme in {Math.max(0, Math.ceil(((w.control!.countdownEndsAt ?? now) - now) / 1000))} Sekunden.
            Sie können die Anfrage ablehnen.
          </span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" className="h-7" data-testid="button-live-control-accept" disabled={busy}
              onClick={() => void safe(() => respondControl(w.control!.requestId!, true))}>Jetzt erlauben</Button>
            <Button size="sm" variant="outline" className="h-7" data-testid="button-live-control-reject" disabled={busy}
              onClick={() => void safe(() => respondControl(w.control!.requestId!, false))}>Ablehnen</Button>
          </span>
        </div>
      ))}
      {active.map(w => (
        <div key={w.socketId} data-testid="live-control-active-source"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 text-amber-950 px-3 py-2 text-sm border-t border-amber-300">
          <Hand className="h-4 w-4 shrink-0" />
          <span className="font-medium" data-testid="text-live-control-active">Steuerung durch {w.username}</span>
          <span className="opacity-80">Volle Appsteuerung mit Ihren Rechten, inkl. Bearbeiten, Speichern, Löschen.</span>
          <Button size="sm" variant="secondary" className="ml-auto h-7" data-testid="button-live-control-stop-source" disabled={busy}
            onClick={() => void safe(() => stopControl(w.control!.requestId!))}>Steuerung beenden</Button>
        </div>
      ))}
    </>
  );
}

export function ViewerControl({ controller, busy, safe, stale }: { controller: LiveViewController; busy: boolean; safe: Safe; stale: boolean }) {
  const { status, target, frame, connected, control, requestControl, stopControl, sendCommand } = controller;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const now = useCountdownClock(control.state === "pending");
  if (!status.canControl || !target) return null;
  const surface = frame?.surface;
  const fresh = !!frame && !stale && connected;

  if (control.state === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
        {control.reason && <p role="status" className="basis-full text-xs text-muted-foreground">{control.reason}</p>}
        <p className="text-xs text-muted-foreground flex-1 min-w-48">
          Volle Appsteuerung (Maus, Klick, Tastatur) inklusive Bearbeiten, Speichern und Löschen, mit den Rechten des Benutzers, höchstens 15 Minuten.
          Automatische Übernahme nach 15 Sekunden, sofern der Benutzer nicht ablehnt.
        </p>
        <Button size="sm" data-testid="button-live-control-request" disabled={!fresh || busy}
          onClick={() => void safe(requestControl)}><Hand className="h-4 w-4 mr-1" />Steuerung anfragen</Button>
      </div>
    );
  }
  if (control.state === "pending") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
        <p data-testid="text-live-control-pending" className="text-sm flex-1">
          {target.username} kann die Anfrage ablehnen. Automatische Übernahme in{" "}
          {Math.max(0, Math.ceil(((control.countdownEndsAt ?? now) - now) / 1000))} Sekunden …
        </p>
        <Button size="sm" variant="outline" data-testid="button-live-control-cancel" disabled={busy}
          onClick={() => void safe(() => stopControl(control.requestId))}>Anfrage abbrechen</Button>
      </div>
    );
  }
  const ok = fresh && !busy && !!surface;
  const send = (c: Parameters<typeof sendCommand>[0]) => void safe(() => sendCommand(c));
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="live-control-active">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Sie steuern die Ansicht von {target.username}</span>
        <Button size="sm" variant="destructive" data-testid="button-live-control-stop" disabled={busy}
          onClick={() => void safe(() => stopControl(control.requestId))}>Steuerung beenden</Button>
      </div>
      <div data-testid="text-live-control-usage" className="rounded-md border border-amber-300 bg-amber-100 text-amber-950 p-2 text-xs space-y-1">
        <p className="font-medium">Direkte Steuerung aktiv: Aktionen wirken sofort mit den Rechten von {target.username}, auch Bearbeiten, Speichern und Löschen.</p>
        <p>Unterstützt: Klick, Doppelklick, Rechtsklick, Texteingabe, Tastatur und Scrollen im Bild. Nicht möglich: Betriebssystem- und Browserdialoge, Passwörter, private Chats.</p>
      </div>
      <p className="text-xs text-muted-foreground">Weitere Schnellaktionen (Navigation, Filter):</p>
      {!surface ? (
        <p className="text-xs text-muted-foreground">Auf dieser Seite sind keine Aktionen freigegeben.</p>
      ) : (
        <div className="space-y-3">
          {surface.navigation.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Seite</Label>
              <Select disabled={!ok} value={surface.navigation.some(n => n.path === surface.page) ? surface.page : ""}
                onValueChange={path => send({ kind: "navigate", page: surface.page, path })}>
                <SelectTrigger data-testid="select-live-control-page"><SelectValue placeholder="Seite wählen" /></SelectTrigger>
                <SelectContent data-live-view-ui>
                  {surface.navigation.map(n => <SelectItem key={n.path} value={n.path}>{n.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {surface.filters.map(f => {
            const value = drafts[f.id] ?? f.value;
            const apply = () => {
              send({ kind: "filter", page: surface.page, id: f.id, value });
              setDrafts(d => { const { [f.id]: _x, ...rest } = d; return rest; });
            };
            return (
              <div key={f.id} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <div className="flex gap-2">
                  {f.kind === "select" ? (
                    <Select disabled={!ok} value={value === "" ? EMPTY : value}
                      onValueChange={v => setDrafts(d => ({ ...d, [f.id]: v === EMPTY ? "" : v }))}>
                      <SelectTrigger data-testid={`select-live-filter-${f.id}`} className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent data-live-view-ui>
                        {(f.options ?? []).map(o => <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={f.kind === "date" ? "date" : "text"} maxLength={200} disabled={!ok} value={value}
                      data-testid={`input-live-filter-${f.id}`} className="flex-1"
                      onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter" && ok && value !== f.value) apply(); }} />
                  )}
                  <Button size="sm" variant="secondary" data-testid={`button-live-filter-apply-${f.id}`}
                    disabled={!ok || value === f.value} onClick={apply}><Check className="h-4 w-4 mr-1" />Anwenden</Button>
                </div>
              </div>
            );
          })}
          {surface.scrollable && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" data-testid="button-live-scroll-up" disabled={!ok}
                onClick={() => send({ kind: "scroll", page: surface.page, delta: -400 })}><ArrowUp className="h-4 w-4 mr-1" />Hoch</Button>
              <Button size="sm" variant="outline" data-testid="button-live-scroll-down" disabled={!ok}
                onClick={() => send({ kind: "scroll", page: surface.page, delta: 400 })}><ArrowDown className="h-4 w-4 mr-1" />Runter</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
