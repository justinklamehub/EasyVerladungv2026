import { Router } from "express";
import { db } from "@workspace/db";
import {
  palletReconciliationsTable,
  palletMovementsTable,
  reconciliationCommentsTable,
  speditionenTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import { can } from "../lib/permissions";
import type { Server as IOServer } from "socket.io";

const router = Router();

const COMET_ROLES = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];
const SPED_ROLES = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"];

function getIO(req: any): IOServer | null {
  return req.app.get("io") || null;
}

function emit(req: any, event: string, data: any, speditionId?: number | null) {
  const io = getIO(req);
  if (io) emitToRooms(io, event, data, speditionId);
}

async function getRecWithScope(id: number, role: string, sessionSpeditionId: number | null | undefined) {
  const [rec] = await db
    .select()
    .from(palletReconciliationsTable)
    .where(eq(palletReconciliationsTable.id, id))
    .limit(1);

  if (!rec) return null;

  if (SPED_ROLES.includes(role)) {
    if (!sessionSpeditionId || rec.speditionId !== sessionSpeditionId) return "forbidden" as const;
  }

  return rec;
}

router.get("/reconciliations", requireAuth, async (req, res) => {
  try {
    const { speditionId, status } = req.query as Record<string, string>;
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    let rows = await db.select().from(palletReconciliationsTable);

    if (SPED_ROLES.includes(role)) {
      if (!sessionSpeditionId) return res.json([]);
      rows = rows.filter((r) => r.speditionId === sessionSpeditionId);
    } else if (speditionId) {
      rows = rows.filter((r) => r.speditionId === Number(speditionId));
    }
    if (status) rows = rows.filter((r) => r.status === status);

    const speds = await db.select().from(speditionenTable);
    const users = await db.select().from(usersTable);
    const spedMap: Record<number, string> = {};
    const userMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;
    for (const u of users) userMap[u.id] = u.username;

    return res.json(
      rows.map((r) => ({
        ...r,
        speditionName: spedMap[r.speditionId] ?? null,
        createdByName: r.createdBy ? userMap[r.createdBy] ?? null : null,
      })),
    );
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reconciliations", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "reconciliation.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung für Abstimmungen" });
    }

    const { speditionId, dateFrom, dateTo, cometBalance } = req.body;
    const [rec] = await db
      .insert(palletReconciliationsTable)
      .values({
        speditionId,
        dateFrom,
        dateTo,
        cometBalance: cometBalance ?? null,
        status: "offen",
        createdBy: req.session.userId,
      })
      .returning();

    await logAudit(req.session.userId!, "reconciliation", rec.id, "created", null, `${dateFrom} - ${dateTo}`);
    emit(req, "reconciliation.created", { id: rec.id }, speditionId);

    const [sped] = await db.select().from(speditionenTable).where(eq(speditionenTable.id, speditionId)).limit(1);

    // Nachrichten für Palettenabstimmung vorerst deaktiviert

    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);

    return res.status(201).json({
      ...rec,
      speditionName: sped?.name ?? null,
      createdByName: creator?.username ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reconciliations/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    const result = await getRecWithScope(id, role, sessionSpeditionId);
    if (result === null) return res.status(404).json({ error: "Not found" });
    if (result === "forbidden") return res.status(403).json({ error: "Forbidden" });
    const rec = result;

    const [sped] = await db.select().from(speditionenTable).where(eq(speditionenTable.id, rec.speditionId)).limit(1);
    const creator = rec.createdBy
      ? (await db.select().from(usersTable).where(eq(usersTable.id, rec.createdBy)).limit(1))[0]
      : null;

    return res.json({
      ...rec,
      speditionName: sped?.name ?? null,
      createdByName: creator?.username ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/reconciliations/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    if (!(await can(role, "reconciliation.sign"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }

    const result = await getRecWithScope(id, role, sessionSpeditionId);
    if (result === null) return res.status(404).json({ error: "Not found" });
    if (result === "forbidden") return res.status(403).json({ error: "Forbidden" });
    const existing = result;

    const { status, speditionBalance, cometBalance } = req.body;
    const updates: any = { updatedAt: new Date() };

    if (status !== undefined) {
      if (!["comet_admin", "comet_leitstand"].includes(role)) {
        return res.status(403).json({ error: "Only COMET can change reconciliation status" });
      }
      updates.status = status;
    }
    if (speditionBalance !== undefined && ["speditions_admin", "speditions_bearbeiter"].includes(role)) {
      if (existing.speditionBalance !== null && existing.speditionBalance !== undefined) {
        return res.status(403).json({ error: "Speditionssaldo wurde bereits eingetragen und kann nicht mehr geaendert werden" });
      }
      updates.speditionBalance = speditionBalance;
    }
    if (cometBalance !== undefined && ["comet_admin", "comet_leitstand"].includes(role)) {
      updates.cometBalance = cometBalance;
    }

    const [rec] = await db
      .update(palletReconciliationsTable)
      .set(updates)
      .where(eq(palletReconciliationsTable.id, id))
      .returning();

    for (const [field, newVal] of Object.entries(updates)) {
      if (field === "updatedAt") continue;
      const oldVal = (existing as any)[field];
      if (String(oldVal) !== String(newVal)) {
        await logAudit(
          req.session.userId!,
          "reconciliation",
          id,
          field,
          String(oldVal ?? ""),
          String(newVal ?? ""),
        );
      }
    }

    emit(req, "reconciliation.updated", { id }, existing.speditionId);

    const [sped] = await db.select().from(speditionenTable).where(eq(speditionenTable.id, rec.speditionId)).limit(1);
    const creator = rec.createdBy
      ? (await db.select().from(usersTable).where(eq(usersTable.id, rec.createdBy)).limit(1))[0]
      : null;

    return res.json({ ...rec, speditionName: sped?.name ?? null, createdByName: creator?.username ?? null });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reconciliations/:id/comments", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    const result = await getRecWithScope(id, role, sessionSpeditionId);
    if (result === null) return res.status(404).json({ error: "Not found" });
    if (result === "forbidden") return res.status(403).json({ error: "Forbidden" });

    const comments = await db
      .select()
      .from(reconciliationCommentsTable)
      .where(eq(reconciliationCommentsTable.reconciliationId, id));

    const users = await db.select().from(usersTable);
    const userMap: Record<number, { username: string; role: string }> = {};
    for (const u of users) userMap[u.id] = { username: u.username, role: u.role };

    return res.json(
      comments.map((c) => ({
        id: c.id,
        reconciliationId: c.reconciliationId,
        userId: c.userId,
        username: userMap[c.userId]?.username ?? "Unknown",
        role: userMap[c.userId]?.role ?? "unknown",
        comment: c.comment,
        createdAt: c.createdAt,
      })),
    );
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reconciliations/:id/comments", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    if (role === "comet_viewer" || role === "speditions_viewer") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await getRecWithScope(id, role, sessionSpeditionId);
    if (result === null) return res.status(404).json({ error: "Not found" });
    if (result === "forbidden") return res.status(403).json({ error: "Forbidden" });
    const rec = result;

    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: "Comment required" });

    const [c] = await db
      .insert(reconciliationCommentsTable)
      .values({ reconciliationId: id, userId: req.session.userId!, comment })
      .returning();

    await logAudit(req.session.userId!, "reconciliation", id, "comment_added", null, comment.slice(0, 100));
    emit(req, "reconciliation.comment_added", { id }, rec.speditionId);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);

    return res.status(201).json({
      id: c.id,
      reconciliationId: c.reconciliationId,
      userId: c.userId,
      username: user?.username ?? "Unknown",
      role: user?.role ?? "unknown",
      comment: c.comment,
      createdAt: c.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reconciliations/:id/accept", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const role = req.session.role!;

    if (!["comet_admin", "comet_leitstand"].includes(role)) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }

    const result = await getRecWithScope(id, role, req.session.speditionId);
    if (result === null) return res.status(404).json({ error: "Not found" });
    if (result === "forbidden") return res.status(403).json({ error: "Forbidden" });
    const rec = result;

    if (rec.cometBalance === null || rec.cometBalance === undefined) {
      return res.status(400).json({ error: "COMET Saldo fehlt – bitte zuerst eintragen" });
    }
    if (rec.speditionBalance === null || rec.speditionBalance === undefined) {
      return res.status(400).json({ error: "Spedition Saldo fehlt noch" });
    }
    if (rec.status === "abgeschlossen") {
      return res.status(400).json({ error: "Abstimmung ist bereits abgeschlossen" });
    }

    const movements = await db.select().from(palletMovementsTable).where(eq(palletMovementsTable.speditionId, rec.speditionId));
    const currentBalance = movements.reduce((sum, m) => {
      if (m.movementType === "eingang") return sum + m.amount;
      if (m.movementType === "ausgang") return sum - m.amount;
      if (m.movementType === "korrektur") return sum + m.amount;
      if (m.movementType === "anfangsbestand") return sum + m.amount;
      if (m.movementType === "abstimmung") return sum + m.amount;
      return sum;
    }, 0);

    const correctionAmount = rec.cometBalance - currentBalance;

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    if (correctionAmount !== 0) {
      await db.insert(palletMovementsTable).values({
        speditionId: rec.speditionId,
        movementType: "korrektur",
        movementDate: todayStr,
        amount: correctionAmount,
        bemerkungen: `Automatische Korrekturbuchung aus Abstimmung #${id}`,
        reconciliationId: id,
        createdBy: req.session.userId,
      });
    }

    const [updated] = await db
      .update(palletReconciliationsTable)
      .set({ status: "abgeschlossen", updatedAt: new Date() })
      .where(eq(palletReconciliationsTable.id, id))
      .returning();

    await logAudit(req.session.userId!, "reconciliation", id, "accepted", rec.status, `abgeschlossen; Korrekturbuchung: ${correctionAmount}`);
    emit(req, "reconciliation.updated", { id }, rec.speditionId);
    if (correctionAmount !== 0) emit(req, "pallet_balance.updated", { speditionId: rec.speditionId }, rec.speditionId);

    const [sped] = await db.select().from(speditionenTable).where(eq(speditionenTable.id, rec.speditionId)).limit(1);
    const creator = updated.createdBy
      ? (await db.select().from(usersTable).where(eq(usersTable.id, updated.createdBy)).limit(1))[0]
      : null;

    return res.json({
      ...updated,
      speditionName: sped?.name ?? null,
      createdByName: creator?.username ?? null,
      correctionAmount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
