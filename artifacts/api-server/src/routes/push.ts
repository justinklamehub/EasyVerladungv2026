import { Router } from "express";
import webpush from "web-push";
import { pool } from "@workspace/db";
import { requireAuth, requireCometAdmin } from "../lib/auth";

const router = Router();

// ── VAPID ─────────────────────────────────────────────────────────────────────

export function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? "mailto:admin@comet-lkw.local";
  if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey);
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
  if (!key) return res.status(503).json({ error: "Push nicht konfiguriert" });
  return res.json({ publicKey: key });
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

export default router;
