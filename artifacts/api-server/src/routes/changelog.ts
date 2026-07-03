import { Router } from "express";
import { db, pool, changelogEntriesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

export async function ensureChangelogTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS changelog_entries (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body_html TEXT NOT NULL DEFAULT '',
      version TEXT,
      is_published BOOLEAN NOT NULL DEFAULT true,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ── Public: published entries only ──────────────────────────────────────────

router.get("/changelog/public", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(changelogEntriesTable)
      .where(eq(changelogEntriesTable.isPublished, true))
      .orderBy(desc(changelogEntriesTable.publishedAt));
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

// ── Admin: full CRUD ─────────────────────────────────────────────────────────

router.get("/changelog", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET-Admins dürfen den Changelog verwalten" });
    }
    const rows = await db
      .select()
      .from(changelogEntriesTable)
      .orderBy(desc(changelogEntriesTable.publishedAt));
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.post("/changelog", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET-Admins dürfen den Changelog verwalten" });
    }
    const { title, bodyHtml, version, isPublished, publishedAt } = req.body as {
      title: string; bodyHtml: string; version?: string; isPublished?: boolean; publishedAt?: string;
    };
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Titel fehlt" });
    }
    const [row] = await db
      .insert(changelogEntriesTable)
      .values({
        title: title.trim(),
        bodyHtml: bodyHtml ?? "",
        version: version?.trim() || null,
        isPublished: isPublished ?? true,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        createdBy: req.session.userId!,
      })
      .returning();
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.put("/changelog/:id", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET-Admins dürfen den Changelog verwalten" });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Ungültige ID" });

    const { title, bodyHtml, version, isPublished, publishedAt } = req.body as {
      title?: string; bodyHtml?: string; version?: string; isPublished?: boolean; publishedAt?: string;
    };

    const [existing] = await db.select().from(changelogEntriesTable).where(eq(changelogEntriesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Eintrag nicht gefunden" });

    const [row] = await db
      .update(changelogEntriesTable)
      .set({
        title: title !== undefined ? title.trim() : existing.title,
        bodyHtml: bodyHtml !== undefined ? bodyHtml : existing.bodyHtml,
        version: version !== undefined ? (version.trim() || null) : existing.version,
        isPublished: isPublished !== undefined ? isPublished : existing.isPublished,
        publishedAt: publishedAt !== undefined ? new Date(publishedAt) : existing.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(changelogEntriesTable.id, id))
      .returning();
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.delete("/changelog/:id", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET-Admins dürfen den Changelog verwalten" });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Ungültige ID" });
    await db.delete(changelogEntriesTable).where(eq(changelogEntriesTable.id, id));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

export default router;
