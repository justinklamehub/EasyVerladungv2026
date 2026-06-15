import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

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
      "default_bemerkung",
      "email_subject_template",
      "email_body_template",
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
