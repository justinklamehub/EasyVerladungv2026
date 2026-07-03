import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import app, { sessionMiddleware } from "./app";
import { logger } from "./lib/logger";
import { seedMissingPermissions } from "./lib/permissions";
import { seedEmailTemplates, ensureEmailLogTable, ensurePasswordResetTable } from "./lib/email";
import { ensureTicketsTables } from "./routes/tickets";
import { ensureUserPreferencesTable } from "./routes/user-preferences";
import { startScheduler, ensureReportWeeklyLogTable } from "./lib/scheduler";
import { ensureShipmentTemplatesTable } from "./routes/shipment-templates";
import { ensureAuftragAnalyseTable } from "./routes/auftragsauswertung";
import { initWebPush, seedPushEventSettings, seedPushMessageTemplates } from "./routes/push";
import { ensureChangelogTable } from "./routes/changelog";
import { pool } from "@workspace/db";

// Load .env relative to this file (Node 20.6+ built-in, no dotenv needed).
// Works regardless of PM2's working directory at startup.
try {
  const envPath = new URL("../.env", import.meta.url).pathname;
  (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(envPath);
} catch { /* .env absent or Node < 20.6 – ignore */ }

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

// In development (Replit): restrict to the Replit dev domain.
// In production behind a reverse proxy (Apache/Nginx): allow same-origin requests.
// Set FRONTEND_URL explicitly if you need to restrict to a specific domain.
const allowedOrigin = process.env["REPLIT_DEV_DOMAIN"]
  ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
  : process.env["FRONTEND_URL"] ?? true;

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/api/socket.io",
});

app.set("io", io);

io.use((socket, next) => {
  sessionMiddleware(socket.request as any, {} as any, next as any);
});

io.use((socket, next) => {
  const sess = (socket.request as any).session;
  if (!sess?.userId) {
    return next(new Error("unauthorized"));
  }
  return next();
});

interface EditorInfo {
  userId: number;
  username: string;
  socketId: string;
}

const editingPresence = new Map<number, Set<EditorInfo>>();

function removeEditorFromPresence(socketId: string): Array<{ shipmentId: number; editors: Array<{ userId: number; username: string }> }> {
  const changed: Array<{ shipmentId: number; editors: Array<{ userId: number; username: string }> }> = [];
  for (const [shipmentId, set] of editingPresence.entries()) {
    for (const entry of set) {
      if (entry.socketId === socketId) {
        set.delete(entry);
        const editors = Array.from(set).map((e) => ({ userId: e.userId, username: e.username }));
        changed.push({ shipmentId, editors });
        break;
      }
    }
    if (set.size === 0) editingPresence.delete(shipmentId);
  }
  return changed;
}

// ── User Presence (who is online + current page) ─────────────────────────────

interface UserPresenceInfo {
  userId: number;
  username: string;
  role: string;
  speditionId: number | undefined;
  page: string;
  connectedAt: string;
}

const userPresence = new Map<string, UserPresenceInfo>(); // socketId → info

const COMET_ROLES = new Set(["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]);

function broadcastPresence() {
  const all = Array.from(userPresence.values());

  // COMET users receive the full list
  io.to("comet").emit("presence.update", all);

  // Each spedition room receives only their own users
  const spedIds = new Set(all.filter((u) => u.speditionId).map((u) => u.speditionId!));
  for (const spedId of spedIds) {
    const filtered = all.filter((u) => u.speditionId === spedId);
    io.to(`spedition:${spedId}`).emit("presence.update", filtered);
  }
}

io.on("connection", (socket) => {
  const sess = (socket.request as any).session;
  const role: string | undefined = sess?.role;
  const speditionId: number | undefined = sess?.speditionId;
  const userId: number | undefined = sess?.userId;
  const username: string | undefined = sess?.username;

  const isCometRole =
    role !== undefined &&
    ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"].includes(role);

  if (isCometRole) {
    socket.join("comet");
  } else if (speditionId) {
    socket.join(`spedition:${speditionId}`);
  }

  if (userId) {
    socket.join(`user:${userId}`);
  }

  logger.info({ socketId: socket.id, role, speditionId }, "Socket.IO client connected");

  // ── Presence tracking ──
  if (userId && username && role) {
    userPresence.set(socket.id, {
      userId,
      username,
      role,
      speditionId,
      page: "/",
      connectedAt: new Date().toISOString(),
    });
    broadcastPresence();

    // Send current snapshot directly to the newly connected socket
    const all = Array.from(userPresence.values());
    const snapshot = COMET_ROLES.has(role)
      ? all
      : all.filter((u) => u.speditionId === speditionId);
    socket.emit("presence.update", snapshot);
  }

  socket.on("presence.page", (data: { page: string }) => {
    const entry = userPresence.get(socket.id);
    if (entry && data && typeof data.page === "string") {
      entry.page = data.page.slice(0, 200);
      broadcastPresence();
    }
  });

  socket.on("shipment.editing.start", (data: { shipmentId: number; speditionId?: number | null }) => {
    const { shipmentId, speditionId: shipSpedId } = data;
    if (!userId || !username) return;

    if (!editingPresence.has(shipmentId)) {
      editingPresence.set(shipmentId, new Set());
    }
    const set = editingPresence.get(shipmentId)!;
    for (const entry of set) {
      if (entry.socketId === socket.id) {
        set.delete(entry);
        break;
      }
    }
    set.add({ userId, username, socketId: socket.id });

    const editors = Array.from(set).map((e) => ({ userId: e.userId, username: e.username }));
    const payload = { shipmentId, editors };

    io.to("comet").emit("shipment.editing", payload);
    if (shipSpedId) {
      io.to(`spedition:${shipSpedId}`).emit("shipment.editing", payload);
    }
  });

  socket.on("shipment.editing.stop", (data: { shipmentId: number; speditionId?: number | null }) => {
    const { shipmentId, speditionId: shipSpedId } = data;
    const set = editingPresence.get(shipmentId);
    if (set) {
      for (const entry of set) {
        if (entry.socketId === socket.id) {
          set.delete(entry);
          break;
        }
      }
      if (set.size === 0) editingPresence.delete(shipmentId);
    }
    const editors = Array.from(set ?? []).map((e) => ({ userId: e.userId, username: e.username }));
    const payload = { shipmentId, editors };
    io.to("comet").emit("shipment.editing", payload);
    if (shipSpedId) {
      io.to(`spedition:${shipSpedId}`).emit("shipment.editing", payload);
    }
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket.IO client disconnected");

    // Remove from presence and broadcast update
    userPresence.delete(socket.id);
    broadcastPresence();

    const changed = removeEditorFromPresence(socket.id);
    for (const { shipmentId, editors } of changed) {
      io.to("comet").emit("shipment.editing", { shipmentId, editors });
      if (speditionId) {
        io.to(`spedition:${speditionId}`).emit("shipment.editing", { shipmentId, editors });
      }
    }
  });
});

httpServer.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening with Socket.IO");
  try {
    await ensureEmailLogTable();
    logger.info("email_log table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureEmailLogTable failed — non-fatal");
  }
  try {
    await ensurePasswordResetTable();
    logger.info("password_reset_tokens table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensurePasswordResetTable failed — non-fatal");
  }
  try {
    await ensureTicketsTables();
    logger.info("tickets tables ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureTicketsTables failed — non-fatal");
  }
  try {
    await ensureUserPreferencesTable();
    logger.info("user_preferences table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureUserPreferencesTable failed — non-fatal");
  }
  try {
    await ensureReportWeeklyLogTable();
    logger.info("report_weekly_log table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureReportWeeklyLogTable failed — non-fatal");
  }
  try {
    await ensureShipmentTemplatesTable();
    logger.info("shipment_templates table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureShipmentTemplatesTable failed — non-fatal");
  }
  try {
    await ensureAuftragAnalyseTable();
    logger.info("auftrag_analyse_ergebnisse table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureAuftragAnalyseTable failed — non-fatal");
  }
  try {
    await pool.query("ALTER TABLE speditionen ADD COLUMN IF NOT EXISTS speditionsnummer TEXT");
    logger.info("speditionen.speditionsnummer column ensured");
  } catch (e) {
    logger.warn({ err: e }, "speditionen.speditionsnummer column ensure failed — non-fatal");
  }
  try {
    await pool.query(`
      ALTER TABLE speditionen
        ADD COLUMN IF NOT EXISTS preis_pro_km DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS mindestpreis_pro_fahrt DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS paletten_aufschlag DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS kraftstoffzuschlag_prozent DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS fixkosten_pro_fahrt DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS maut_pro_km DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS daily_shipment_limit INTEGER
    `);
    logger.info("speditionen tariff columns ensured");
  } catch (e) {
    logger.warn({ err: e }, "speditionen tariff columns ensure failed — non-fatal");
  }
  try {
    await seedMissingPermissions();
    logger.info("Permissions seeded (missing rows backfilled)");
  } catch (e) {
    logger.warn({ err: e }, "seedMissingPermissions failed — non-fatal");
  }
  try {
    await seedEmailTemplates();
    logger.info("Email templates seeded");
  } catch (e) {
    logger.warn({ err: e }, "seedEmailTemplates failed — non-fatal");
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_event_settings (
        id SERIAL PRIMARY KEY,
        event_key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        description TEXT DEFAULT '',
        enabled BOOLEAN DEFAULT true,
        target_roles TEXT[] DEFAULT '{}'
      )
    `);
    logger.info("push_event_settings table ensured");
  } catch (e) {
    logger.warn({ err: e }, "push_event_settings table ensure failed — non-fatal");
  }
  try {
    await seedPushEventSettings();
    logger.info("push event settings seeded");
  } catch (e) {
    logger.warn({ err: e }, "seedPushEventSettings failed — non-fatal");
  }
  try {
    await seedPushMessageTemplates();
    logger.info("push message templates seeded");
  } catch (e) {
    logger.warn({ err: e }, "seedPushMessageTemplates failed — non-fatal");
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, endpoint)
      )
    `);
    logger.info("push_subscriptions table ensured");
  } catch (e) {
    logger.warn({ err: e }, "push_subscriptions table ensure failed — non-fatal");
  }
  try {
    await ensureChangelogTable();
    logger.info("changelog_entries table ensured");
  } catch (e) {
    logger.warn({ err: e }, "ensureChangelogTable failed — non-fatal");
  }
  initWebPush();
  startScheduler(io);
});
