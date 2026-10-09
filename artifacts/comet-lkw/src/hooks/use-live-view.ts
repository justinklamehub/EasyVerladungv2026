import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { captureSnapshot } from "@/lib/live-view-snapshot";

export interface LiveTarget { socketId: string; userId?: number; username: string; page: string }
export interface LiveFrame { html: string; page: string; width: number; height: number; receivedAt: number }
export interface LiveStatus { enabled: boolean; canView: boolean; canManage: boolean }
export interface Watcher { socketId: string; username: string }

export function useLiveView() {
  const [status, setStatus] = useState<LiveStatus>({ enabled: false, canView: false, canManage: false });
  const [targets, setTargets] = useState<LiveTarget[]>([]);
  const [target, setTarget] = useState<LiveTarget | null>(null);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(getSocket().connected);
  const request = useCallback((event: string, data: unknown = {}) =>
    new Promise<any>((resolve, reject) => {
      const socket = getSocket();
      if (!socket.connected) { reject(new Error("Keine Verbindung zur Liveansicht.")); return; }
      socket.timeout(5000).emit(event, data, (timeout: Error | null, reply: any) => {
        if (timeout || !reply?.ok) reject(new Error(reply?.error ?? "Keine Verbindung zur Liveansicht."));
        else resolve(reply);
      });
    }), []);
  const refresh = useCallback(async () => {
    try {
      const next = await request("liveview.status");
      setStatus(next);
      if (next.canView) setTargets((await request("liveview.list")).targets);
      else setTargets([]);
    } catch { setStatus({ enabled: false, canView: false, canManage: false }); }
  }, [request]);
  useEffect(() => {
    const socket = getSocket();
    const reset = () => { setTarget(null); setWatchers([]); setFrame(null); setPointer(null); };
    const connect = () => { setConnected(true); reset(); void refresh(); };
    const disconnect = () => { setConnected(false); reset(); };
    const source = (data: { watchers: Watcher[] }) => setWatchers(data.watchers);
    const ended = (data: { reason: string }) => { setTarget(null); setFrame(null); setPointer(null); setError(data.reason); };
    const receive = (data: LiveFrame) => setFrame(data);
    const move = (data: { x: number; y: number }) => setPointer(data);
    socket.on("connect", connect).on("disconnect", disconnect).on("liveview.source", source)
      .on("liveview.ended", ended).on("liveview.frame", receive).on("liveview.pointer", move).on("liveview.config", refresh);
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      clearInterval(timer);
      socket.off("connect", connect).off("disconnect", disconnect).off("liveview.source", source)
        .off("liveview.ended", ended).off("liveview.frame", receive).off("liveview.pointer", move).off("liveview.config", refresh);
      socket.emit("liveview.stop", {});
      socket.emit("liveview.sourceStop", {});
    };
  }, [refresh]);

  useEffect(() => {
    if (!watchers.length) return;
    let busy = false;
    let cancelled = false;
    const socket = getSocket();
    const send = async () => {
      if (busy || cancelled || document.hidden) return;
      busy = true;
      try {
        const snapshot = captureSnapshot();
        if (snapshot.html.length > 700_000) throw new Error("Die App-Ansicht ist für die Liveübertragung zu groß.");
        await request("liveview.frame", snapshot);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Übertragung fehlgeschlagen.");
        socket.emit("liveview.sourceStop", {});
      } finally { busy = false; }
    };
    // React has committed the visible source banner before this effect executes.
    const begin = requestAnimationFrame(() => {
      if (cancelled || !document.querySelector("[data-testid='live-view-source-banner']")) return;
      void request("liveview.ready").then(send).catch(() => socket.emit("liveview.sourceStop", {}));
    });
    const timer = window.setInterval(send, 1000);
    let lastMove = 0;
    const move = (event: MouseEvent) => {
      if (Date.now() - lastMove < 90) return;
      lastMove = Date.now();
      socket.volatile.emit("liveview.pointer", { x: event.clientX, y: event.clientY });
    };
    document.addEventListener("mousemove", move, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(begin);
      clearInterval(timer);
      document.removeEventListener("mousemove", move);
    };
  }, [watchers, request]);

  const start = async (socketId: string) => {
    setError("");
    try { const reply = await request("liveview.start", { socketId }); setTarget(reply.target); setFrame(null); setPointer(null); }
    catch (cause) { setError((cause as Error).message); }
  };
  const stop = async () => {
    try { await request("liveview.stop"); setTarget(null); setFrame(null); }
    catch (cause) { setError((cause as Error).message); throw cause; }
  };
  const stopSharing = async () => {
    try { await request("liveview.sourceStop"); setWatchers([]); }
    catch (cause) { setError((cause as Error).message); throw cause; }
  };
  const configure = async (enabled: boolean) => {
    setError("");
    try { await request("liveview.configure", { enabled }); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
  };
  return { status, targets, target, watchers, frame, pointer, error, connected, start, stop, stopSharing, configure };
}

export type LiveViewController = ReturnType<typeof useLiveView>;
