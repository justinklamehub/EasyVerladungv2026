import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const PUBLIC_KEYS = ["app_name", "company_name", "login_subtitle", "company_logo", "page_title", "sidebar_nav_config", "sidebar_categories", "sidebar_order", "sidebar_role_visibility", "impressum_text", "datenschutz_text", "custom_design", "ticket_categories"] as const;

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
      "page_title",
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
      "email_tpl_password_expiry_enabled",
      "email_tpl_password_expiry_subject",
      "email_tpl_password_expiry_body",
      "email_tpl_password_expiry_to",
      "password_expiry_days",
      "password_expiry_reminder_days",
      "sidebar_nav_config",
      "sidebar_categories",
      "sidebar_order",
      "sidebar_role_visibility",
      "smtp_host",
      "smtp_port",
      "smtp_user",
      "smtp_pass",
      "email_tpl_shipment_tabelle_felder",
      "email_tpl_bulk_tabelle_felder",
      "kalkulation_startort",
      "report_weekly_enabled",
      "report_weekly_email",
      "report_weekly_day",
      "report_weekly_time",
      "impressum_text",
      "datenschutz_text",
      "storage_backend",
      "storage_local_path",
      "custom_design",
      "ticket_categories",
    ];
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: "Unbekannter Einstellungsschlüssel" });
    }

    if (key === "storage_backend" && value !== "gcs" && value !== "local") {
      return res.status(400).json({ error: "Ungültiger Speicher-Backend-Wert" });
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
