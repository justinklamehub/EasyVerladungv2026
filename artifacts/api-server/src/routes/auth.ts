import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, pool } from "@workspace/db";
import { usersTable, speditionenTable, settingsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { createEmailTransport } from "../lib/email";
import { validatePasswordPolicy, computePasswordChangeRequired } from "../lib/password-policy";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: "identifier and password required" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, identifier), eq(usersTable.username, identifier)))
      .limit(1);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.role = user.role as any;
    req.session.speditionId = user.speditionId;
    req.session.username = user.username;

    let speditionName: string | null = null;
    if (user.speditionId) {
      const [sped] = await db
        .select({ name: speditionenTable.name })
        .from(speditionenTable)
        .where(eq(speditionenTable.id, user.speditionId))
        .limit(1);
      speditionName = sped?.name ?? null;
    }

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      speditionId: user.speditionId,
      speditionName,
      isActive: user.isActive,
      passwordChangeRequired: computePasswordChangeRequired(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    let speditionName: string | null = null;
    if (user.speditionId) {
      const [sped] = await db
        .select({ name: speditionenTable.name })
        .from(speditionenTable)
        .where(eq(speditionenTable.id, user.speditionId))
        .limit(1);
      speditionName = sped?.name ?? null;
    }

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      speditionId: user.speditionId,
      speditionName,
      isActive: user.isActive,
      passwordChangeRequired: computePasswordChangeRequired(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/auth/profile", requireAuth, async (req, res) => {
  try {
    const { username, email } = req.body as { username?: string; email?: string };

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (username !== undefined) {
      if (!username.trim()) return res.status(400).json({ error: "Benutzername darf nicht leer sein" });
      updates.username = username.trim();
    }
    if (email !== undefined) {
      updates.email = email.trim() || null;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.session.userId!))
      .returning();

    if (updates.username) req.session.username = updated.username;

    return res.json({ id: updated.id, username: updated.username, email: updated.email });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Benutzername oder E-Mail bereits vergeben" });
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Aktuelles und neues Passwort erforderlich" });
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: "Benutzer nicht gefunden" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Aktuelles Passwort ist falsch" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  // Always respond OK immediately to prevent user enumeration
  res.json({ ok: true });
  try {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier?.trim()) return;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, identifier.trim()), eq(usersTable.username, identifier.trim())))
      .limit(1);

    if (!user || !user.isActive || !user.email) return;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 Stunde

    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, token, expiresAt],
    );

    const host = req.get("host") || "localhost";
    const proto = req.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const resetUrl = `${proto}://${host}/reset-password?token=${token}`;

    const rows = await db.select().from(settingsTable);
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const appName = s.app_name || "Easy-Verladung";
    const from = s.email_from || process.env.SMTP_FROM || "noreply@comet-seasonal.de";
    const transport = createEmailTransport(s);

    await transport.sendMail({
      from,
      to: user.email,
      subject: `Passwort zurücksetzen – ${appName}`,
      text: `Guten Tag ${user.username},\n\nbitte klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:\n\n${resetUrl}\n\nDer Link ist 1 Stunde gültig. Falls Sie keine Zurücksetzung angefordert haben, ignorieren Sie diese E-Mail.\n\nDiese E-Mail wurde automatisch generiert.`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1e3a5f;margin-bottom:16px">Passwort zurücksetzen</h2>
        <p>Guten Tag <strong>${user.username}</strong>,</p>
        <p>Sie haben eine Passwortzurücksetzung für <strong>${appName}</strong> angefordert.</p>
        <p style="margin:28px 0">
          <a href="${resetUrl}" style="background:#1e3a5f;color:#fff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px">Passwort zurücksetzen</a>
        </p>
        <p style="color:#666;font-size:12px">Oder kopieren Sie diesen Link in Ihren Browser:<br><a href="${resetUrl}" style="color:#1e3a5f">${resetUrl}</a></p>
        <p style="color:#666;font-size:12px">Der Link ist <strong>1 Stunde</strong> gültig.</p>
        <p style="color:#666;font-size:12px">Falls Sie keine Passwortzurücksetzung angefordert haben, ignorieren Sie diese E-Mail.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:11px">Diese E-Mail wurde automatisch generiert von ${appName}.</p>
      </body></html>`,
    });
  } catch (err) {
    console.error("[forgot-password]", err);
  }
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) {
      return res.status(400).json({ error: "Token und Passwort erforderlich" });
    }
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const result = await pool.query(
      "SELECT * FROM password_reset_tokens WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()",
      [token],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Ungültiger oder abgelaufener Link. Bitte fordern Sie einen neuen an." });
    }

    const row = result.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    await Promise.all([
      db
        .update(usersTable)
        .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(usersTable.id, row.user_id)),
      pool.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [row.id]),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.get("/auth/permissions", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const { can, ALL_PERMISSIONS } = await import("../lib/permissions");
    const result: Record<string, boolean> = {};
    for (const perm of ALL_PERMISSIONS) {
      result[perm] = await can(role, perm);
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
