import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Maximize2, Minimize2, MousePointer2, Radio, ScreenShare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveInteractiveFrame } from "./live-interactive-frame";
import { SourceControlBanner, ViewerControl } from "./live-control";
import type { LiveViewController } from "@/hooks/use-live-view";
import { useLiveFullscreen } from "@/hooks/use-live-fullscreen";

export function LiveViewPanel({ controller }: { controller: LiveViewController }) {
  const { status, targets, target, watchers, frame, pointer, error, connected, start, stop, stopSharing, configure } = controller;
  const [open, setOpen] = useState(false);
  const { fullscreen, enterFullscreen, exitFullscreen } = useLiveFullscreen(open, !!target);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [localAt, setLocalAt] = useState(0);
  const banner = useRef<HTMLDivElement>(null);
  const sharing = watchers.length > 0;

  useEffect(() => {
    const element = banner.current;
    const root = document.documentElement;
    if (!sharing || !element) { root.style.removeProperty("--live-view-banner-height"); return; }
    const measure = () => root.style.setProperty("--live-view-banner-height", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); root.style.removeProperty("--live-view-banner-height"); };
  }, [sharing]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (frame) setLocalAt(Date.now()); }, [frame]);
  const stale = !!frame && now - localAt > 5000;
  const remotePointer = controller.remotePointer;
  const controlled = watchers.some(w => w.control?.state === "active");
  const canUse = status.canView || status.canManage;

  const safe = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch { /* hook state keeps the UI consistent */ } finally { setBusy(false); }
  };

  return (
    <div data-live-view-ui>
      {watchers.length > 0 && (
        <div ref={banner} data-testid="live-view-source-banner" role="status"
          className="fixed top-0 inset-x-0 z-[100] flex flex-wrap items-center gap-x-3 gap-y-1 bg-destructive text-destructive-foreground px-3 py-2 text-sm shadow">
          <Radio className="h-4 w-4 animate-pulse shrink-0" />
          <span className="font-medium">Ihre Ansicht wird live übertragen</span>
          <span data-testid="text-live-watchers" className="opacity-90">an: {watchers.map(w => w.username).join(", ")}</span>
          {!connected && <span data-testid="text-live-reconnect" className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verbindung wird wiederhergestellt…</span>}
          <Button size="sm" variant="secondary" className="ml-auto h-7" data-testid="button-live-stop-sharing"
            onClick={() => void safe(stopSharing)}>Freigabe beenden</Button>
          <div className="basis-full -mx-3 -mb-2"><SourceControlBanner controller={controller} busy={busy} safe={safe} /></div>
        </div>
      )}

      {controlled && remotePointer && (
        <MousePointer2 data-live-view-ui data-testid="live-remote-cursor" aria-hidden
          className="fixed z-[110] pointer-events-none h-5 w-5 text-amber-500 fill-amber-200"
          style={{ left: remotePointer.x, top: remotePointer.y }} />
      )}

      {canUse && (
        <>
          <Button variant="outline" size="icon" data-testid="button-live-open"
            title="Liveansicht öffnen" aria-label="Liveansicht öffnen"
            className="relative h-10 w-10 shrink-0 rounded-full shadow-lg" onClick={() => setOpen(true)}>
            <ScreenShare className="h-4 w-4" />
            {target && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent data-live-view-ui data-live={controller.control.state === "active" ? "on" : "off"}
              data-testid="dialog-live-view" data-fullscreen={fullscreen ? "true" : "false"}
              style={fullscreen ? {
                top: "var(--live-view-banner-height, 0px)",
                height: "calc(100dvh - var(--live-view-banner-height, 0px))",
              } : undefined}
              onEscapeKeyDown={event => {
                if (fullscreen) { event.preventDefault(); exitFullscreen(); }
              }}
              className={fullscreen
                ? "left-0 top-0 translate-x-0 translate-y-0 max-w-none w-screen h-[100dvh] max-h-none rounded-none sm:rounded-none flex flex-col overflow-hidden p-3 sm:p-4"
                : "max-w-4xl data-[live=on]:max-w-[96vw] w-[calc(100vw-1rem)] max-h-[96dvh] overflow-y-auto p-4 sm:p-6"}>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pr-7">
                  <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Liveansicht</DialogTitle>
                  {target && (
                    <Button variant="outline" size="sm" data-testid="button-live-fullscreen"
                      aria-pressed={fullscreen}
                      title={fullscreen ? "Vollbild verlassen (Esc)" : "Liveansicht im Vollbild anzeigen"}
                      onClick={() => fullscreen ? exitFullscreen() : void enterFullscreen()}>
                      {fullscreen ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                      {fullscreen ? "Vollbild verlassen" : "Vollbild"}
                    </Button>
                  )}
                </div>
                <DialogDescription className={fullscreen ? "sr-only" : undefined}>Mitansicht der App eines angemeldeten Nutzers. Ohne Freigabe schreibgeschützt, mit Freigabe direkte Appsteuerung.</DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge data-testid="status-live-connection" variant={connected ? "secondary" : "destructive"}>
                  {connected ? "Verbunden" : "Getrennt – verbinde neu…"}
                </Badge>
                <Badge data-testid="status-live-enabled" variant="outline">{status.enabled ? "Aktiviert" : "Deaktiviert"}</Badge>
              </div>

              {status.canManage && !fullscreen && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="live-enabled">Liveansicht aktivieren</Label>
                  <Switch id="live-enabled" data-testid="switch-live-enabled" checked={status.enabled}
                    onCheckedChange={v => void safe(() => configure(v))} />
                </div>
              )}

              {error && <p data-testid="text-live-error" className="text-sm text-destructive rounded-md border border-destructive/40 p-2">{error}</p>}

              {!status.enabled ? (
                <p data-testid="text-live-disabled" className="text-sm text-muted-foreground">
                  Die Liveansicht ist ausgeschaltet.{status.canManage ? " Aktivieren Sie sie oben, um Sitzungen zu beobachten." : " Ein Administrator muss sie zuerst aktivieren."}
                </p>
              ) : !target ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger data-testid="select-live-target" className="flex-1">
                      <SelectValue placeholder={targets.length ? "Sitzung auswählen" : "Keine Sitzung online"} />
                    </SelectTrigger>
                    <SelectContent data-live-view-ui>
                      {targets.map(t => (
                        <SelectItem key={t.socketId} value={t.socketId}>{t.username} – {t.page}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button data-testid="button-live-start" disabled={!selected || busy || !connected}
                    onClick={() => void safe(() => start(selected))}>Starten</Button>
                </div>
              ) : (
                <div className={fullscreen ? "flex flex-1 min-h-0 flex-col gap-3" : "space-y-3"}>
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="text-sm" data-testid="text-live-target">
                      <span className="font-medium">{target.username}</span>
                      <span className="text-muted-foreground"> · {frame?.page ?? target.page}</span>
                    </div>
                    <Button size="sm" variant="outline" data-testid="button-live-stop" disabled={busy}
                      onClick={() => void safe(stop)}>Beenden</Button>
                  </div>
                  <LiveInteractiveFrame frame={frame} stale={stale} connected={connected}
                    active={controller.control.state === "active"} pointer={pointer}
                    sendCommand={controller.sendCommand}
                    onExitFullscreen={fullscreen ? exitFullscreen : undefined}
                    className={fullscreen ? "flex-1 min-h-0" : controller.control.state === "active" ? "h-[60dvh] min-h-72" : "aspect-video"} />
                  <div className={fullscreen ? "shrink-0 max-h-[25dvh] overflow-y-auto" : undefined}>
                    <ViewerControl key={`${target.socketId}:${frame?.surface?.page ?? ""}`} controller={controller} busy={busy} safe={safe} stale={stale} />
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
