import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import { usersTable, speditionenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import { sendEventEmail } from "../lib/email";
import type { Server as IOServer } from "socket.io";

const router = Router();

function getIO(req: any): IOServer | null {
  return req.app.get("io") || null;
}

function emit(req: any, event: string, data: any) {
  const io = getIO(req);
  if (io) emitToRooms(io, event, data, null);
}

const ADMIN_ROLES = ["comet_admin", "comet_leitstand", "speditions_admin"];

router.get("/users", requireAuth, async (req, res) => {
  try {
    const { speditionId } = req.query;
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    let rows;
    if (role === "comet_admin" || role === "comet_leitstand") {
      rows = await db.select().from(usersTable);
    } else if (role === "speditions_admin" && sessionSpeditionId) {
      rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.speditionId, sessionSpeditionId));
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (speditionId) {
      rows = rows.filter((u) => u.speditionId === Number(speditionId));
    }

    const spedMap: Record<number, string> = {};
    const allSpeds = await db.select().from(speditionenTable);
    for (const s of allSpeds) spedMap[s.id] = s.name;

    return res.json(
      rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        speditionId: u.speditionId,
        speditionName: u.speditionId ? spedMap[u.speditionId] ?? null : null,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    if (role !== "comet_admin" && role !== "speditions_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { username, email, password, role: newRole, speditionId, isActive } = req.body;

    if (role === "speditions_admin") {
      if (!["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(newRole)) {
        return res.status(403).json({ error: "Cannot create COMET roles" });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const resolvedSpeditionId = role === "speditions_admin" ? sessionSpeditionId ?? null : speditionId ?? null;

    const [user] = await db
      .insert(usersTable)
      .values({
        username,
        email: email || null,
        passwordHash,
        role: newRole,
        speditionId: resolvedSpeditionId,
        isActive: isActive !== false,
      })
      .returning();

    await logAudit(req.session.userId!, "user", user.id, "created", null, username);
    emit(req, "user.created", { id: user.id });

    // E-Mail-Benachrichtigung (fire-and-forget)
    (async () => {
      try {
        const spedName = resolvedSpeditionId
          ? (await db.select({ name: speditionenTable.name }).from(speditionenTable).where(eq(speditionenTable.id, resolvedSpeditionId)).limit(1))[0]?.name ?? ""
          : "";

        // Kein E-Mail-Empfänger beim neuen User → Ersteller als Empfänger verwenden
        let mailRecipient: string | undefined = email || undefined;
        let hinweis = "";
        if (!mailRecipient) {
          const [creator] = await db
            .select({ email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, req.session.userId!))
            .limit(1);
          mailRecipient = creator?.email || undefined;
          if (mailRecipient) {
            hinweis = `Hinweis: Für den Benutzer "${username}" wurde keine E-Mail-Adresse hinterlegt. Diese E-Mail wurde daher an Sie (${mailRecipient}) weitergeleitet.`;
          }
        }

        await sendEventEmail(
          "user",
          {
            username,
            email: email || "–",
            passwort: password,
            rolle: newRole,
            spedition: spedName,
            hinweis,
          },
          mailRecipient,
        );
      } catch {}
    })();

    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      speditionId: user.speditionId,
      speditionName: null,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const targetId = Number(req.params.id);

    if (!ADMIN_ROLES.includes(role)) {
      if (req.session.userId !== targetId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);

    if (!user) return res.status(404).json({ error: "Not found" });

    if (role === "speditions_admin" && user.speditionId !== sessionSpeditionId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      speditionId: user.speditionId,
      speditionName: user.speditionId ? spedMap[user.speditionId] ?? null : null,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const targetId = Number(req.params.id);

    if (role !== "comet_admin" && role !== "speditions_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (role === "speditions_admin") {
      if (existing.speditionId !== sessionSpeditionId) {
        return res.status(403).json({ error: "Forbidden: can only modify users in own spedition" });
      }
      const { role: newRole } = req.body;
      if (newRole && !["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(newRole)) {
        return res.status(403).json({ error: "Cannot assign COMET roles" });
      }
    }

    const { username, email, password, role: newRole, speditionId, isActive } = req.body;

    const updates: any = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (newRole !== undefined) updates.role = newRole;
    if (role === "comet_admin" && speditionId !== undefined) updates.speditionId = speditionId;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = await bcrypt.hash(password, 12);
    updates.updatedAt = new Date();

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, targetId))
      .returning();

    if (!user) return res.status(404).json({ error: "Not found" });

    for (const [field, newVal] of Object.entries(updates)) {
      if (field === "updatedAt" || field === "passwordHash") continue;
      const oldVal = (existing as any)[field];
      if (String(oldVal) !== String(newVal)) {
        await logAudit(req.session.userId!, "user", targetId, field, String(oldVal ?? ""), String(newVal ?? ""));
      }
    }

    emit(req, "user.updated", { id: targetId });

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      speditionId: user.speditionId,
      speditionName: user.speditionId ? spedMap[user.speditionId] ?? null : null,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const targetId = Number(req.params.id);

    if (role !== "comet_admin" && role !== "speditions_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (role === "speditions_admin" && existing.speditionId !== sessionSpeditionId) {
      return res.status(403).json({ error: "Forbidden: can only deactivate users in own spedition" });
    }

    await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, targetId));
    await logAudit(req.session.userId!, "user", targetId, "isActive", "true", "false");
    emit(req, "user.updated", { id: targetId });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/:id/force-logout", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const targetId = Number(req.params.id);
    if (!targetId) return res.status(400).json({ error: "Ungültige Benutzer-ID" });

    if (targetId === req.session.userId) {
      return res.status(400).json({ error: "Sie können sich nicht selbst abmelden" });
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    await pool.query(`DELETE FROM session WHERE (sess->>'userId')::int = $1`, [targetId]);

    const io = getIO(req);
    if (io) {
      io.to(`user:${targetId}`).emit("force-logout", { reason: "admin" });
      const sockets = await io.in(`user:${targetId}`).fetchSockets();
      for (const s of sockets) s.disconnect(true);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("force-logout error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
