import { Router } from "express";
import { db } from "@workspace/db";
import {
  shipmentsTable,
  speditionenTable,
  usersTable,
  speditionPermissionsTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import type { Server as IOServer } from "socket.io";

const router = Router();

function getIO(req: any): IOServer | null {
  return req.app.get("io") || null;
}

async function emit(req: any, event: string, data: any, speditionId?: number | null) {
  const io = getIO(req);
  if (!io) return;
  let additionalSpeditionIds: number[] = [];
  if (speditionId) {
    const receivers = await db
      .select({ receivingSpeditionId: speditionPermissionsTable.receivingSpeditionId })
      .from(speditionPermissionsTable)
      .where(eq(speditionPermissionsTable.grantingSpeditionId, speditionId));
    additionalSpeditionIds = receivers.map((r) => r.receivingSpeditionId);
  }
  emitToRooms(io, event, data, speditionId, additionalSpeditionIds);
}

const COMET_OPERATIVE_FIELDS = ["status", "tor", "ataDate", "ataTime", "gesperrtFuerSpedition", "cometBearbeitet"];
const COMET_ROLES = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];
const SPED_ROLES = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"];

interface SpedAccess {
  readIds: number[];
  writeIds: number[];
}

async function getSpeditionAccess(sessionSpeditionId: number | null): Promise<SpedAccess> {
  if (!sessionSpeditionId) return { readIds: [], writeIds: [] };
  const permissions = await db
    .select()
    .from(speditionPermissionsTable)
    .where(eq(speditionPermissionsTable.receivingSpeditionId, sessionSpeditionId));
  const readIds = [sessionSpeditionId, ...permissions.map((p) => p.grantingSpeditionId)];
  const writeIds = [sessionSpeditionId, ...permissions.filter((p) => p.permissionLevel === "edit").map((p) => p.grantingSpeditionId)];
  return { readIds, writeIds };
}

async function buildShipmentResponse(shipment: any) {
  const speds = await db.select().from(speditionenTable);
  const users = await db.select().from(usersTable);
  const spedMap: Record<number, string> = {};
  const userMap: Record<number, string> = {};
  for (const s of speds) spedMap[s.id] = s.name;
  for (const u of users) userMap[u.id] = u.username;
  return {
    ...shipment,
    speditionName: shipment.speditionId ? spedMap[shipment.speditionId] ?? null : null,
    subSpeditionName: shipment.subSpeditionId ? spedMap[shipment.subSpeditionId] ?? null : null,
    createdByName: shipment.createdBy ? userMap[shipment.createdBy] ?? null : null,
    updatedByName: shipment.updatedBy ? userMap[shipment.updatedBy] ?? null : null,
  };
}

router.get("/shipments", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const { dateFrom, dateTo, speditionId, status, lkwArt, relation, kennzeichen, tor, search } =
      req.query as Record<string, string>;

    let rows = await db.select().from(shipmentsTable);

    if (SPED_ROLES.includes(role)) {
      if (!sessionSpeditionId) return res.json([]);
      const { readIds } = await getSpeditionAccess(sessionSpeditionId);
      rows = rows.filter((s) => s.speditionId !== null && readIds.includes(s.speditionId));
    }

    if (dateFrom) rows = rows.filter((s) => (s.etaDate && s.etaDate >= dateFrom) || (s.ataDate && s.ataDate >= dateFrom));
    if (dateTo) rows = rows.filter((s) => (s.etaDate && s.etaDate <= dateTo) || (s.ataDate && s.ataDate <= dateTo));
    if (speditionId) rows = rows.filter((s) => s.speditionId === Number(speditionId));
    if (status) rows = rows.filter((s) => s.status === status);
    if (lkwArt) rows = rows.filter((s) => s.lkwArt === lkwArt);
    if (relation) rows = rows.filter((s) => s.relation?.toLowerCase().includes(relation.toLowerCase()));
    if (kennzeichen) rows = rows.filter((s) => s.kennzeichen?.toLowerCase().includes(kennzeichen.toLowerCase()));
    if (tor) rows = rows.filter((s) => s.tor === tor);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (s) =>
          s.bezeichnung?.toLowerCase().includes(q) ||
          s.kennzeichen?.toLowerCase().includes(q) ||
          s.relation?.toLowerCase().includes(q),
      );
    }

    rows.sort((a, b) => {
      const aTime = a.ataTime || a.etaTime || "99:99";
      const bTime = b.ataTime || b.etaTime || "99:99";
      return aTime.localeCompare(bTime);
    });

    const speds = await db.select().from(speditionenTable);
    const users = await db.select().from(usersTable);
    const spedMap: Record<number, string> = {};
    const userMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;
    for (const u of users) userMap[u.id] = u.username;

    return res.json(
      rows.map((s) => ({
        ...s,
        speditionName: s.speditionId ? spedMap[s.speditionId] ?? null : null,
        subSpeditionName: s.subSpeditionId ? spedMap[s.subSpeditionId] ?? null : null,
        createdByName: s.createdBy ? userMap[s.createdBy] ?? null : null,
        updatedByName: s.updatedBy ? userMap[s.updatedBy] ?? null : null,
      })),
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/shipments", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    if (["comet_viewer", "speditions_viewer"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const body = req.body;
    const targetSpeditionId = body.speditionId || sessionSpeditionId || null;

    if (SPED_ROLES.includes(role) && targetSpeditionId !== sessionSpeditionId) {
      return res.status(403).json({ error: "Forbidden: cannot create shipment for another spedition" });
    }

    const [shipment] = await db
      .insert(shipmentsTable)
      .values({
        ...body,
        speditionId: targetSpeditionId,
        createdBy: req.session.userId,
        updatedBy: req.session.userId,
        status: body.status || "Angemeldet",
      })
      .returning();

    await logAudit(req.session.userId!, "shipment", shipment.id, "created", null, shipment.bezeichnung);
    emit(req, "shipment.created", { id: shipment.id }, shipment.speditionId);

    return res.status(201).json(await buildShipmentResponse(shipment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/shipments/bulk", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (["comet_viewer", "speditions_viewer"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { shipments } = req.body;
    if (!Array.isArray(shipments) || shipments.length === 0) {
      return res.status(400).json({ error: "No shipments provided" });
    }

    const sessionSpeditionId = req.session.speditionId;

    if (SPED_ROLES.includes(role)) {
      const invalid = shipments.some(
        (s: any) => s.speditionId && s.speditionId !== sessionSpeditionId,
      );
      if (invalid) {
        return res.status(403).json({ error: "Forbidden: spedition users can only bulk-create for own spedition" });
      }
    }

    const inserted = await db
      .insert(shipmentsTable)
      .values(
        shipments.map((s: any) => ({
          ...s,
          speditionId: s.speditionId || sessionSpeditionId || null,
          createdBy: req.session.userId,
          updatedBy: req.session.userId,
          status: s.status || "Angemeldet",
        })),
      )
      .returning();

    for (const s of inserted) {
      await logAudit(req.session.userId!, "shipment", s.id, "bulk_created", null, s.bezeichnung);
      emit(req, "shipment.created", { id: s.id }, s.speditionId);
    }

    return res.status(201).json(inserted);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/shipments/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;

    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, Number(req.params.id)))
      .limit(1);
    if (!shipment) return res.status(404).json({ error: "Not found" });

    if (SPED_ROLES.includes(role)) {
      const { readIds } = await getSpeditionAccess(sessionSpeditionId ?? null);
      if (!shipment.speditionId || !readIds.includes(shipment.speditionId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    return res.json(await buildShipmentResponse(shipment));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/shipments/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const id = Number(req.params.id);

    if (["comet_viewer", "speditions_viewer"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (SPED_ROLES.includes(role)) {
      const { readIds, writeIds } = await getSpeditionAccess(sessionSpeditionId ?? null);
      if (!existing.speditionId || !readIds.includes(existing.speditionId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (!writeIds.includes(existing.speditionId)) {
        return res.status(403).json({ error: "Forbidden: view-only access to this spedition's shipments" });
      }
      if (existing.gesperrtFuerSpedition) {
        return res.status(403).json({ error: "Shipment is locked for editing by Spedition" });
      }
    }

    const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);

    const SPED_ALLOWED = ["bezeichnung", "kennzeichen", "relation", "lkwArt", "etaDate", "etaTime", "bemerkungen", "telefon"];
    const COMET_ALLOWED = [...SPED_ALLOWED, "status", "tor", "ataDate", "ataTime", "gesperrtFuerSpedition", "cometBearbeitet", "speditionId", "subSpeditionId"];
    const allowedFields = isCometUser ? COMET_ALLOWED : SPED_ALLOWED;

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if ((req.body as Record<string, any>)[field] !== undefined) {
        updates[field] = (req.body as Record<string, any>)[field];
      }
    }

    if (isCometUser) {
      const editingOperative = COMET_OPERATIVE_FIELDS.some((f) => updates[f] !== undefined);
      if (editingOperative) {
        updates.cometBearbeitet = true;
        updates.gesperrtFuerSpedition = true;
      }
    }

    updates.updatedBy = req.session.userId;
    updates.updatedAt = new Date();

    const [shipment] = await db
      .update(shipmentsTable)
      .set(updates)
      .where(eq(shipmentsTable.id, id))
      .returning();

    for (const [field, newVal] of Object.entries(updates)) {
      if (field === "updatedAt" || field === "updatedBy") continue;
      const oldVal = (existing as any)[field];
      if (String(oldVal) !== String(newVal)) {
        await logAudit(req.session.userId!, "shipment", id, field, String(oldVal ?? ""), String(newVal ?? ""));
      }
    }

    const isStatusChange = updates.status && updates.status !== existing.status;
    emit(req, isStatusChange ? "shipment.status_changed" : "shipment.updated", { id }, existing.speditionId);

    return res.json(await buildShipmentResponse(shipment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/shipments/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!["comet_admin", "comet_leitstand"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const id = Number(req.params.id);
    const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    await db.delete(shipmentsTable).where(eq(shipmentsTable.id, id));
    await logAudit(req.session.userId!, "shipment", id, "deleted", existing.bezeichnung ?? null, null);
    emit(req, "shipment.deleted", { id }, existing.speditionId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/shipments/:id/lock", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!["comet_admin", "comet_leitstand"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const id = Number(req.params.id);
    const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const [shipment] = await db
      .update(shipmentsTable)
      .set({ gesperrtFuerSpedition: true, cometBearbeitet: true, updatedAt: new Date() })
      .where(eq(shipmentsTable.id, id))
      .returning();
    await logAudit(req.session.userId!, "shipment", id, "locked", "false", "true");
    emit(req, "shipment.locked", { id }, existing.speditionId);
    return res.json(await buildShipmentResponse(shipment));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/shipments/:id/unlock", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!["comet_admin", "comet_leitstand"].includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const id = Number(req.params.id);
    const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const [shipment] = await db
      .update(shipmentsTable)
      .set({ gesperrtFuerSpedition: false, updatedAt: new Date() })
      .where(eq(shipmentsTable.id, id))
      .returning();
    await logAudit(req.session.userId!, "shipment", id, "unlocked", "true", "false");
    emit(req, "shipment.unlocked", { id }, existing.speditionId);
    return res.json(await buildShipmentResponse(shipment));
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/shipments/:id/history", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const id = Number(req.params.id);

    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!shipment) return res.status(404).json({ error: "Not found" });

    if (SPED_ROLES.includes(role)) {
      const { readIds } = await getSpeditionAccess(sessionSpeditionId ?? null);
      if (!shipment.speditionId || !readIds.includes(shipment.speditionId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const entries = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.module, "shipment"), eq(auditLogTable.recordId, id)));

    const users = await db.select().from(usersTable);
    const userMap: Record<number, string> = {};
    for (const u of users) userMap[u.id] = u.username;

    return res.json(
      entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        username: e.userId ? userMap[e.userId] ?? null : null,
        module: e.module,
        recordId: e.recordId,
        field: e.field,
        oldValue: e.oldValue,
        newValue: e.newValue,
        changedAt: e.changedAt,
      })),
    );
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
