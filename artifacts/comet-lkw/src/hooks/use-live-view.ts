import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { getSocket } from "@/lib/socket";
import { captureSnapshot } from "@/lib/live-view-snapshot";
import { readLiveSurface, applyLiveCommand, type LiveSurface, type LiveCommand } from "@/lib/live-view-control";
import { applyDirectLiveCommand, clearLiveFrames, type DirectLiveCommand } from "@/lib/live-view-direct";
export type { DirectLiveCommand } from "@/lib/live-view-direct";

export interface LiveTarget { socketId: string; userId?: number; username: string; page: string }
export interface LiveFrame { html: string; page: string; width: number; height: number; receivedAt: number; surface?: LiveSurface | null; frameId?: string; fullControl?: boolean }
export interface LiveStatus { enabled: boolean; canView: boolean; canManage: boolean; canControl: boolean }
export interface LiveControl {
  state: "idle" | "pending" | "active"; requestId?: string; expiresAt?: number; reason?: string;
  takeoverAt?: number; remainingMs?: number; countdownEndsAt?: number;
}
export interface Watcher { socketId: string; username: string; control?: LiveControl | null }

export function useLiveView() {
  const [status, setStatus] = useState<LiveStatus>({ enabled: false, canView: false, canManage: false, canControl: false });
  const [control, setControl] = useState<LiveControl>({ state: "idle" });
  const watcherRef = useRef<Watcher[]>([]);
  const approved = useRef(new Set<string>());
  const refused = useRef(new Set<string>());
  const [, navigate] = useLocation();
  const [targets, setTargets] = useState<LiveTarget[]>([]);
  const [target, setTarget] = useState<LiveTarget | null>(null);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [remotePointer, setRemotePointer] = useState<{ x: number; y: number; username: string } | null>(null);
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
    } catch { setStatus({ enabled: false, canView: false, canManage: false, canControl: false }); }
  }, [request]);
  useEffect(() => {
    const socket = getSocket();
    const reset = () => {
      setTarget(null); setWatchers([]); watcherRef.current = []; approved.current.clear(); refused.current.clear();
      setControl({ state: "idle" }); setFrame(null); setPointer(null);
      setRemotePointer(null); clearLiveFrames();
    };
    const connect = () => { setConnected(true); reset(); void refresh(); };
    const disconnect = () => { setConnected(false); reset(); };
    const source = (data: { watchers: Watcher[] }) => {
      const next = data.watchers.map(w => ({
        ...w, control: w.control ? { ...w.control,
          countdownEndsAt: Date.now() + Math.max(0, w.control.remainingMs ?? 15_000) } : null,
      }));
      watcherRef.current = next; setWatchers(next);
      if (!next.some(w => w.control?.state === "active")) setRemotePointer(null);
      for (const id of approved.current) if (!data.watchers.some(w => w.control?.requestId === id)) approved.current.delete(id);
    };
    const ended = (data: { reason: string }) => { setTarget(null); setControl({ state: "idle" }); setFrame(null); setPointer(null); setError(data.reason); };
    const controlState = (data: LiveControl) => setControl({ ...data,
      countdownEndsAt: Date.now() + Math.max(0, data.remainingMs ?? 15_000) });
    const command = (data: { requestId: string; command: LiveCommand | DirectLiveCommand }, reply: (data: { ok: boolean }) => void) => {
      try {
        const grant = watcherRef.current.find(w => w.control?.requestId === data.requestId)?.control;
        if (!approved.current.has(data.requestId) || grant?.state !== "active" || !grant.expiresAt ||
            grant.expiresAt <= Date.now()) throw Error();
        if ("target" in data.command) {
          applyDirectLiveCommand(data.command);
          if (data.command.kind === "mouse") setRemotePointer({ x: data.command.x, y: data.command.y,
            username: watcherRef.current.find(w => w.control?.requestId === data.requestId)?.username ?? "Administrator" });
        } else applyLiveCommand(data.command, navigate);
        reply({ ok: true });
      } catch { reply({ ok: false }); }
    };
    const hidden = () => {
      if (!document.hidden) return;
      for (const w of watcherRef.current) if (w.control?.requestId) {
        refused.current.add(w.control.requestId);
        socket.emit("liveview.control.stop", { requestId: w.control.requestId });
      }
      approved.current.clear();
      setRemotePointer(null);
    };
    const receive = (data: LiveFrame) => setFrame(data);
    const move = (data: { x: number; y: number }) => setPointer(data);
    socket.on("connect", connect).on("disconnect", disconnect).on("liveview.source", source)
      .on("liveview.ended", ended).on("liveview.frame", receive).on("liveview.pointer", move).on("liveview.config", refresh);
    socket.on("liveview.control.state", controlState).on("liveview.control.command", command);
    document.addEventListener("visibilitychange", hidden);
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      clearInterval(timer);
      socket.off("connect", connect).off("disconnect", disconnect).off("liveview.source", source)
        .off("liveview.ended", ended).off("liveview.frame", receive).off("liveview.pointer", move).off("liveview.config", refresh);
      socket.off("liveview.control.state", controlState).off("liveview.control.command", command);
      document.removeEventListener("visibilitychange", hidden);
      socket.emit("liveview.stop", {});
      socket.emit("liveview.sourceStop", {});
    };
  }, [refresh, navigate]);

  useEffect(() => {
    const timers = watchers.filter(w => w.control?.state === "pending" && w.control.requestId).map(w => {
      const id = w.control!.requestId!;
      return window.setTimeout(() => {
        const current = watcherRef.current.find(watcher => watcher.control?.requestId === id)?.control;
        if (current?.state !== "pending" || refused.current.has(id)) return;
        if (document.hidden || !document.querySelector("[data-testid='live-control-consent']")) {
          refused.current.add(id); getSocket().emit("liveview.control.stop", { requestId: id }); return;
        }
        // Only the connected source can acknowledge its visible countdown.
        // The server independently checks the full 15-second interval and fresh frames.
        approved.current.add(id);
        void request("liveview.control.respond", { requestId: id, accept: true, automatic: true })
          .catch(() => {
            approved.current.delete(id);
            getSocket().emit("liveview.control.stop", { requestId: id });
          });
      }, Math.max(0, (w.control!.countdownEndsAt ?? Date.now() + 15_000) - Date.now()));
    });
    return () => timers.forEach(clearTimeout);
  }, [watchers, request]);

  useEffect(() => {
    if (!watchers.length) return;
    let busy = false;
    let cancelled = false;
    const socket = getSocket();
    const send = async () => {
      if (busy || cancelled || document.hidden) return;
      busy = true;
      try {
        const snapshot = captureSnapshot(watcherRef.current.some(w => w.control?.state === "active" &&
          !!w.control.requestId && approved.current.has(w.control.requestId)));
        if (snapshot.html.length > 700_000) throw new Error("Die App-Ansicht ist für die Liveübertragung zu groß.");
        await request("liveview.frame", { ...snapshot, surface: readLiveSurface() });
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
    approved.current.clear();
    setRemotePointer(null); clearLiveFrames();
    for (const w of watcherRef.current) if (w.control?.requestId) refused.current.add(w.control.requestId);
    try { await request("liveview.sourceStop"); setWatchers([]); }
    catch (cause) { setError((cause as Error).message); throw cause; }
  };
  const configure = async (enabled: boolean) => {
    setError("");
    try { await request("liveview.configure", { enabled }); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
  };
  const requestControl = async () => {
    setError("");
    try { await request("liveview.control.request"); }
    catch (cause) { setError((cause as Error).message); throw cause; }
  };
  const respondControl = async (requestId: string, accept: boolean) => {
    if (!accept) refused.current.add(requestId);
    if (refused.current.has(requestId) && accept) return;
    if (accept && !document.hidden) approved.current.add(requestId);
    else approved.current.delete(requestId);
    try { await request("liveview.control.respond", { requestId, accept: accept && !document.hidden }); }
    catch (cause) { approved.current.delete(requestId); setError((cause as Error).message); throw cause; }
  };
  const stopControl = async (requestId = control.requestId) => {
    if (!requestId) return;
    approved.current.delete(requestId);
    setRemotePointer(null);
    refused.current.add(requestId);
    try { await request("liveview.control.stop", { requestId }); }
    catch (cause) { setError((cause as Error).message); throw cause; }
  };
  const sendCommand = async (command: LiveCommand | DirectLiveCommand) => {
    if (control.state !== "active" || !control.requestId) throw Error("Keine Steuerungsfreigabe.");
    try {
      await request("liveview.control.command", { requestId: control.requestId, command });
      if (command.kind !== "mouse") setError("");
    }
    catch (cause) {
      // Pointer movement isn't a mutation; stale hover targets must not obscure
      // the operator's next successful click/input with a permanent error.
      if (command.kind !== "mouse") setError("Aktion nicht ausgeführt. Freigabe, aktuelle Ansicht und Verbindung prüfen.");
      throw cause;
    }
  };
  return { status, targets, target, watchers, frame, pointer, error, connected, start, stop, stopSharing, configure,
    control, requestControl, respondControl, stopControl, sendCommand, remotePointer };
}

export type LiveViewController = ReturnType<typeof useLiveView>;
