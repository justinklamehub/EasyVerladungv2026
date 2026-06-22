import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import app, { sessionMiddleware } from "./app";
import { logger } from "./lib/logger";
import { seedMissingPermissions } from "./lib/permissions";
import { seedEmailTemplates } from "./lib/email";
import { startScheduler } from "./lib/scheduler";

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
  startScheduler(io);
});
