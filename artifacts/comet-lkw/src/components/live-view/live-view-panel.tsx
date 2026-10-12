import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, MousePointer2, Radio, ScreenShare, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { snapshotDocument } from "@/lib/live-view-snapshot";
import type { LiveViewController } from "@/hooks/use-live-view";

export function LiveViewPanel({ controller }: { controller: LiveViewController }) {
  const { status, targets, target, watchers, frame, pointer, error, connected, start, stop, stopSharing, configure } = controller;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [localAt, setLocalAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (frame) setLocalAt(Date.now()); }, [frame]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [target, open]);

  const doc = useMemo(() => {
    if (!frame) return "";
    try { return snapshotDocument(frame.html); } catch { return ""; }
  }, [frame]);
  const stale = !!frame && now - localAt > 5000;
  const scale = frame && size.w && size.h ? Math.min(size.w / frame.width, size.h / frame.height) : 0;
  const canUse = status.canView || status.canManage;

  const safe = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch { /* hook state keeps the UI consistent */ } finally { setBusy(false); }
  };

  return (
    <div data-live-view-ui>
      {watchers.length > 0 && (
        <div data-testid="live-view-source-banner" role="status"
          className="fixed top-0 inset-x-0 z-[100] flex flex-wrap items-center gap-x-3 gap-y-1 bg-destructive text-destructive-foreground px-3 py-2 text-sm shadow">
          <Radio className="h-4 w-4 animate-pulse shrink-0" />
          <span className="font-medium">Ihre Ansicht wird live übertragen</span>
          <span data-testid="text-live-watchers" className="opacity-90">an: {watchers.map(w => w.username).join(", ")}</span>
          {!connected && <span data-testid="text-live-reconnect" className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verbindung wird wiederhergestellt…</span>}
          <Button size="sm" variant="secondary" className="ml-auto h-7" data-testid="button-live-stop-sharing"
            onClick={() => void safe(stopSharing)}>Freigabe beenden</Button>
        </div>
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
            <DialogContent data-live-view-ui className="max-w-4xl w-[calc(100vw-1rem)] max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Liveansicht</DialogTitle>
                <DialogDescription>Schreibgeschützte Mitansicht der App eines angemeldeten Nutzers.</DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge data-testid="status-live-connection" variant={connected ? "secondary" : "destructive"}>
                  {connected ? "Verbunden" : "Getrennt – verbinde neu…"}
                </Badge>
                <Badge data-testid="status-live-enabled" variant="outline">{status.enabled ? "Aktiviert" : "Deaktiviert"}</Badge>
              </div>

              {status.canManage && (
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
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="text-sm" data-testid="text-live-target">
                      <span className="font-medium">{target.username}</span>
                      <span className="text-muted-foreground"> · {frame?.page ?? target.page}</span>
                    </div>
                    <Button size="sm" variant="outline" data-testid="button-live-stop" disabled={busy}
                      onClick={() => void safe(stop)}>Beenden</Button>
                  </div>
                  <div ref={box} className="relative w-full aspect-video overflow-hidden rounded-md border bg-muted">
                    {frame && doc && scale > 0 && (
                      <div className="absolute left-1/2 top-1/2 pointer-events-none select-none"
                        style={{ width: frame.width, height: frame.height, transform: `translate(-50%,-50%) scale(${scale})` }}>
                        <iframe title="Liveansicht" data-testid="iframe-live-frame" sandbox="allow-scripts" srcDoc={doc}
                          tabIndex={-1} className="border-0 bg-background pointer-events-none"
                          style={{ width: frame.width, height: frame.height, opacity: stale ? 0.4 : 1 }} />
                        {pointer && !stale && (
                          <MousePointer2 className="absolute text-destructive fill-destructive/30"
                            style={{ left: pointer.x, top: pointer.y, width: 20 / scale, height: 20 / scale }} />
                        )}
                      </div>
                    )}
                    {(!frame || stale || !connected) && (
                      <div data-testid="status-live-frame" className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground bg-background/60">
                        {frame ? <WifiOff className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
                        {frame ? "Übertragung unterbrochen – letztes Bild" : "Warte auf das erste Bild…"}
                      </div>
                    )}
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
