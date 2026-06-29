import { Router } from "express";
import { db } from "@workspace/db";
import { speditionenTable, speditionPermissionsTable, speditionContactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { emitToRooms } from "../lib/socket-emit";
import type { Server as IOServer } from "socket.io";

function getIO(req: any): IOServer | null {
  return req.app.get("io") || null;
}

function emit(req: any, event: string, data: any, speditionId?: number | null, additionalIds?: number[]) {
  const io = getIO(req);
  if (io) emitToRooms(io, event, data, speditionId, additionalIds);
}

const router = Router();

router.get("/speditionen", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(speditionenTable).orderBy(speditionenTable.name);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/speditionen", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Speditionen anlegen" });
    }
    const { name, kuerzel, ansprechpartner, email, telefon, status, bemerkungen, palletFaktor,
            preisProKm, mindestpreisProFahrt, palettenAufschlag, kraftstoffzuschlagProzent, fixkostenProFahrt, mautProKm,
            dailyShipmentLimit } = req.body;
    const [sped] = await db
      .insert(speditionenTable)
      .values({
        name, kuerzel, ansprechpartner, email, telefon, status: status || "aktiv", bemerkungen,
        palletFaktor: Number(palletFaktor) || 1,
        preisProKm: preisProKm != null ? Number(preisProKm) : null,
        mindestpreisProFahrt: mindestpreisProFahrt != null ? Number(mindestpreisProFahrt) : null,
        palettenAufschlag: palettenAufschlag != null ? Number(palettenAufschlag) : null,
        kraftstoffzuschlagProzent: kraftstoffzuschlagProzent != null ? Number(kraftstoffzuschlagProzent) : null,
        fixkostenProFahrt: fixkostenProFahrt != null ? Number(fixkostenProFahrt) : null,
        mautProKm: mautProKm != null ? Number(mautProKm) : null,
        dailyShipmentLimit: dailyShipmentLimit != null && dailyShipmentLimit !== "" ? Number(dailyShipmentLimit) : null,
      })
      .returning();
    await logAudit(req.session.userId!, "spedition", sped.id, "created", null, name);
    return res.status(201).json(sped);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/speditionen/:id", requireAuth, async (req, res) => {
  try {
    const [sped] = await db
      .select()
      .from(speditionenTable)
      .where(eq(speditionenTable.id, Number(req.params.id)))
      .limit(1);
    if (!sped) return res.status(404).json({ error: "Not found" });
    return res.json(sped);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/speditionen/:id", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Speditionen bearbeiten" });
    }

    const id = Number(req.params.id);
    const { name, kuerzel, ansprechpartner, email, telefon, status, bemerkungen, palletFaktor,
            preisProKm, mindestpreisProFahrt, palettenAufschlag, kraftstoffzuschlagProzent, fixkostenProFahrt, mautProKm,
            dailyShipmentLimit } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (kuerzel !== undefined) updates.kuerzel = kuerzel;
    if (ansprechpartner !== undefined) updates.ansprechpartner = ansprechpartner;
    if (email !== undefined) updates.email = email;
    if (telefon !== undefined) updates.telefon = telefon;
    if (status !== undefined) updates.status = status;
    if (bemerkungen !== undefined) updates.bemerkungen = bemerkungen;
    if (palletFaktor !== undefined) updates.palletFaktor = Number(palletFaktor) || 1;
    if (preisProKm !== undefined) updates.preisProKm = preisProKm != null ? Number(preisProKm) : null;
    if (mindestpreisProFahrt !== undefined) updates.mindestpreisProFahrt = mindestpreisProFahrt != null ? Number(mindestpreisProFahrt) : null;
    if (palettenAufschlag !== undefined) updates.palettenAufschlag = palettenAufschlag != null ? Number(palettenAufschlag) : null;
    if (kraftstoffzuschlagProzent !== undefined) updates.kraftstoffzuschlagProzent = kraftstoffzuschlagProzent != null ? Number(kraftstoffzuschlagProzent) : null;
    if (fixkostenProFahrt !== undefined) updates.fixkostenProFahrt = fixkostenProFahrt != null ? Number(fixkostenProFahrt) : null;
    if (mautProKm !== undefined) updates.mautProKm = mautProKm != null ? Number(mautProKm) : null;
    if (dailyShipmentLimit !== undefined) updates.dailyShipmentLimit = dailyShipmentLimit != null && dailyShipmentLimit !== "" ? Number(dailyShipmentLimit) : null;
    updates.updatedAt = new Date();

    const [sped] = await db.update(speditionenTable).set(updates).where(eq(speditionenTable.id, id)).returning();
    if (!sped) return res.status(404).json({ error: "Not found" });
    await logAudit(req.session.userId!, "spedition", id, "updated", null, JSON.stringify(updates));
    return res.json(sped);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/speditionen/:id/received-permissions", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const id = Number(req.params.id);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === id;
    if (!["comet_admin", "comet_leitstand"].includes(role) && !isOwnSped) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const perms = await db
      .select()
      .from(speditionPermissionsTable)
      .where(eq(speditionPermissionsTable.receivingSpeditionId, id));

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    return res.json(
      perms.map((p) => ({
        grantingSpeditionId: p.grantingSpeditionId,
        grantingSpeditionName: spedMap[p.grantingSpeditionId] ?? null,
        receivingSpeditionId: p.receivingSpeditionId,
        permissionLevel: p.permissionLevel,
      })),
    );
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/speditionen/:id/permissions", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const id = Number(req.params.id);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === id;
    if (!["comet_admin", "comet_leitstand"].includes(role) && !isOwnSped) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const perms = await db
      .select()
      .from(speditionPermissionsTable)
      .where(eq(speditionPermissionsTable.grantingSpeditionId, id));

    const speds = await db.select().from(speditionenTable);
    const spedMap: Record<number, string> = {};
    for (const s of speds) spedMap[s.id] = s.name;

    return res.json(
      perms.map((p) => ({
        grantingSpeditionId: p.grantingSpeditionId,
        receivingSpeditionId: p.receivingSpeditionId,
        receivingSpeditionName: spedMap[p.receivingSpeditionId] ?? null,
        permissionLevel: p.permissionLevel,
      })),
    );
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/speditionen/:id/permissions", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const grantingId = Number(req.params.id);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === grantingId;
    if (role !== "comet_admin" && !isOwnSped) {
      return res.status(403).json({ error: "Nur COMET Admin oder eigene Spedition kann Zugriffsrechte verwalten" });
    }
    const { receivingSpeditionId, permissionLevel } = req.body;

    const existing = await db
      .select()
      .from(speditionPermissionsTable)
      .where(
        and(
          eq(speditionPermissionsTable.grantingSpeditionId, grantingId),
          eq(speditionPermissionsTable.receivingSpeditionId, receivingSpeditionId),
        ),
      )
      .limit(1);

    let perm;
    if (existing.length > 0) {
      [perm] = await db
        .update(speditionPermissionsTable)
        .set({ permissionLevel })
        .where(
          and(
            eq(speditionPermissionsTable.grantingSpeditionId, grantingId),
            eq(speditionPermissionsTable.receivingSpeditionId, receivingSpeditionId),
          ),
        )
        .returning();
    } else {
      [perm] = await db
        .insert(speditionPermissionsTable)
        .values({ grantingSpeditionId: grantingId, receivingSpeditionId, permissionLevel })
        .returning();
    }

    await logAudit(req.session.userId!, "spedition", grantingId, "permission_set", null, `${receivingSpeditionId}:${permissionLevel}`);

    const [receivingSped] = await db
      .select({ name: speditionenTable.name })
      .from(speditionenTable)
      .where(eq(speditionenTable.id, receivingSpeditionId))
      .limit(1);

    emit(req, "permission.updated", { grantingSpeditionId: grantingId, receivingSpeditionId, permissionLevel }, grantingId, [receivingSpeditionId]);

    return res.json({
      grantingSpeditionId: perm.grantingSpeditionId,
      receivingSpeditionId: perm.receivingSpeditionId,
      receivingSpeditionName: receivingSped?.name ?? null,
      permissionLevel: perm.permissionLevel,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/speditionen/:id/permissions/:receivingId", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const grantingId = Number(req.params.id);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === grantingId;
    if (role !== "comet_admin" && !isOwnSped) {
      return res.status(403).json({ error: "Nur COMET Admin oder eigene Spedition kann Zugriffsrechte entfernen" });
    }
    const receivingId = Number(req.params.receivingId);

    await db
      .delete(speditionPermissionsTable)
      .where(
        and(
          eq(speditionPermissionsTable.grantingSpeditionId, grantingId),
          eq(speditionPermissionsTable.receivingSpeditionId, receivingId),
        ),
      );

    await logAudit(req.session.userId!, "spedition", grantingId, "permission_removed", null, String(receivingId));
    emit(req, "permission.updated", { grantingSpeditionId: grantingId, receivingSpeditionId: receivingId, permissionLevel: null }, grantingId, [receivingId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Ansprechpartner (Contacts) ────────────────────────────────────────────────

router.get("/speditionen/:id/contacts", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const id = Number(req.params.id);
    const allowed = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer",
                     "speditions_admin", "speditions_bearbeiter", "speditions_viewer"];
    if (!allowed.includes(role)) return res.status(403).json({ error: "Forbidden" });
    const contacts = await db
      .select()
      .from(speditionContactsTable)
      .where(eq(speditionContactsTable.speditionId, id))
      .orderBy(speditionContactsTable.createdAt);
    return res.json(contacts);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/speditionen/:id/contacts", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Ansprechpartner anlegen" });
    }
    const speditionId = Number(req.params.id);
    const { name, bereich, telefon, email, bemerkungen } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name ist erforderlich" });
    const [contact] = await db
      .insert(speditionContactsTable)
      .values({ speditionId, name: name.trim(), bereich: bereich || null, telefon: telefon || null, email: email || null, bemerkungen: bemerkungen || null })
      .returning();
    await logAudit(req.session.userId!, "spedition", speditionId, "contact_created", null, name);
    return res.status(201).json(contact);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/speditionen/:id/contacts/:contactId", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Ansprechpartner bearbeiten" });
    }
    const speditionId = Number(req.params.id);
    const contactId = Number(req.params.contactId);
    const { name, bereich, telefon, email, bemerkungen } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (bereich !== undefined) updates.bereich = bereich || null;
    if (telefon !== undefined) updates.telefon = telefon || null;
    if (email !== undefined) updates.email = email || null;
    if (bemerkungen !== undefined) updates.bemerkungen = bemerkungen || null;
    const [contact] = await db
      .update(speditionContactsTable)
      .set(updates)
      .where(and(eq(speditionContactsTable.id, contactId), eq(speditionContactsTable.speditionId, speditionId)))
      .returning();
    if (!contact) return res.status(404).json({ error: "Nicht gefunden" });
    return res.json(contact);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/speditionen/:id/contacts/:contactId", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Ansprechpartner löschen" });
    }
    const speditionId = Number(req.params.id);
    const contactId = Number(req.params.contactId);
    await db
      .delete(speditionContactsTable)
      .where(and(eq(speditionContactsTable.id, contactId), eq(speditionContactsTable.speditionId, speditionId)));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
