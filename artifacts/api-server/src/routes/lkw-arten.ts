import { Router } from "express";
import { db, pool } from "@workspace/db";
import { lkwArtenTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

export async function ensureLkwArtenTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lkw_arten (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      typ TEXT NOT NULL,
      aktiv BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await seedDefaultLkwArten();
}

async function seedDefaultLkwArten() {
  const existing = await pool.query("SELECT id FROM lkw_arten LIMIT 1");
  if (existing.rowCount && existing.rowCount > 0) return;
  await pool.query(`
    INSERT INTO lkw_arten (name, typ, aktiv, sort_order) VALUES
      ('Abholung (Auslieferung)', 'abholung', true, 0),
      ('Anlieferung (Retoure)',   'anlieferung', true, 1)
  `);
}

router.get("/lkw-arten", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(lkwArtenTable)
      .orderBy(asc(lkwArtenTable.sortOrder), asc(lkwArtenTable.name));
    return res.json(rows);
  } catch (err) {
    console.error("GET /lkw-arten error:", err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.post("/lkw-arten", async (req, res) => {
  if (req.session.role !== "comet_admin") {
    return res.status(403).json({ error: "Keine Berechtigung" });
  }
  try {
    const { name, typ, aktiv = true, sortOrder = 0 } = req.body as {
      name: string; typ: string; aktiv?: boolean; sortOrder?: number;
    };
    if (!name?.trim()) return res.status(400).json({ error: "Name erforderlich" });
    if (!["anlieferung", "abholung"].includes(typ)) return res.status(400).json({ error: "Ungültiger Typ" });

    const [row] = await db
      .insert(lkwArtenTable)
      .values({ name: name.trim(), typ, aktiv, sortOrder })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    console.error("POST /lkw-arten error:", err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.patch("/lkw-arten/:id", async (req, res) => {
  if (req.session.role !== "comet_admin") {
    return res.status(403).json({ error: "Keine Berechtigung" });
  }
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });

    const { name, typ, aktiv, sortOrder } = req.body as {
      name?: string; typ?: string; aktiv?: boolean; sortOrder?: number;
    };
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name.trim();
    if (typ !== undefined) {
      if (!["anlieferung", "abholung"].includes(typ)) return res.status(400).json({ error: "Ungültiger Typ" });
      update.typ = typ;
    }
    if (aktiv !== undefined) update.aktiv = aktiv;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;

    if (Object.keys(update).length === 0) return res.status(400).json({ error: "Keine Änderungen" });

    const [row] = await db
      .update(lkwArtenTable)
      .set(update)
      .where(eq(lkwArtenTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Nicht gefunden" });
    return res.json(row);
  } catch (err) {
    console.error("PATCH /lkw-arten/:id error:", err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.delete("/lkw-arten/:id", async (req, res) => {
  if (req.session.role !== "comet_admin") {
    return res.status(403).json({ error: "Keine Berechtigung" });
  }
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });

    await db.delete(lkwArtenTable).where(eq(lkwArtenTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /lkw-arten/:id error:", err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

export default router;
