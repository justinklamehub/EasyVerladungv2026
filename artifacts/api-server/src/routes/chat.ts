import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { Server as SocketIOServer, Socket } from "socket.io";

const router = Router();

const STAFF_ROLES = new Set(["comet_admin", "comet_leitstand"]);

// ── Table setup ──────────────────────────────────────────────────────────────

export async function ensureChatTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id SERIAL PRIMARY KEY,
      created_by_user_id INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      claimed_by_user_id INTEGER,
      claimed_by_name TEXT,
      target_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      subject TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      sender_user_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── REST routes ───────────────────────────────────────────────────────────────

// List sessions
router.get("/chat/sessions", requireAuth, async (req, res) => {
  const role = req.session.role!;
  const userId = req.session.userId!;
  const isStaff = STAFF_ROLES.has(role);
  try {
    if (isStaff) {
      const { rows } = await pool.query(
        `SELECT * FROM chat_sessions WHERE status != 'closed' ORDER BY created_at DESC`,
      );
      return res.json({ sessions: rows });
    } else {
      const { rows } = await pool.query(
        `SELECT * FROM chat_sessions WHERE created_by_user_id = $1 AND status != 'closed' ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      return res.json({ sessions: rows });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get messages for a session
router.get("/chat/sessions/:id/messages", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const role = req.session.role!;
  const isStaff = STAFF_ROLES.has(role);
  const sessionId = Number(req.params.id);
  try {
    const { rows: sessionRows } = await pool.query(
      "SELECT * FROM chat_sessions WHERE id = $1",
      [sessionId],
    );
    if (!sessionRows.length) return res.status(404).json({ error: "Not found" });
    const session = sessionRows[0];
    if (!isStaff && session.created_by_user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { rows } = await pool.query(
      "SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY sent_at ASC",
      [sessionId],
    );
    return res.json({ messages: rows, session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create session
router.post("/chat/sessions", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const username = req.session.username!;
  const { targetRole, subject } = req.body as {
    targetRole: "leitstand" | "admin";
    subject?: string;
  };
  if (!["leitstand", "admin"].includes(targetRole)) {
    return res.status(400).json({ error: "Invalid targetRole" });
  }
  try {
    // Close any existing open sessions for this user first
    await pool.query(
      `UPDATE chat_sessions SET status = 'closed', updated_at = NOW() WHERE created_by_user_id = $1 AND status != 'closed'`,
      [userId],
    );
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (created_by_user_id, created_by_name, target_role, subject)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, username, targetRole, subject ?? null],
    );
    const session = rows[0];
    const io = req.app.get("io") as SocketIOServer;
    io.to("comet").emit("chat:session:new", session);
    return res.status(201).json({ session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Claim session
router.post("/chat/sessions/:id/claim", requireAuth, async (req, res) => {
  const role = req.session.role!;
  const userId = req.session.userId!;
  const username = req.session.username!;
  if (!STAFF_ROLES.has(role)) return res.status(403).json({ error: "Forbidden" });
  const sessionId = Number(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE chat_sessions SET claimed_by_user_id = $1, claimed_by_name = $2, status = 'active', updated_at = NOW()
       WHERE id = $3 AND status = 'open' RETURNING *`,
      [userId, username, sessionId],
    );
    if (!rows.length) return res.status(409).json({ error: "Already claimed or not found" });
    const session = rows[0];
    const io = req.app.get("io") as SocketIOServer;
    io.to(`chat:${sessionId}`).emit("chat:session:claimed", {
      sessionId,
      claimedByName: username,
      claimedByUserId: userId,
      session,
    });
    io.to("comet").emit("chat:session:updated", session);
    return res.json({ session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Close session
router.post("/chat/sessions/:id/close", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const role = req.session.role!;
  const isStaff = STAFF_ROLES.has(role);
  const sessionId = Number(req.params.id);
  try {
    const whereClause = isStaff
      ? "id = $1"
      : "id = $1 AND created_by_user_id = $2";
    const params = isStaff ? [sessionId] : [sessionId, userId];
    const { rows } = await pool.query(
      `UPDATE chat_sessions SET status = 'closed', updated_at = NOW() WHERE ${whereClause} RETURNING *`,
      params,
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const session = rows[0];
    const io = req.app.get("io") as SocketIOServer;
    io.to(`chat:${sessionId}`).emit("chat:session:closed", { sessionId, session });
    io.to("comet").emit("chat:session:updated", session);
    return res.json({ session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

// ── Socket.IO events ──────────────────────────────────────────────────────────

export function setupChatSocket(
  io: SocketIOServer,
  socket: Socket,
  sess: Record<string, any>,
): void {
  const userId: number | undefined = sess?.userId;
  const username: string | undefined = sess?.username;
  const role: string | undefined = sess?.role;
  if (!userId || !username) return;

  socket.on("chat:join", async ({ sessionId }: { sessionId: number }) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM chat_sessions WHERE id = $1",
        [sessionId],
      );
      if (!rows.length) return;
      const session = rows[0];
      const isStaff = STAFF_ROLES.has(role ?? "");
      if (!isStaff && session.created_by_user_id !== userId) return;
      socket.join(`chat:${sessionId}`);
    } catch (e) {
      console.error("chat:join error", e);
    }
  });

  socket.on(
    "chat:message",
    async ({ sessionId, content }: { sessionId: number; content: string }) => {
      if (!content?.trim()) return;
      try {
        const { rows: sessionRows } = await pool.query(
          "SELECT * FROM chat_sessions WHERE id = $1",
          [sessionId],
        );
        if (!sessionRows.length) return;
        const session = sessionRows[0];
        const isStaff = STAFF_ROLES.has(role ?? "");
        if (!isStaff && session.created_by_user_id !== userId) return;
        if (session.status === "closed") return;
        const { rows } = await pool.query(
          `INSERT INTO chat_messages (session_id, sender_user_id, sender_name, content)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [sessionId, userId, username, content.trim()],
        );
        const message = rows[0];
        io.to(`chat:${sessionId}`).emit("chat:message:new", message);
        await pool.query(
          "UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1",
          [sessionId],
        );
      } catch (e) {
        console.error("chat:message error", e);
      }
    },
  );

  socket.on(
    "chat:typing",
    ({ sessionId, typing }: { sessionId: number; typing: boolean }) => {
      socket
        .to(`chat:${sessionId}`)
        .emit("chat:typing", { senderName: username, typing, userId });
    },
  );
}
