import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { DEFAULT_SHELF_PLAN_PREFERENCE, SHELF_PLAN_PREFERENCE_KEY, shelfPlanPreferenceSchema } from "../lib/shelf-plan-preference";

const router = Router();

export async function ensureUserPreferencesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      key         TEXT NOT NULL,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, key)
    )
  `);
}

router.get("/user-preferences/:key", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { key } = req.params;
  try {
    const rows = await db.execute(
      sql`SELECT value FROM user_preferences WHERE user_id = ${userId} AND key = ${key} LIMIT 1`
    );
    if (rows.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    const value = (rows.rows[0] as { value: unknown }).value;
    if (key === SHELF_PLAN_PREFERENCE_KEY) {
      const parsed = shelfPlanPreferenceSchema.safeParse(value);
      return res.json({ value: parsed.success ? parsed.data : DEFAULT_SHELF_PLAN_PREFERENCE });
    }
    return res.json({ value });
  } catch (err) {
    console.error("GET user-preferences failed", err);
    return res.status(500).json({ error: "internal" });
  }
});

router.put("/user-preferences/:key", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { key } = req.params;
  let { value } = req.body ?? {};
  if (value === undefined) {
    return res.status(400).json({ error: "value required" });
  }
  if (key === SHELF_PLAN_PREFERENCE_KEY) {
    const parsed = shelfPlanPreferenceSchema.safeParse(value);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid shelf plan preference" });
    }
    value = parsed.data;
  }
  try {
    await db.execute(sql`
      INSERT INTO user_preferences (user_id, key, value, updated_at)
      VALUES (${userId}, ${key}, ${JSON.stringify(value)}::jsonb, NOW())
      ON CONFLICT (user_id, key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
    `);
    return res.json({ ok: true });
  } catch (err) {
    console.error("PUT user-preferences failed", err);
    return res.status(500).json({ error: "internal" });
  }
});

export default router;
