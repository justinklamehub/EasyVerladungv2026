import { Router } from "express";
import { db } from "@workspace/db";
import { shipmentFotosTable, shipmentsTable, speditionenTable, speditionPermissionsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, desc, ilike, isNotNull } from "drizzle-orm";
import { requireAuth, isCometRole } from "../lib/auth";
import { can } from "../lib/permissions";

const router = Router();

const SPED_ROLES = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"];

async function getReadableSpeditionIds(sessionSpeditionId: number | null | undefined): Promise<number[]> {
  if (!sessionSpeditionId) return [];
  const permissions = await db
    .select()
    .from(speditionPermissionsTable)
    .where(eq(speditionPermissionsTable.receivingSpeditionId, sessionSpeditionId));
  return [sessionSpeditionId, ...permissions.map((p) => p.grantingSpeditionId)];
}

/**
 * POST /scanner/fotos
 * Public (kiosk-style Scanner flow, same as /scanner/gefahrgut) — creates a photo
 * record pointing at an already-uploaded object storage path.
 */
router.post("/scanner/fotos", async (req, res) => {
  try {
    const { shipmentId, kennzeichen, gefahrgutChecklisteId, objectPath, fileName, contentType } = req.body as {
      shipmentId?: number | null;
      kennzeichen?: string | null;
      gefahrgutChecklisteId?: number | null;
      objectPath?: string;
      fileName?: string | null;
      contentType?: string | null;
    };

    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "objectPath erforderlich" });
    }

    const [inserted] = await db
      .insert(shipmentFotosTable)
      .values({
        shipmentId: shipmentId ?? null,
        gefahrgutChecklisteId: gefahrgutChecklisteId ?? null,
        kennzeichen: kennzeichen ? String(kennzeichen).toUpperCase().trim() : null,
        objectPath,
        fileName: fileName || null,
        contentType: contentType || null,
      })
      .returning();

    return res.status(201).json({ success: true, id: inserted.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler beim Speichern des Fotos" });
  }
});

/**
 * GET /fotos
 * Requires auth + isCometRole or "foto.view" permission.
 * Filters: kennzeichen, speditionId, shipmentId, dateFrom, dateTo
 */
router.get("/fotos", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const allowed = isCometRole(role) || (await can(role, "foto.view"));
    if (!allowed) {
      return res.status(403).json({ error: "Keine Berechtigung (foto.view)" });
    }

    const { kennzeichen, speditionId, shipmentId, dateFrom, dateTo } = req.query as {
      kennzeichen?: string;
      speditionId?: string;
      shipmentId?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const conditions = [];
    if (kennzeichen) conditions.push(ilike(shipmentFotosTable.kennzeichen, `%${kennzeichen}%`));
    if (shipmentId) conditions.push(eq(shipmentFotosTable.shipmentId, Number(shipmentId) as number));
    if (dateFrom) conditions.push(gte(shipmentFotosTable.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(shipmentFotosTable.createdAt, new Date(`${dateTo}T23:59:59.999Z`)));

    // Spedition-only users (granted access via foto.view) may only see photos of
    // shipments they can read - never unassigned (blanko) photos.
    if (SPED_ROLES.includes(role)) {
      const readIds = await getReadableSpeditionIds(req.session.speditionId);
      if (readIds.length === 0) return res.json([]);
      const shipmentIds = await db
        .select({ id: shipmentsTable.id })
        .from(shipmentsTable)
        .where(inArray(shipmentsTable.speditionId, readIds));
      const ids = shipmentIds.map((s) => s.id);
      if (ids.length === 0) return res.json([]);
      conditions.push(inArray(shipmentFotosTable.shipmentId, ids));
    }

    if (speditionId) {
      const sid = Number(speditionId);
      const shipmentIds = await db
        .select({ id: shipmentsTable.id })
        .from(shipmentsTable)
        .where(eq(shipmentsTable.speditionId, sid));
      const ids = shipmentIds.map((s) => s.id);
      conditions.push(ids.length > 0 ? inArray(shipmentFotosTable.shipmentId, ids) : isNotNull(shipmentFotosTable.id));
      if (ids.length === 0) return res.json([]);
    }

    const rows = await db
      .select({
        id: shipmentFotosTable.id,
        shipmentId: shipmentFotosTable.shipmentId,
        gefahrgutChecklisteId: shipmentFotosTable.gefahrgutChecklisteId,
        kennzeichen: shipmentFotosTable.kennzeichen,
        objectPath: shipmentFotosTable.objectPath,
        fileName: shipmentFotosTable.fileName,
        contentType: shipmentFotosTable.contentType,
        createdAt: shipmentFotosTable.createdAt,
        shipmentBezeichnung: shipmentsTable.bezeichnung,
        shipmentSpeditionId: shipmentsTable.speditionId,
      })
      .from(shipmentFotosTable)
      .leftJoin(shipmentsTable, eq(shipmentFotosTable.shipmentId, shipmentsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(shipmentFotosTable.createdAt))
      .limit(500);

    const spedIds = [...new Set(rows.map((r) => r.shipmentSpeditionId).filter((id): id is number => id !== null))];
    const spedMap: Record<number, string> = {};
    if (spedIds.length > 0) {
      const speds = await db
        .select({ id: speditionenTable.id, name: speditionenTable.name })
        .from(speditionenTable)
        .where(inArray(speditionenTable.id, spedIds));
      for (const s of speds) spedMap[s.id] = s.name;
    }

    const enriched = rows.map((r) => ({
      ...r,
      speditionName: r.shipmentSpeditionId != null ? (spedMap[r.shipmentSpeditionId] ?? null) : null,
    }));

    return res.json(enriched);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

export default router;
