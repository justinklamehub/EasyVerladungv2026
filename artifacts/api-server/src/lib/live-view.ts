import type { Server, Socket } from "socket.io";
import { pool } from "@workspace/db";
import { can } from "./permissions";
import { logger } from "./logger";

export interface LiveActor { id: number; username: string; role: string; speditionId: number | null }
interface Presence { userId: number; username: string; role: string; speditionId?: number; page: string }
interface Session { viewer: string; source: string; viewerId: number; sourceId: number; ready: boolean; lastFrame: number }
type Reply = (response: { ok: boolean; error?: string; [key: string]: unknown }) => void;

// No HTML, frame, filter, or pointer data is persisted or logged.
export class LiveViewHub {
  sessions = new Map<string, Session>();
  constructor(
    private io: Server,
    private presence: Map<string, Presence>,
    private actor: (socket: Socket) => Promise<LiveActor | null>,
    private enabled: () => Promise<boolean>,
    private permitted: (actor: LiveActor, manage?: boolean) => Promise<boolean>,
    private configure: (enabled: boolean) => Promise<void>,
  ) {}

  private scope(viewer: LiveActor, source: LiveActor) {
    return viewer.role.startsWith("comet_") ||
      (viewer.speditionId !== null && viewer.speditionId === source.speditionId);
  }
  private sourceState(source: string) {
    const watchers = [...this.sessions.values()].filter(s => s.source === source);
    const users = watchers.map(s => ({
      socketId: s.viewer,
      username: this.presence.get(s.viewer)?.username ?? "Administrator",
    }));
    this.io.to(source).emit("liveview.source", { watchers: users });
  }
  stop(viewer: string, reason = "Liveansicht beendet") {
    const session = this.sessions.get(viewer);
    if (!session) return;
    this.sessions.delete(viewer);
    this.io.to(viewer).emit("liveview.ended", { reason });
    this.sourceState(session.source);
    logger.info({ viewerId: session.viewerId, sourceId: session.sourceId }, "App-Liveansicht beendet");
  }
  stopAll(reason: string) {
    for (const viewer of [...this.sessions.keys()]) this.stop(viewer, reason);
  }
  async revalidate() {
    if (!this.sessions.size) return;
    if (!await this.enabled()) return this.stopAll("Liveansicht wurde deaktiviert.");
    for (const session of [...this.sessions.values()]) {
      const viewerSocket = this.io.sockets.sockets.get(session.viewer);
      const sourceSocket = this.io.sockets.sockets.get(session.source);
      const viewer = viewerSocket && await this.actor(viewerSocket);
      const source = sourceSocket && await this.actor(sourceSocket);
      if (!viewer || !source || viewer.id !== session.viewerId || source.id !== session.sourceId ||
          !await this.permitted(viewer) || !this.scope(viewer, source)) {
        this.stop(session.viewer, "Liveansicht beendet: Zugriff oder Verbindung geändert.");
      }
    }
  }
  attach(socket: Socket) {
    let windowStart = Date.now();
    let requests = 0;
    const handle = (event: string, fn: (data: any) => Promise<Record<string, unknown> | void>) => {
      socket.on(event, async (data: unknown, reply?: Reply) => {
        try {
          if (Date.now() - windowStart > 10_000) { windowStart = Date.now(); requests = 0; }
          if (!event.includes("Stop") && event !== "liveview.stop" && ++requests > 40) throw Error();
          const result = await fn(data);
          reply?.({ ok: true, ...result });
        } catch {
          reply?.({ ok: false, error: "Liveansicht nicht verfügbar oder nicht erlaubt." });
        }
      });
    };
    handle("liveview.status", async () => {
      const actor = await this.actor(socket);
      return {
        enabled: await this.enabled(),
        canView: !!actor && await this.permitted(actor),
        canManage: !!actor && await this.permitted(actor, true),
      };
    });
    handle("liveview.configure", async (data) => {
      const actor = await this.actor(socket);
      if (!actor || !await this.permitted(actor, true) || typeof data?.enabled !== "boolean") throw Error();
      await this.configure(data.enabled);
      if (!data.enabled) this.stopAll("Liveansicht wurde systemweit deaktiviert.");
      this.io.emit("liveview.config", { enabled: data.enabled });
      logger.info({ actorId: actor.id, enabled: data.enabled }, "App-Liveansicht konfiguriert");
      return { enabled: data.enabled };
    });
    handle("liveview.list", async () => {
      const actor = await this.actor(socket);
      if (!actor || !await this.permitted(actor)) throw Error();
      const targets = [];
      for (const [socketId, entry] of this.presence) {
        if (entry.userId === actor.id) continue;
        const sourceSocket = this.io.sockets.sockets.get(socketId);
        if (!sourceSocket) continue;
        const source = { id: entry.userId, username: entry.username, role: entry.role, speditionId: entry.speditionId ?? null };
        if (this.scope(actor, source)) targets.push({
          socketId, userId: source.id, username: source.username, page: entry.page,
        });
      }
      return { targets };
    });
    handle("liveview.start", async (data) => {
      const viewer = await this.actor(socket);
      const sourceSocket = typeof data?.socketId === "string" ? this.io.sockets.sockets.get(data.socketId) : undefined;
      const source = sourceSocket && await this.actor(sourceSocket);
      if (!viewer || !source || !sourceSocket || source.id === viewer.id ||
          !await this.enabled() || !await this.permitted(viewer) || !this.scope(viewer, source)) throw Error();
      this.stop(socket.id);
      this.sessions.set(socket.id, {
        viewer: socket.id, source: sourceSocket.id, viewerId: viewer.id,
        sourceId: source.id, ready: false, lastFrame: 0,
      });
      // The source must mount its visible banner and acknowledge before any frame is relayed.
      this.sourceState(sourceSocket.id);
      logger.info({ viewerId: viewer.id, sourceId: source.id }, "App-Liveansicht gestartet");
      return { target: { socketId: sourceSocket.id, username: source.username, page: this.presence.get(sourceSocket.id)?.page ?? "/" } };
    });
    handle("liveview.ready", async () => {
      if (!await this.actor(socket) || !await this.enabled()) throw Error();
      for (const session of this.sessions.values()) if (session.source === socket.id) session.ready = true;
    });
    handle("liveview.stop", async () => { this.stop(socket.id); });
    handle("liveview.sourceStop", async () => {
      for (const session of [...this.sessions.values()]) {
        if (session.source === socket.id) this.stop(session.viewer, "Benutzer hat die Liveansicht beendet.");
      }
    });
    handle("liveview.frame", async (data) => {
      if (!data || typeof data.html !== "string" || data.html.length > 700_000 ||
          typeof data.page !== "string" || data.page.length > 200 ||
          !Number.isFinite(data.width) || !Number.isFinite(data.height) ||
          data.width < 100 || data.width > 5000 || data.height < 100 || data.height > 5000) throw Error();
      const source = await this.actor(socket);
      const enabled = await this.enabled();
      for (const session of [...this.sessions.values()]) {
        if (session.source !== socket.id || !session.ready || Date.now() - session.lastFrame < 700) continue;
        const viewerSocket = this.io.sockets.sockets.get(session.viewer);
        const viewer = viewerSocket && await this.actor(viewerSocket);
        if (!enabled || !source || !viewer || viewer.id !== session.viewerId || source.id !== session.sourceId ||
            !await this.permitted(viewer) || !this.scope(viewer, source)) {
          this.stop(session.viewer, "Liveansicht beendet: Zugriff oder Verbindung geändert.");
          continue;
        }
        session.lastFrame = Date.now();
        this.io.to(session.viewer).emit("liveview.frame", {
          html: data.html, page: data.page, width: data.width, height: data.height, receivedAt: Date.now(),
        });
      }
    });
    // Separate throttled pointer channel avoids rebuilding the DOM for every movement.
    let lastPointer = 0;
    socket.on("liveview.pointer", (data: any) => {
      if (Date.now() - lastPointer < 70 || !Number.isFinite(data?.x) || !Number.isFinite(data?.y)) return;
      lastPointer = Date.now();
      for (const session of this.sessions.values()) {
        if (session.source === socket.id && session.ready && Date.now() - session.lastFrame < 2000) {
          this.io.to(session.viewer).emit("liveview.pointer", {
            x: Math.max(0, Math.min(5000, data.x)), y: Math.max(0, Math.min(5000, data.y)),
          });
        }
      }
    });
    socket.on("disconnect", () => {
      this.stop(socket.id, "Administrator ist nicht mehr verbunden.");
      for (const session of [...this.sessions.values()]) {
        if (session.source === socket.id) this.stop(session.viewer, "Benutzer ist nicht mehr verbunden.");
      }
    });
  }
}

export function setupLiveView(io: Server, presence: Map<string, Presence>) {
  const actor = async (socket: Socket): Promise<LiveActor | null> => {
    const request = socket.request as any;
    // Reload session: HTTP logout / expired sessions must invalidate a still-open socket.
    if (typeof request.session?.reload !== "function") return null;
    await new Promise<void>((resolve, reject) => request.session.reload((error: unknown) => error ? reject(error) : resolve()));
    const userId = request.session?.userId;
    if (!userId) return null;
    const { rows } = await pool.query(
      "SELECT id,username,role,spedition_id FROM users WHERE id=$1 AND is_active=true", [userId]);
    const user = rows[0];
    return user ? { id: user.id, username: user.username, role: user.role, speditionId: user.spedition_id } : null;
  };
  const hub = new LiveViewHub(io, presence, actor,
    async () => (await pool.query("SELECT value FROM settings WHERE key='live_view_enabled'")).rows[0]?.value === "1",
    (user, manage) => can(user.role, manage ? "system.liveview.manage" : "system.liveview"),
    async (enabled) => {
      await pool.query("INSERT INTO settings(key,value) VALUES('live_view_enabled',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()", [enabled ? "1" : "0"]);
    });
  io.on("connection", socket => hub.attach(socket));
  const timer = setInterval(() => {
    void hub.revalidate().catch(() => hub.stopAll("Liveansicht wegen Verbindungsfehler beendet."));
  }, 2000);
  timer.unref();
  return hub;
}
