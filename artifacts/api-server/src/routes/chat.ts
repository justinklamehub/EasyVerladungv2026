import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { Server as SocketIOServer, Socket } from "socket.io";

const AI_ENABLED =
  !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
  !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

async function getOpenAI() {
  if (!AI_ENABLED) return null;
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  return openai;
}

const router = Router();

const STAFF_ROLES = new Set(["comet_admin", "comet_leitstand"]);

const AI_SENDER_ID = 0;
const AI_SENDER_NAME = "KI-Assistent";

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
      status TEXT NOT NULL DEFAULT 'bot',
      ai_active BOOLEAN NOT NULL DEFAULT TRUE,
      subject TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS ai_active BOOLEAN NOT NULL DEFAULT TRUE
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_knowledge (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'allgemein',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── AI reply ─────────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `Du bist ein freundlicher KI-Support-Assistent für das COMET LKW-Verladungsverwaltungssystem (Easy-Verladung).
Du hilfst Benutzern bei Fragen rund um die LKW-Verladungsverwaltung.

Typische Themen, bei denen du helfen kannst:
- Sendungsstatus und -verfolgung
- Ladevorschriften und Verladungsabläufe
- Palettenverwaltung und Abgleich
- Auswertungen und Berichte
- Tor-/Rampenzuweisungen
- Gefahrgut-Checklisten
- Spediteurverwaltung
- Allgemeine Bedienung der Software

Falls du eine Frage nicht beantworten kannst oder das Problem eine manuelle Bearbeitung erfordert, weise freundlich darauf hin, dass ein Mitarbeiter übernehmen kann — und dass der Benutzer dafür auf "Mitarbeiter hinzuziehen" klicken kann.

Antworte immer auf Deutsch. Sei präzise und hilfreich. Halte Antworten kurz (max. 4 Sätze) außer bei komplexen Erklärungen.`;

async function buildSystemPrompt(): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT title, content, category FROM chat_knowledge WHERE active = TRUE ORDER BY category, id`,
    );
    if (!rows.length) return BASE_SYSTEM_PROMPT;
    const byCategory = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category)!.push(row);
    }
    let knowledge = "\n\n## Wissensdatenbank (verwende diese Informationen bei passenden Fragen):\n";
    for (const [cat, entries] of byCategory) {
      knowledge += `\n### ${cat}\n`;
      for (const e of entries) {
        knowledge += `**${e.title}**\n${e.content}\n\n`;
      }
    }
    return BASE_SYSTEM_PROMPT + knowledge;
  } catch {
    return BASE_SYSTEM_PROMPT;
  }
}

// ── Shared helper ─────────────────────────────────────────────────────────────

async function saveBotMessage(
  sessionId: number,
  content: string,
  io: SocketIOServer,
): Promise<void> {
  const { rows } = await pool.query(
    `INSERT INTO chat_messages (session_id, sender_user_id, sender_name, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sessionId, AI_SENDER_ID, AI_SENDER_NAME, content],
  );
  io.to(`chat:${sessionId}`).emit("chat:message:new", rows[0]);
  await pool.query(
    "UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1",
    [sessionId],
  );
}

// ── Lokaler Bot (kostenlos, kein externer API-Call) ───────────────────────────

const GREETING_PATTERNS = [
  "hallo", "guten tag", "guten morgen", "guten abend",
  "hi ", "hi,", "hey ", "servus", "moin", "grüß", "gruss",
];
const THANKS_PATTERNS = [
  "danke", "vielen dank", "herzlichen dank", "dankeschön",
  "super", "toll", "klasse", "prima", "perfekt", "wunderbar",
];
const BYE_PATTERNS = ["tschüss", "tschüs", "auf wiedersehen", "ciao", "bye", "bis dann"];
const ESCALATION_PATTERNS = [
  "mitarbeiter", "mensch", "person", "jemanden", "jemand sprechen",
  "anruf", "telefon", "rückruf", "weiterleiten",
];

const GREETING_RESPONSES = [
  "Hallo! Ich bin der COMET KI-Assistent und helfe Ihnen gerne weiter. Was kann ich für Sie tun?",
  "Guten Tag! Womit kann ich Ihnen behilflich sein?",
  "Hallo! Wie kann ich Ihnen heute helfen?",
];
const THANKS_RESPONSES = [
  "Gern geschehen! Kann ich Ihnen noch mit etwas anderem helfen?",
  "Freut mich, dass ich helfen konnte! Haben Sie noch weitere Fragen?",
  "Gerne! Melden Sie sich einfach, wenn Sie noch Fragen haben.",
];
const BYE_RESPONSES = [
  "Auf Wiedersehen! Bei weiteren Fragen stehe ich jederzeit zur Verfügung.",
  "Tschüss! Ich helfe Ihnen gerne wieder, wenn Sie Fragen haben.",
];
const ESCALATION_RESPONSE =
  'Selbstverständlich. Klicken Sie auf **"Mitarbeiter hinzuziehen"**, um direkt mit einem Mitarbeiter zu sprechen.';
const NO_MATCH_RESPONSE =
  'Zu dieser Frage habe ich leider keine passende Information in meiner Wissensdatenbank. ' +
  'Klicken Sie auf **"Mitarbeiter hinzuziehen"**, wenn Sie direkte Unterstützung benötigen, ' +
  'oder stellen Sie Ihre Frage etwas anders — vielleicht kann ich dann besser helfen.';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateLocalBotReply(
  sessionId: number,
  io: SocketIOServer,
): Promise<void> {
  try {
    const { rows: msgRows } = await pool.query(
      `SELECT sender_user_id, content FROM chat_messages
       WHERE session_id = $1 ORDER BY sent_at DESC LIMIT 5`,
      [sessionId],
    );
    const lastUser = msgRows.find((m) => m.sender_user_id !== AI_SENDER_ID);
    if (!lastUser) return;

    const userText = lastUser.content.trim().toLowerCase();

    if (GREETING_PATTERNS.some((p) => userText.includes(p))) {
      await saveBotMessage(sessionId, pickRandom(GREETING_RESPONSES), io);
      return;
    }
    if (THANKS_PATTERNS.some((p) => userText.includes(p))) {
      await saveBotMessage(sessionId, pickRandom(THANKS_RESPONSES), io);
      return;
    }
    if (BYE_PATTERNS.some((p) => userText.includes(p))) {
      await saveBotMessage(sessionId, pickRandom(BYE_RESPONSES), io);
      return;
    }
    if (ESCALATION_PATTERNS.some((p) => userText.includes(p))) {
      await saveBotMessage(sessionId, ESCALATION_RESPONSE, io);
      return;
    }

    // Volltextsuche in der Wissensdatenbank (PostgreSQL German-Stemming)
    try {
      const { rows: ftsRows } = await pool.query(
        `SELECT title, content,
           ts_rank(
             to_tsvector('german', title || ' ' || content),
             plainto_tsquery('german', $1)
           ) AS rank
         FROM chat_knowledge
         WHERE active = TRUE
           AND to_tsvector('german', title || ' ' || content)
               @@ plainto_tsquery('german', $1)
         ORDER BY rank DESC
         LIMIT 1`,
        [lastUser.content.trim()],
      );

      if (ftsRows.length > 0 && ftsRows[0].rank >= 0.01) {
        const entry = ftsRows[0];
        await saveBotMessage(sessionId, `**${entry.title}**\n\n${entry.content}`, io);
        return;
      }
    } catch {
      // plainto_tsquery kann bei sehr kurzen Texten / Stop-Words fehlschlagen
    }

    await saveBotMessage(sessionId, NO_MATCH_RESPONSE, io);
  } catch (err) {
    console.error("Local bot reply error for session", sessionId, err);
  }
}

// ── AI reply (lokaler Bot oder OpenAI) ────────────────────────────────────────

async function generateAiReply(
  sessionId: number,
  io: SocketIOServer,
): Promise<void> {
  const openai = await getOpenAI();

  // Kein OpenAI-Key → kostenloser lokaler Bot
  if (!openai) {
    return generateLocalBotReply(sessionId, io);
  }

  // OpenAI-Pfad (nur wenn AI_INTEGRATIONS_OPENAI_* gesetzt sind)
  try {
    const { rows: msgRows } = await pool.query(
      `SELECT sender_user_id, sender_name, content FROM chat_messages
       WHERE session_id = $1 ORDER BY sent_at ASC`,
      [sessionId],
    );

    const systemPrompt = await buildSystemPrompt();
    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...msgRows
        .filter((m) => m.sender_user_id !== AI_SENDER_ID)
        .map((m) => ({
          role: "user" as const,
          content: `${m.sender_name}: ${m.content}`,
        })),
    ];

    const lastUser = msgRows.findLast((m) => m.sender_user_id !== AI_SENDER_ID);
    if (!lastUser) return;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: chatMessages,
    });

    const aiContent = completion.choices[0]?.message?.content;
    if (!aiContent?.trim()) return;

    await saveBotMessage(sessionId, aiContent.trim(), io);
  } catch (err) {
    console.error("AI reply error for session", sessionId, err);
    // Fallback: lokaler Bot wenn OpenAI fehlschlägt
    return generateLocalBotReply(sessionId, io);
  }
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
      `INSERT INTO chat_sessions (created_by_user_id, created_by_name, target_role, subject, status, ai_active)
       VALUES ($1, $2, $3, $4, 'bot', TRUE) RETURNING *`,
      [userId, username, targetRole, subject ?? null],
    );
    const session = rows[0];

    // Send AI welcome message
    const io = req.app.get("io") as SocketIOServer;
    const welcomeText = `Hallo ${username}! Ich bin der KI-Assistent von COMET Easy-Verladung. Wie kann ich dir helfen?`;
    const { rows: welcomeRows } = await pool.query(
      `INSERT INTO chat_messages (session_id, sender_user_id, sender_name, content) VALUES ($1, $2, $3, $4) RETURNING *`,
      [session.id, AI_SENDER_ID, AI_SENDER_NAME, welcomeText],
    );
    // Notify all staff in real-time that a new session was created
    io.to("comet").emit("chat:session:new", session);

    return res.status(201).json({ session });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Escalate: disable AI, make session visible to staff
router.post("/chat/sessions/:id/escalate", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const sessionId = Number(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE chat_sessions SET ai_active = FALSE, status = 'open', updated_at = NOW()
       WHERE id = $1 AND created_by_user_id = $2 AND status = 'bot' RETURNING *`,
      [sessionId, userId],
    );
    if (!rows.length) return res.status(404).json({ error: "Not found or already escalated" });
    const session = rows[0];
    const io = req.app.get("io") as SocketIOServer;

    // AI sends a handoff message
    const handoffText = "Ich habe einen Mitarbeiter benachrichtigt. Du wirst gleich verbunden. Bitte habe einen Moment Geduld.";
    const { rows: aiMsgRows } = await pool.query(
      `INSERT INTO chat_messages (session_id, sender_user_id, sender_name, content) VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionId, AI_SENDER_ID, AI_SENDER_NAME, handoffText],
    );
    io.to(`chat:${sessionId}`).emit("chat:message:new", aiMsgRows[0]);
    io.to(`chat:${sessionId}`).emit("chat:session:updated", session);

    // Notify staff
    io.to("comet").emit("chat:session:new", session);

    return res.json({ session });
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
      `UPDATE chat_sessions SET claimed_by_user_id = $1, claimed_by_name = $2, status = 'active', ai_active = FALSE, updated_at = NOW()
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

// ── Knowledge base routes ─────────────────────────────────────────────────────

router.get("/chat/knowledge", requireAuth, async (req, res) => {
  const role = req.session.role!;
  if (!STAFF_ROLES.has(role)) return res.status(403).json({ error: "Forbidden" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM chat_knowledge ORDER BY category, id`,
    );
    return res.json({ entries: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chat/knowledge", requireAuth, async (req, res) => {
  const role = req.session.role!;
  const username = req.session.username!;
  if (role !== "comet_admin") return res.status(403).json({ error: "Forbidden" });
  const { title, content, category } = req.body as {
    title: string; content: string; category?: string;
  };
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "title and content required" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO chat_knowledge (title, content, category, created_by_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title.trim(), content.trim(), category?.trim() || "allgemein", username],
    );
    return res.status(201).json({ entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/chat/knowledge/:id", requireAuth, async (req, res) => {
  const role = req.session.role!;
  if (role !== "comet_admin") return res.status(403).json({ error: "Forbidden" });
  const id = Number(req.params.id);
  const { title, content, category, active } = req.body as {
    title?: string; content?: string; category?: string; active?: boolean;
  };
  try {
    const { rows } = await pool.query(
      `UPDATE chat_knowledge SET
         title = COALESCE($1, title),
         content = COALESCE($2, content),
         category = COALESCE($3, category),
         active = COALESCE($4, active),
         updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [title?.trim() ?? null, content?.trim() ?? null, category?.trim() ?? null, active ?? null, id],
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    return res.json({ entry: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/chat/knowledge/:id", requireAuth, async (req, res) => {
  const role = req.session.role!;
  if (role !== "comet_admin") return res.status(403).json({ error: "Forbidden" });
  const id = Number(req.params.id);
  try {
    await pool.query("DELETE FROM chat_knowledge WHERE id = $1", [id]);
    return res.json({ ok: true });
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

        // AI responds if ai_active and the message is from the session owner
        // (staff responding to someone else's session should not trigger the bot)
        if (session.ai_active && session.created_by_user_id === userId) {
          // Small delay so the user message renders first
          setTimeout(() => generateAiReply(sessionId, io), 600);
        }
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
