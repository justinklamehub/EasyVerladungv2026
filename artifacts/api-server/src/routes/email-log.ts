import { Router } from "express";
import { db } from "@workspace/db";
import { emailLogTable, settingsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { createEmailTransport } from "../lib/email";

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

router.post("/email-log/:id/resend", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (role !== "comet_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const id = Number(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });

    const to = (req.body?.to ?? "").toString().trim();
    if (!to) return res.status(400).json({ error: "Empfänger-E-Mail fehlt" });

    const [entry] = await db.select().from(emailLogTable).where(eq(emailLogTable.id, id)).limit(1);
    if (!entry) return res.status(404).json({ error: "Eintrag nicht gefunden" });

    const settingsRows = await db.select().from(settingsTable);
    const settings: Record<string, string> = Object.fromEntries(settingsRows.map((r) => [r.key, r.value ?? ""]));
    const from = settings["email_from"] || process.env.SMTP_FROM || "noreply-easy-verladung@comet-seasonal.de";
    const transport = createEmailTransport(settings);

    await transport.sendMail({
      from,
      to,
      subject: `[Weiterleitung] ${entry.subject}`,
      text: entry.bodyText ?? undefined,
      html: entry.bodyHtml ?? undefined,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[email-log/resend]", err);
    return res.status(500).json({ error: "Fehler beim Senden" });
  }
});

export default router;
