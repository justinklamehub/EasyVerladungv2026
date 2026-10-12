import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MousePointer2, WifiOff } from "lucide-react";
import { snapshotDocument, snapshotBody } from "@/lib/live-view-snapshot";
import type { LiveViewController } from "@/hooks/use-live-view";
import type { DirectLiveCommand } from "@/lib/live-view-direct";

type Focus = { target: string; value?: string; start?: number; end?: number };
const CHANNEL = "comet-live-control";
const KINDS = ["click", "dblclick", "contextmenu", "input", "key", "wheel", "mouse"];

interface Props {
  frame: LiveViewController["frame"];
  stale: boolean;
  connected: boolean;
  active: boolean;
  pointer: { x: number; y: number } | null;
  sendCommand: (command: DirectLiveCommand) => Promise<unknown>;
  onExitFullscreen?: () => void;
  className?: string;
}

export function LiveInteractiveFrame({ frame, stale, connected, active, pointer, sendCommand, onExitFullscreen, className = "" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const focusRef = useRef<Focus | null>(null);
  const draftAt = useRef(0);
  const knownFrames = useRef<string[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mousePending = useRef(false);
  const frameId = frame?.frameId;
  const interactive = active && frame?.fullControl === true && !!frameId;
  const live = interactive && connected && !stale;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Keep the sandbox/document stable while sharing. Frames arrive through the
  // authenticated parent bridge; only changing control mode replaces srcDoc.
  const built = useMemo(() => {
    if (!frame) return { doc: "", token: "" };
    const token = crypto.randomUUID();
    try {
      const focus = focusRef.current ? { ...focusRef.current,
        value: Date.now() - draftAt.current < 1500 ? focusRef.current.value : undefined } : undefined;
      const options = { token, frameId: frameId ?? "", page: frame.page, active: interactive, focus };
      return { doc: snapshotDocument(frame.html, options), token };
    } catch { return { doc: "", token: "" }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!frame, interactive]);

  if (frameId && !knownFrames.current.includes(frameId)) knownFrames.current = [...knownFrames.current, frameId].slice(-6);

  const updateFrame = () => {
    if (!frame || !built.token) return;
    iframe.current?.contentWindow?.postMessage({ channel: "comet-live-frame", token: built.token,
      frameId: frame.frameId ?? "", page: frame.page, html: snapshotBody(frame.html, interactive) }, "*");
  };
  useEffect(updateFrame, [frame, built.token, interactive]);

  const ctx = useRef({ built, live, frameId, page: frame?.page, sendCommand, onExitFullscreen });
  ctx.current = { built, live, frameId, page: frame?.page, sendCommand, onExitFullscreen };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const c = ctx.current;
      const d = event.data;
      if (!iframe.current || event.source !== iframe.current.contentWindow) return;
      if (!d || typeof d !== "object" || d.channel !== CHANNEL || !c.built.token || d.token !== c.built.token) return;
      if (!knownFrames.current.includes(d.frameId) || d.page !== c.page) return;
      // Exit the viewer's fullscreen first; don't also close a source-side dialog.
      if (d.command?.kind === "key" && d.command.key === "Escape" && c.onExitFullscreen) {
        c.onExitFullscreen();
        return;
      }
      if (!c.live) return;
      const f = d.focus;
      if (f && typeof f.target === "string") {
        focusRef.current = { target: f.target, value: typeof f.value === "string" ? f.value : undefined,
          start: typeof f.start === "number" ? f.start : undefined, end: typeof f.end === "number" ? f.end : undefined };
      }
      const cmd = d.command;
      if (!cmd || typeof cmd !== "object" || !KINDS.includes(cmd.kind) || typeof cmd.target !== "string") return;
      if (cmd.kind === "input") draftAt.current = Date.now();
      const isMouse = cmd.kind === "mouse";
      if (isMouse && mousePending.current) return;
      if (isMouse) mousePending.current = true;
      const payload = { ...cmd, frameId: d.frameId, page: d.page };
      queue.current = queue.current
        .then(() => ctx.current.live && ctx.current.page === payload.page ? ctx.current.sendCommand(payload) : undefined)
        .catch(() => { focusRef.current = null; })
        .finally(() => { if (isMouse) mousePending.current = false; });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const scale = frame && size.w && size.h ? Math.min(size.w / frame.width, size.h / frame.height) : 0;

  return (
    <div ref={box} data-testid="live-viewport" data-interactive={live ? "true" : "false"}
      className={`relative w-full overflow-hidden rounded-md border bg-muted ${live ? "ring-2 ring-amber-400" : ""} ${className}`}>
      {frame && built.doc && scale > 0 && (
        <div className={`absolute left-1/2 top-1/2 select-none ${live ? "" : "pointer-events-none"}`}
          style={{ width: frame.width, height: frame.height, transform: `translate(-50%,-50%) scale(${scale})` }}>
          <iframe ref={iframe} title="Liveansicht" data-testid="iframe-live-frame" sandbox="allow-scripts" srcDoc={built.doc}
            onLoad={updateFrame}
            tabIndex={live ? 0 : -1} className={`border-0 bg-background ${live ? "" : "pointer-events-none"}`}
            style={{ width: frame.width, height: frame.height, opacity: stale ? 0.4 : 1 }} />
          {pointer && !stale && (
            <MousePointer2 className="absolute pointer-events-none text-destructive fill-destructive/30"
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
  );
}
