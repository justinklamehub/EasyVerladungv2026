import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  shipmentsTable,
  speditionenTable,
  usersTable,
  speditionPermissionsTable,
  auditLogTable,
  settingsTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import { can } from "../lib/permissions";
import { notify } from "../lib/notify";
import { sendEventEmail, buildShipmentTableHtml, buildShipmentTableText, buildBulkTableHtml, buildBulkTableText } from "../lib/email";
import type { Server as IOServer } from "socket.io";

const router = Router();

async function getEffectiveDailyLimit(speditionId: number): Promise<number | null> {
  const [spedRow] = await db
    .select({ dailyShipmentLimit: speditionenTable.dailyShipmentLimit })
    .from(speditionenTable)
    .where(eq(speditionenTable.id, speditionId))
    .limit(1);
  const staticLimit = spedRow?.dailyShipmentLimit ?? null;
  try {
    const result = await pool.query(
      `SELECT MIN(max_verladungen)::int AS lim FROM spedition_shipment_limits
       WHERE spedition_id = $1 AND von <= NOW() AND bis >= NOW()`,
      [speditionId],
    );
    const periodLimit: number | null = result.rows[0]?.lim ?? null;
    const candidates = [staticLimit, periodLimit].filter((l): l is number => l != null);
    if (candidates.length === 0) return null;
    return Math.min(...candidates);
  } catch {
    return staticLimit;
  }
}

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
  const active = permissions.filter((p) => p.permissionLevel === "view" || p.permissionLevel === "edit");
  const readIds = [sessionSpeditionId, ...active.map((p) => p.grantingSpeditionId)];
  const writeIds = [sessionSpeditionId, ...active.filter((p) => p.permissionLevel === "edit").map((p) => p.grantingSpeditionId)];
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
    createdByName: shipment.createdBy ? userMap[shipment.createdBy] ?? null : null,
    updatedByName: shipment.updatedBy ? userMap[shipment.updatedBy] ?? null : null,
  };
}

router.get("/shipments", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId;
    const { dateFrom, dateTo, speditionId, status, lkwArt, relation, kennzeichen, tor, search, activeOnly } =
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
    if (activeOnly === "true" || activeOnly === "1") {
      rows = rows.filter((s) => s.status !== "Abgefertigt" && s.status !== "Storniert");
    }
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

    if (!(await can(role, "shipment.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung zum Erstellen von Sendungen" });
    }

    const body = req.body;
    const targetSpeditionId = body.speditionId || sessionSpeditionId || null;

    if (SPED_ROLES.includes(role) && targetSpeditionId !== sessionSpeditionId) {
      return res.status(403).json({ error: "Forbidden: cannot create shipment for another spedition" });
    }

    if (targetSpeditionId) {
      const effectiveLimit = await getEffectiveDailyLimit(targetSpeditionId);
      if (effectiveLimit != null) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [countRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(shipmentsTable)
          .where(and(eq(shipmentsTable.speditionId, targetSpeditionId), gte(shipmentsTable.createdAt, todayStart)));
        const todayCount = Number(countRow?.count ?? 0);
        if (todayCount >= effectiveLimit) {
          return res.status(429).json({
            error: `Tageslimit erreicht: Diese Spedition darf maximal ${effectiveLimit} Verladung${effectiveLimit !== 1 ? "en" : ""} pro Tag anlegen.`,
          });
        }
      }
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

    // E-Mail-Benachrichtigung (fire-and-forget)
    (async () => {
      try {
        const [spedRow, creatorRow] = await Promise.all([
          shipment.speditionId
            ? db.select({ name: speditionenTable.name }).from(speditionenTable).where(eq(speditionenTable.id, shipment.speditionId)).limit(1)
            : Promise.resolve([]),
          req.session.userId
            ? db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.session.userId)).limit(1)
            : Promise.resolve([]),
        ]);
        const spedName = (spedRow as { name: string }[])[0]?.name ?? "";
        const subSpedName = shipment.subSpedition ?? "";
        const creatorEmail = (creatorRow as { email: string }[])[0]?.email ?? undefined;
        const ALL_SHIP_FIELDS = [
          { key: "bezeichnung", label: "Bezeichnung", value: shipment.bezeichnung ?? "" },
          { key: "kennzeichen", label: "Kennzeichen", value: shipment.kennzeichen ?? "" },
          { key: "spedition", label: "Spedition", value: spedName },
          { key: "subSpedition", label: "Sub-Spedition", value: subSpedName },
          { key: "relation", label: "Relation", value: shipment.relation ?? "" },
          { key: "lkwArt", label: "LKW-Art", value: shipment.lkwArt ?? "" },
          { key: "telefon", label: "Telefon Fahrer", value: shipment.telefon ?? "" },
          { key: "eta", label: "ETA", value: [shipment.etaDate, shipment.etaTime].filter(Boolean).join(" ") },
          { key: "ata", label: "ATA", value: [shipment.ataDate, shipment.ataTime].filter(Boolean).join(" ") },
          { key: "tor", label: "Tor", value: shipment.tor ?? "" },
          { key: "status", label: "Status", value: shipment.status ?? "" },
          { key: "wareStatus", label: "Ware-Status", value: shipment.wareStatus ?? "" },
          { key: "datum", label: "Datum (E-Mail)", value: new Date().toLocaleDateString("de-DE") },
          { key: "bemerkungen", label: "Bemerkungen", value: shipment.bemerkungen ?? "" },
        ];
        const tabelleSettingRow = await db.select({ value: settingsTable.value })
          .from(settingsTable).where(eq(settingsTable.key, "email_tpl_shipment_tabelle_felder")).limit(1);
        let enabledShipKeys: string[] = ALL_SHIP_FIELDS.map((f) => f.key);
        if (tabelleSettingRow[0]?.value) {
          try { enabledShipKeys = JSON.parse(tabelleSettingRow[0].value); } catch { /* keep default */ }
        }
        const tableRows = enabledShipKeys
          .map((k) => ALL_SHIP_FIELDS.find((f) => f.key === k))
          .filter((f): f is (typeof ALL_SHIP_FIELDS)[number] => f != null)
          .map((f) => ({ label: f.label, value: f.value }));
        await sendEventEmail(
          "shipment",
          {
            bezeichnung: shipment.bezeichnung ?? "",
            kennzeichen: shipment.kennzeichen ?? "",
            status: shipment.status ?? "",
            datum: new Date().toLocaleDateString("de-DE"),
            spedition: spedName,
            tabelle: buildShipmentTableText(tableRows),
            tabelleHtml: buildShipmentTableHtml(tableRows),
          },
          creatorEmail || undefined,
        );
      } catch {}
    })();

    if (SPED_ROLES.includes(role)) {
      const io = getIO(req);
      if (io) {
        const label = shipment.bezeichnung || shipment.kennzeichen || `#${shipment.id}`;
        const spedName = shipment.speditionId
          ? (await db.select({ name: speditionenTable.name }).from(speditionenTable).where(eq(speditionenTable.id, shipment.speditionId)).limit(1))[0]?.name
          : null;
        const todayIso = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
        const isToday = !shipment.etaDate || shipment.etaDate === todayIso;
        await notify(io, {
          targetRoles: ["comet_admin", "comet_leitstand"],
          title: "Neue Verladung angemeldet",
          message: `${spedName ? spedName + ": " : ""}${label}`,
          type: "info",
          linkTo: "/shipments",
          pushEventKey: "shipment.created",
          suppressPush: !isToday,
          pushVars: {
            id: String(shipment.id),
            bezeichnung: shipment.bezeichnung ?? "",
            kennzeichen: shipment.kennzeichen ?? "",
            spedition: spedName ?? "",
            relation: shipment.relation ?? "",
            etaDate: shipment.etaDate ?? "",
            etaTime: shipment.etaTime ?? "",
            lkwArt: shipment.lkwArt ?? "",
            telefon: shipment.telefon ?? "",
            tor: shipment.tor ?? "",
            status: shipment.status ?? "",
            wareStatus: shipment.wareStatus ?? "",
          },
        });
      }
    }

    return res.status(201).json(await buildShipmentResponse(shipment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/shipments/bulk", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "shipment.create"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
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

    const bulkSpeditionId = shipments[0]?.speditionId || sessionSpeditionId || null;
    if (bulkSpeditionId) {
      const effectiveLimit = await getEffectiveDailyLimit(bulkSpeditionId);
      if (effectiveLimit != null) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [countRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(shipmentsTable)
          .where(and(eq(shipmentsTable.speditionId, bulkSpeditionId), gte(shipmentsTable.createdAt, todayStart)));
        const todayCount = Number(countRow?.count ?? 0);
        const remaining = effectiveLimit - todayCount;
        if (remaining <= 0) {
          return res.status(429).json({
            error: `Tageslimit erreicht: Diese Spedition darf maximal ${effectiveLimit} Verladung${effectiveLimit !== 1 ? "en" : ""} pro Tag anlegen.`,
          });
        }
        if (shipments.length > remaining) {
          return res.status(429).json({
            error: `Tageslimit überschritten: Noch ${remaining} von ${effectiveLimit} Verladung${effectiveLimit !== 1 ? "en" : ""} heute möglich, aber ${shipments.length} angefordert.`,
          });
        }
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

    // E-Mail-Benachrichtigung (fire-and-forget)
    (async () => {
      try {
        const bulkSpedId = inserted[0]?.speditionId;
        const [spedRows, creatorRows] = await Promise.all([
          bulkSpedId
            ? db.select({ name: speditionenTable.name }).from(speditionenTable).where(eq(speditionenTable.id, bulkSpedId)).limit(1)
            : Promise.resolve([]),
          req.session.userId
            ? db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.session.userId)).limit(1)
            : Promise.resolve([]),
        ]);
        const spedName = (spedRows as { name: string }[])[0]?.name ?? "";
        const creatorEmail = (creatorRows as { email: string }[])[0]?.email ?? undefined;
        const bulkDatum = new Date().toLocaleDateString("de-DE");
        const bulkRows = inserted.map((s) => ({
          bezeichnung:  s.bezeichnung ?? "",
          kennzeichen:  s.kennzeichen ?? "",
          spedition:    spedName,
          subSpedition: s.subSpedition ?? "",
          relation:     s.relation ?? "",
          lkwArt:       s.lkwArt ?? "",
          telefon:      s.telefon ?? "",
          eta:          [s.etaDate, s.etaTime].filter(Boolean).join(" "),
          ata:          [s.ataDate, s.ataTime].filter(Boolean).join(" "),
          tor:          s.tor ?? "",
          status:       s.status ?? "",
          wareStatus:   s.wareStatus ?? "",
          datum:        bulkDatum,
          bemerkungen:  s.bemerkungen ?? "",
        }));
        const bulkTabelleRow = await db.select({ value: settingsTable.value })
          .from(settingsTable).where(eq(settingsTable.key, "email_tpl_bulk_tabelle_felder")).limit(1);
        let enabledBulkKeys: string[] | undefined;
        if (bulkTabelleRow[0]?.value) {
          try { enabledBulkKeys = JSON.parse(bulkTabelleRow[0].value); } catch { /* keep default */ }
        }
        await sendEventEmail(
          "bulk",
          {
            anzahl: String(inserted.length),
            datum: new Date().toLocaleDateString("de-DE"),
            spedition: spedName,
            tabelle: buildBulkTableText(bulkRows, enabledBulkKeys),
            tabelleHtml: buildBulkTableHtml(bulkRows, enabledBulkKeys),
          },
          creatorEmail || undefined,
        );
      } catch {}
    })();

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

    if (!(await can(role, "shipment.edit"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
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
      if (existing.wareStatus === "ausgedruckt") {
        return res.status(403).json({ error: "Das Deckblatt wurde bereits gedruckt. Die Verladung kann nicht mehr bearbeitet werden." });
      }
      if (existing.ataDate) {
        return res.status(403).json({ error: "Sendung kann nicht mehr bearbeitet werden, da ATA bereits eingetragen ist" });
      }
    }

    const isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role);

    const SPED_ALLOWED = ["bezeichnung", "kennzeichen", "relation", "lkwArt", "etaDate", "etaTime", "bemerkungen", "telefon", "wareStatus"];
    const COMET_ALLOWED = [...SPED_ALLOWED, "status", "tor", "ataDate", "ataTime", "gesperrtFuerSpedition", "cometBearbeitet", "speditionId", "subSpedition"];
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

    if (isStatusChange) {
      const io = getIO(req);
      if (io) {
        const label = shipment.bezeichnung || shipment.kennzeichen || `#${id}`;
        const spedNameStatus = shipment.speditionId
          ? (await db.select({ name: speditionenTable.name }).from(speditionenTable).where(eq(speditionenTable.id, shipment.speditionId)).limit(1))[0]?.name ?? ""
          : "";
        const basePushVars = {
          id: String(shipment.id),
          bezeichnung: shipment.bezeichnung ?? "",
          kennzeichen: shipment.kennzeichen ?? "",
          spedition: spedNameStatus,
          relation: shipment.relation ?? "",
          tor: shipment.tor ?? "",
          status: shipment.status ?? "",
        };
        if (updates.status === "Angekommen") {
          await notify(io, {
            targetRoles: ["comet_lager", "comet_leitstand"],
            title: "LKW angekommen",
            message: `${label} ist eingetroffen${shipment.tor ? " – " + shipment.tor : ""}.`,
            type: "info",
            linkTo: "/shipments",
            pushEventKey: "shipment.arrived",
            pushVars: { ...basePushVars, ataDate: shipment.ataDate ?? "", ataTime: shipment.ataTime ?? "" },
          });
        } else if (updates.status === "Abgefertigt") {
          await notify(io, {
            targetRoles: ["comet_admin", "comet_leitstand"],
            title: "Verladung abgefertigt",
            message: `${label} wurde abgefertigt.`,
            type: "success",
            linkTo: "/shipments",
            pushEventKey: "shipment.dispatched",
            pushVars: basePushVars,
          });
        }
      }
    }

    return res.json(await buildShipmentResponse(shipment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/shipments/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "shipment.delete"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
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
    if (!(await can(role, "shipment.lock"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
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
    if (!(await can(role, "shipment.lock"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
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

router.patch("/shipments/:id/reschedule", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "shipment.reschedule"))) {
      return res.status(403).json({ error: "Keine Berechtigung zum Verschieben von Sendungen" });
    }
    const id = Number(req.params.id);
    const { newDate } = req.body;
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return res.status(400).json({ error: "newDate im Format YYYY-MM-DD erforderlich" });
    }
    const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Sendung nicht gefunden" });

    const [shipment] = await db
      .update(shipmentsTable)
      .set({ etaDate: newDate, updatedAt: new Date(), updatedBy: req.session.userId })
      .where(eq(shipmentsTable.id, id))
      .returning();

    await logAudit(req.session.userId!, "shipment", id, "etaDate", existing.etaDate ?? null, newDate);
    emit(req, "shipment.updated", { id }, existing.speditionId);
    return res.json(await buildShipmentResponse(shipment));
  } catch (err) {
    console.error(err);
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
