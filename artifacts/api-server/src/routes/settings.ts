import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const PUBLIC_KEYS = ["app_name", "company_name", "login_subtitle", "company_logo"] as const;

router.get("/settings/public", async (_req, res) => {
  try {
    const all = await db.select().from(settingsTable);
    const map: Record<string, string> = {};
    for (const row of all) {
      if ((PUBLIC_KEYS as readonly string[]).includes(row.key)) {
        map[row.key] = row.value;
      }
    }
    return res.json(map);
  } catch {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    return res.json(map);
  } catch (e) {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.put("/settings/:key", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET-Admins dürfen Einstellungen ändern" });
    }

    const { key } = req.params;
    const { value } = req.body as { value: string };

    if (value === undefined || value === null) {
      return res.status(400).json({ error: "Wert fehlt" });
    }

    const ALLOWED_KEYS = [
      "app_name",
      "company_name",
      "login_subtitle",
      "company_logo",
      "default_bemerkung",
      "email_from",
      "email_tpl_shipment_enabled",
      "email_tpl_shipment_subject",
      "email_tpl_shipment_body",
      "email_tpl_shipment_to",
      "email_tpl_bulk_enabled",
      "email_tpl_bulk_subject",
      "email_tpl_bulk_body",
      "email_tpl_bulk_to",
      "email_tpl_user_enabled",
      "email_tpl_user_subject",
      "email_tpl_user_body",
      "email_tpl_user_to",
    ];
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: "Unbekannter Einstellungsschlüssel" });
    }

    await db
      .insert(settingsTable)
      .values({ key, value, updatedBy: req.session.userId!, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value, updatedBy: req.session.userId!, updatedAt: new Date() },
      });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

export default router;
