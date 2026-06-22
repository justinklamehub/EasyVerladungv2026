import { Router } from "express";
import { db } from "@workspace/db";
import { emailLogTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/email-log", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (role !== "comet_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const limit = Math.min(Number(req.query["limit"] ?? 100), 200);
    const offset = Number(req.query["offset"] ?? 0);

    const items = await db
      .select()
      .from(emailLogTable)
      .orderBy(desc(emailLogTable.sentAt))
      .limit(limit)
      .offset(offset);

    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
