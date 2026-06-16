import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, speditionenTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

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
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Neues Passwort muss mindestens 6 Zeichen lang sein" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: "Benutzer nicht gefunden" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Aktuelles Passwort ist falsch" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
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
