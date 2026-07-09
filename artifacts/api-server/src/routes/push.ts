import { Router } from "express";
import webpush from "web-push";
import { pool, db, notifications, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCometAdmin, requireRoles } from "../lib/auth";
import { can } from "../lib/permissions";

const router = Router();

// ── VAPID ─────────────────────────────────────────────────────────────────────

export function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  let email = process.env.VAPID_EMAIL ?? "mailto:admin@comet-lkw.local";
  // web-push requires the VAPID subject to be a "mailto:" or "https:" URL.
  if (!/^mailto:|^https?:\/\//i.test(email)) {
    email = `mailto:${email}`;
  }
  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(email, publicKey, privateKey);
    } catch (err) {
      console.error("Ungültige VAPID-Konfiguration, Web-Push wird deaktiviert:", err);
    }
  }
}

// ── Push Event Defaults ───────────────────────────────────────────────────────

export const DEFAULT_PUSH_EVENTS = [
  {
    event_key: "shipment.arrived",
    label: "LKW angekommen",
    description: "Wenn ein LKW den Status 'Angekommen' erhält",
    target_roles: ["comet_lager", "comet_leitstand"],
  },
  {
    event_key: "shipment.dispatched",
    label: "Verladung abgefertigt",
    description: "Wenn eine Verladung abgefertigt wird",
    target_roles: ["comet_admin", "comet_leitstand"],
  },
  {
    event_key: "shipment.created",
    label: "Neue Verladung angemeldet",
    description: "Wenn eine Spedition eine neue Verladung anlegt",
    target_roles: ["comet_admin", "comet_leitstand"],
  },
  {
    event_key: "reconciliation.started",
    label: "Abstimmung gestartet",
    description: "Wenn COMET eine Paletten-Abstimmung eröffnet",
    target_roles: ["speditions_admin"],
  },
  {
    event_key: "ticket.created",
    label: "Neues Ticket",
    description: "Wenn ein neues Ticket erstellt wird",
    target_roles: ["comet_admin", "comet_leitstand"],
  },
  {
    event_key: "shipment.loaded",
    label: "Verladung fertig (Verladen)",
    description: "Wenn eine Verladung auf den Status 'Verladen' gesetzt wird",
    target_roles: ["comet_admin", "comet_leitstand", "speditions_admin"],
  },
];

export async function seedPushEventSettings() {
  for (const ev of DEFAULT_PUSH_EVENTS) {
    await pool.query(
      `INSERT INTO push_event_settings (event_key, label, description, enabled, target_roles)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (event_key) DO NOTHING`,
      [ev.event_key, ev.label, ev.description, ev.target_roles]
    );
  }
}

// ── Push Message Templates ────────────────────────────────────────────────────

export const PUSH_TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  "shipment.created":       ["id", "bezeichnung", "kennzeichen", "spedition", "relation", "etaDate", "etaTime", "lkwArt", "telefon", "tor", "status", "wareStatus"],
  "shipment.arrived":       ["id", "bezeichnung", "kennzeichen", "spedition", "relation", "ataDate", "ataTime", "tor", "status"],
  "shipment.dispatched":    ["id", "bezeichnung", "kennzeichen", "spedition", "relation", "status", "tor"],
  "shipment.loaded":        ["id", "bezeichnung", "kennzeichen", "spedition", "relation", "tor", "status"],
  "reconciliation.started": ["spedition"],
  "ticket.created":         ["titel", "nachricht"],
};

const DEFAULT_PUSH_TEMPLATES: Record<string, { title: string; message: string }> = {
  "shipment.created":       { title: "Neue Verladung angemeldet",   message: "{spedition}: {bezeichnung}" },
  "shipment.arrived":       { title: "LKW angekommen",               message: "{bezeichnung} ist eingetroffen – {tor}" },
  "shipment.dispatched":    { title: "Verladung abgefertigt",        message: "{bezeichnung} wurde abgefertigt." },
  "shipment.loaded":        { title: "Verladung fertig",             message: "{bezeichnung} wurde verladen – {relation}" },
  "reconciliation.started": { title: "Abstimmung gestartet",         message: "Paletten-Abstimmung wurde eröffnet." },
  "ticket.created":         { title: "Neues Ticket",                 message: "{titel}" },
};

export function renderPushTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export async function getPushMessageTemplate(eventKey: string): Promise<{ title: string; message: string }> {
  try {
    const { rows } = await pool.query(
      "SELECT title_template, message_template FROM push_message_templates WHERE event_key = $1",
      [eventKey]
    );
    if (rows.length > 0) return { title: rows[0].title_template, message: rows[0].message_template };
  } catch { /* table may not exist yet */ }
  const def = DEFAULT_PUSH_TEMPLATES[eventKey];
  return { title: def?.title ?? eventKey, message: def?.message ?? "" };
}

export async function seedPushMessageTemplates() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_message_templates (
      event_key TEXT PRIMARY KEY,
      title_template TEXT NOT NULL,
      message_template TEXT NOT NULL
    )
  `);
  for (const [key, def] of Object.entries(DEFAULT_PUSH_TEMPLATES)) {
    await pool.query(
      `INSERT INTO push_message_templates (event_key, title_template, message_template)
       VALUES ($1, $2, $3) ON CONFLICT (event_key) DO NOTHING`,
      [key, def.title, def.message]
    );
  }
}

// ── Push Event Check ──────────────────────────────────────────────────────────

export async function isPushEventEnabled(
  eventKey: string
): Promise<{ enabled: boolean; targetRoles: string[] }> {
  try {
    const { rows } = await pool.query(
      "SELECT enabled, target_roles FROM push_event_settings WHERE event_key = $1",
      [eventKey]
    );
    if (rows.length === 0) {
      const def = DEFAULT_PUSH_EVENTS.find((e) => e.event_key === eventKey);
      return { enabled: true, targetRoles: def?.target_roles ?? [] };
    }
    return { enabled: rows[0].enabled, targetRoles: rows[0].target_roles ?? [] };
  } catch {
    return { enabled: true, targetRoles: [] };
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/push/vapid-public-key", requireAuth, (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  if (!key) return res.json({ supported: false, publicKey: null });
  return res.json({ supported: true, publicKey: key });
});

router.post("/push/subscribe", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Ungültiges Abonnement" });
    }
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO UPDATE
         SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()`,
      [userId, endpoint, keys.p256dh, keys.auth]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("push subscribe error", err);
    return res.status(500).json({ error: "Fehler beim Speichern" });
  }
});

router.delete("/push/subscribe", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    const { endpoint } = req.body;
    if (endpoint) {
      await pool.query(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
        [userId, endpoint]
      );
    } else {
      await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1", [userId]);
    }
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Fehler beim Entfernen" });
  }
});

// Admin: Übersicht — wer hat Push aktiviert
router.get("/push/subscriptions-overview", requireCometAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ps.user_id, COUNT(*)::int AS count, u.username
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       GROUP BY ps.user_id, u.username
       ORDER BY u.username`
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Fehler" });
  }
});

// Admin: Push-Ereignis-Einstellungen lesen
router.get("/push/event-settings", requireCometAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT event_key, label, description, enabled, target_roles FROM push_event_settings ORDER BY id"
    );
    const eventMap = new Map(rows.map((r: any) => [r.event_key, r]));
    const result = DEFAULT_PUSH_EVENTS.map((def) => ({
      event_key: def.event_key,
      label: eventMap.get(def.event_key)?.label ?? def.label,
      description: def.description,
      enabled: eventMap.get(def.event_key)?.enabled ?? true,
      target_roles: eventMap.get(def.event_key)?.target_roles ?? def.target_roles,
    }));
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Fehler" });
  }
});

// Admin: Push-Ereignis-Einstellung ändern
router.patch("/push/event-settings/:eventKey", requireCometAdmin, async (req, res) => {
  try {
    const { eventKey } = req.params;
    const { enabled, target_roles } = req.body as { enabled?: boolean; target_roles?: string[] };
    const def = DEFAULT_PUSH_EVENTS.find((e) => e.event_key === eventKey);
    await pool.query(
      `INSERT INTO push_event_settings (event_key, label, description, enabled, target_roles)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_key) DO UPDATE
         SET enabled = EXCLUDED.enabled, target_roles = EXCLUDED.target_roles`,
      [eventKey, def?.label ?? eventKey, def?.description ?? "", enabled ?? true, target_roles ?? def?.target_roles ?? []]
    );
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Fehler" });
  }
});

// Admin: Push-Nachrichten-Templates lesen
router.get("/push/message-templates", requireCometAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT event_key, title_template, message_template FROM push_message_templates"
    ).catch(() => ({ rows: [] as any[] }));
    const templateMap = new Map(rows.map((r: any) => [r.event_key, r]));
    const result = DEFAULT_PUSH_EVENTS.map((def) => ({
      event_key: def.event_key,
      label: def.label,
      description: def.description,
      title_template: (templateMap.get(def.event_key) as any)?.title_template ?? DEFAULT_PUSH_TEMPLATES[def.event_key]?.title ?? def.label,
      message_template: (templateMap.get(def.event_key) as any)?.message_template ?? DEFAULT_PUSH_TEMPLATES[def.event_key]?.message ?? "",
      placeholders: PUSH_TEMPLATE_PLACEHOLDERS[def.event_key] ?? [],
    }));
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Fehler" });
  }
});

// Admin: Push-Nachrichten-Template aktualisieren
router.patch("/push/message-templates/:eventKey", requireCometAdmin, async (req, res) => {
  try {
    const { eventKey } = req.params;
    const { title_template, message_template } = req.body as { title_template?: string; message_template?: string };
    const def = DEFAULT_PUSH_TEMPLATES[eventKey];
    await pool.query(
      `INSERT INTO push_message_templates (event_key, title_template, message_template)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_key) DO UPDATE
         SET title_template = EXCLUDED.title_template, message_template = EXCLUDED.message_template`,
      [eventKey, title_template ?? def?.title ?? eventKey, message_template ?? def?.message ?? ""]
    );
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Fehler" });
  }
});

// ── Send Push ─────────────────────────────────────────────────────────────────

export async function sendPushToUsers(
  userIds: number[],
  payload: { title: string; message?: string; linkTo?: string; tag?: string }
): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  if (userIds.length === 0) return;

  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await pool.query(
    `SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    userIds
  );

  await Promise.allSettled(
    rows.map((row: any) =>
      webpush
        .sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload)
        )
        .catch(async (err: any) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [row.endpoint]);
          }
          throw err;
        })
    )
  );
}

// ── Custom (Ad-hoc) Push von Admin/Leitstand ────────────────────────────────

router.post("/push/send-custom", requireAuth, async (req: any, res) => {
  try {
    if (!(await can(req.session.role, "push.send_custom"))) {
      return res.status(403).json({ error: "Keine Berechtigung zum Senden von Nachrichten" });
    }
    const { target, role, userId, title, message } = req.body as {
      target?: "all" | "role" | "user";
      role?: string;
      userId?: number;
      title?: string;
      message?: string;
    };

    const trimmedTitle = (title ?? "").trim();
    if (!trimmedTitle) {
      return res.status(400).json({ error: "Titel ist erforderlich" });
    }

    const senderRows = await db
      .select({ username: usersTable.username, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!))
      .limit(1);
    const senderName = senderRows[0]?.username || senderRows[0]?.email || "Unbekannt";

    let userIds: number[] = [];
    if (target === "user") {
      if (!userId) return res.status(400).json({ error: "Benutzer erforderlich" });
      const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, Number(userId)));
      userIds = rows.map((r) => r.id);
    } else if (target === "role") {
      if (!role) return res.status(400).json({ error: "Rolle erforderlich" });
      const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, role));
      userIds = rows.map((r) => r.id);
    } else {
      const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isActive, true));
      userIds = rows.map((r) => r.id);
    }

    if (userIds.length === 0) {
      return res.status(400).json({ error: "Keine passenden Empfänger gefunden" });
    }

    const trimmedMessage = (message ?? "").trim() || null;
    const messageWithSender = trimmedMessage
      ? `${trimmedMessage}\n\nVon: ${senderName}`
      : `Von: ${senderName}`;

    const created = await db
      .insert(notifications)
      .values(
        userIds.map((uid) => ({
          userId: uid,
          title: trimmedTitle,
          message: messageWithSender,
          type: "info" as const,
        }))
      )
      .returning();

    const io = req.app.get("io");
    if (io) {
      for (const notif of created) {
        io.to(`user:${notif.userId}`).emit("notification.new", notif);
      }
    }

    sendPushToUsers(userIds, {
      title: trimmedTitle,
      message: messageWithSender,
      tag: "comet-custom",
    }).catch((err) => {
      console.warn("Custom Push Fehler:", err?.message ?? err);
    });

    return res.json({ ok: true, count: userIds.length });
  } catch (err) {
    console.error("send-custom push error", err);
    return res.status(500).json({ error: "Fehler beim Senden" });
  }
});

export default router;
