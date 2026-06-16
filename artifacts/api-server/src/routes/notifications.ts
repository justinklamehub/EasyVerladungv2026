import { Router } from "express";
import { db, notifications } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ error: "Nicht angemeldet" });
  next();
}

router.get("/notifications", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    const id = parseInt(req.params.id);
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
});

router.patch("/notifications/read-all", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
});

router.delete("/notifications/:id", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    const id = parseInt(req.params.id);
    await db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
});

router.delete("/notifications", requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId as number;
    await db.delete(notifications).where(eq(notifications.userId, userId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
});

export default router;
