import { Router } from "express";
import { db, pool } from "@workspace/db";
import { speditionenTable, speditionPermissionsTable, speditionContactsTable, speditionRelationenTable } from "@workspace/db";
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

function mapSpedition(r: any) {
  return {
    id: r.id,
    name: r.name,
    kuerzel: r.kuerzel,
    ansprechpartner: r.ansprechpartner,
    email: r.email,
    telefon: r.telefon,
    status: r.status,
    bemerkungen: r.bemerkungen,
    speditionsnummer: r.speditionsnummer ?? null,
    palletFaktor: r.pallet_faktor ?? r.palletFaktor ?? 1,
    preisProKm: r.preis_pro_km ?? r.preisProKm ?? null,
    mindestpreisProFahrt: r.mindestpreis_pro_fahrt ?? r.mindestpreisProFahrt ?? null,
    palettenAufschlag: r.paletten_aufschlag ?? r.palettenAufschlag ?? null,
    kraftstoffzuschlagProzent: r.kraftstoffzuschlag_prozent ?? r.kraftstoffzuschlagProzent ?? null,
    fixkostenProFahrt: r.fixkosten_pro_fahrt ?? r.fixkostenProFahrt ?? null,
    mautProKm: r.maut_pro_km ?? r.mautProKm ?? null,
    dailyShipmentLimit: r.daily_shipment_limit ?? r.dailyShipmentLimit ?? null,
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
  };
}

router.get("/speditionen", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM speditionen ORDER BY name");
    return res.json(result.rows.map(mapSpedition));
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
            dailyShipmentLimit, speditionsnummer } = req.body;
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
    if (speditionsnummer !== undefined) {
      await pool.query("UPDATE speditionen SET speditionsnummer=$1 WHERE id=$2", [speditionsnummer || null, sped.id]);
    }
    const fresh = await pool.query("SELECT * FROM speditionen WHERE id=$1", [sped.id]);
    await logAudit(req.session.userId!, "spedition", sped.id, "created", null, name);
    return res.status(201).json(fresh.rows[0] ?? sped);
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
            dailyShipmentLimit, speditionsnummer } = req.body;
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
    if (speditionsnummer !== undefined) {
      await pool.query("UPDATE speditionen SET speditionsnummer=$1 WHERE id=$2", [speditionsnummer || null, id]);
    }
    const fresh = await pool.query("SELECT * FROM speditionen WHERE id=$1", [id]);
    await logAudit(req.session.userId!, "spedition", id, "updated", null, JSON.stringify(updates));
    return res.json(fresh.rows[0] ?? sped);
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

// COMET Admin: Spedition zur Whitelist hinzufügen (level = 'pending')
router.post("/speditionen/:id/permissions", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const grantingId = Number(req.params.id);
    if (role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann die Freigabe-Whitelist verwalten" });
    }
    const { receivingSpeditionId } = req.body;
    if (!receivingSpeditionId) {
      return res.status(400).json({ error: "receivingSpeditionId erforderlich" });
    }

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

    if (existing.length > 0) {
      return res.status(409).json({ error: "Diese Spedition ist bereits freigegeben" });
    }

    const [perm] = await db
      .insert(speditionPermissionsTable)
      .values({ grantingSpeditionId: grantingId, receivingSpeditionId, permissionLevel: "pending" })
      .returning();

    await logAudit(req.session.userId!, "spedition", grantingId, "permission_whitelisted", null, `${receivingSpeditionId}`);

    const [receivingSped] = await db
      .select({ name: speditionenTable.name })
      .from(speditionenTable)
      .where(eq(speditionenTable.id, receivingSpeditionId))
      .limit(1);

    emit(req, "permission.updated", { grantingSpeditionId: grantingId, receivingSpeditionId, permissionLevel: "pending" }, grantingId, [receivingSpeditionId]);

    return res.status(201).json({
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

// Speditionsadmin: Level für einen COMET-freigegebenen Eintrag setzen (view/edit/pending)
router.put("/speditionen/:id/permissions/:receivingId", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const grantingId = Number(req.params.id);
    const receivingId = Number(req.params.receivingId);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === grantingId;
    if (role !== "comet_admin" && !isOwnSped) {
      return res.status(403).json({ error: "Nur COMET Admin oder eigener Speditionsadmin kann das Level setzen" });
    }
    const { permissionLevel } = req.body;
    if (!["view", "edit", "pending"].includes(permissionLevel)) {
      return res.status(400).json({ error: "Ungültiges Level (view / edit / pending)" });
    }

    const [perm] = await db
      .update(speditionPermissionsTable)
      .set({ permissionLevel })
      .where(
        and(
          eq(speditionPermissionsTable.grantingSpeditionId, grantingId),
          eq(speditionPermissionsTable.receivingSpeditionId, receivingId),
        ),
      )
      .returning();

    if (!perm) {
      return res.status(404).json({ error: "Freigabe nicht gefunden" });
    }

    await logAudit(req.session.userId!, "spedition", grantingId, "permission_level_set", null, `${receivingId}:${permissionLevel}`);
    emit(req, "permission.updated", { grantingSpeditionId: grantingId, receivingSpeditionId: receivingId, permissionLevel }, grantingId, [receivingId]);

    return res.json({ ok: true, permissionLevel });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// COMET Admin: Spedition aus der Whitelist entfernen
router.delete("/speditionen/:id/permissions/:receivingId", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const grantingId = Number(req.params.id);
    if (role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Einträge aus der Whitelist entfernen" });
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

// ── Zeitraum-Tageslimits ──────────────────────────────────────────────────────

router.get("/speditionen/:id/limits", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query(
      "SELECT id, spedition_id AS \"speditionId\", von, bis, max_verladungen AS \"maxVerladungen\", created_at AS \"createdAt\" FROM spedition_shipment_limits WHERE spedition_id = $1 ORDER BY von",
      [id],
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/speditionen/:id/limits", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Limits anlegen" });
    }
    const speditionId = Number(req.params.id);
    const { von, bis, maxVerladungen } = req.body;
    if (!von || !bis || !maxVerladungen) {
      return res.status(400).json({ error: "von, bis und maxVerladungen sind erforderlich" });
    }
    if (new Date(von) >= new Date(bis)) {
      return res.status(400).json({ error: "von muss vor bis liegen" });
    }
    const result = await pool.query(
      `INSERT INTO spedition_shipment_limits (spedition_id, von, bis, max_verladungen)
       VALUES ($1, $2, $3, $4)
       RETURNING id, spedition_id AS "speditionId", von, bis, max_verladungen AS "maxVerladungen", created_at AS "createdAt"`,
      [speditionId, von, bis, Number(maxVerladungen)],
    );
    await logAudit(req.session.userId!, "spedition", speditionId, "limit_created", null, `${von} - ${bis}: ${maxVerladungen}/Tag`);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/speditionen/:id/limits/:limitId", requireAuth, async (req, res) => {
  try {
    if (req.session.role !== "comet_admin") {
      return res.status(403).json({ error: "Nur COMET Admin kann Limits löschen" });
    }
    const speditionId = Number(req.params.id);
    const limitId = Number(req.params.limitId);
    await pool.query(
      "DELETE FROM spedition_shipment_limits WHERE id = $1 AND spedition_id = $2",
      [limitId, speditionId],
    );
    await logAudit(req.session.userId!, "spedition", speditionId, "limit_deleted", null, String(limitId));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Relationen ───────────────────────────────────────────────────────────────

router.get("/speditionen/:id/relationen", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const spedId = Number(req.params.id);
    const sessionSpedId = req.session.speditionId;
    const isOwnSped = role === "speditions_admin" && sessionSpedId === spedId;

    if (role !== "comet_admin" && !isOwnSped) {
      // Check if speditions_admin has an active permission to this spedition
      if (role === "speditions_admin" && sessionSpedId) {
        const [perm] = await db
          .select()
          .from(speditionPermissionsTable)
          .where(
            and(
              eq(speditionPermissionsTable.grantingSpeditionId, spedId),
              eq(speditionPermissionsTable.receivingSpeditionId, sessionSpedId),
            ),
          )
          .limit(1);
        if (!perm || (perm.permissionLevel !== "view" && perm.permissionLevel !== "edit")) {
          return res.status(403).json({ error: "Kein Zugriff" });
        }
      } else {
        return res.status(403).json({ error: "Kein Zugriff" });
      }
    }

    const rows = await db
      .select()
      .from(speditionRelationenTable)
      .where(eq(speditionRelationenTable.speditionId, spedId));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/speditionen/:id/relationen", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const spedId = Number(req.params.id);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === spedId;
    if (role !== "comet_admin" && !isOwnSped) {
      return res.status(403).json({ error: "Kein Zugriff" });
    }
    const { name, kuerzel, ort } = req.body;
    const kuerzelTrimmed = kuerzel?.trim() ?? "";
    const ortTrimmed     = ort?.trim() ?? "";
    // Accept either {kuerzel, ort} or legacy {name}
    const combinedName = kuerzelTrimmed && ortTrimmed
      ? `${kuerzelTrimmed} - ${ortTrimmed}`
      : (name?.trim() ?? "");
    if (!combinedName) return res.status(400).json({ error: "Kürzel und Ort erforderlich" });
    const [row] = await db
      .insert(speditionRelationenTable)
      .values({
        speditionId: spedId,
        name: combinedName,
        kuerzel: kuerzelTrimmed || null,
        ort: ortTrimmed || null,
      })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/speditionen/:id/relationen/:relId", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const spedId = Number(req.params.id);
    const relId = Number(req.params.relId);
    const isOwnSped = role === "speditions_admin" && req.session.speditionId === spedId;
    if (role !== "comet_admin" && !isOwnSped) {
      return res.status(403).json({ error: "Kein Zugriff" });
    }
    await db
      .delete(speditionRelationenTable)
      .where(and(eq(speditionRelationenTable.id, relId), eq(speditionRelationenTable.speditionId, spedId)));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Startup: Tabellen sicherstellen ──────────────────────────────────────────

export async function ensureSpeditionLimitsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spedition_shipment_limits (
      id SERIAL PRIMARY KEY,
      spedition_id INTEGER NOT NULL REFERENCES speditionen(id) ON DELETE CASCADE,
      von TIMESTAMPTZ NOT NULL,
      bis TIMESTAMPTZ NOT NULL,
      max_verladungen INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function ensureSpeditionRelationenTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spedition_relationen (
      id SERIAL PRIMARY KEY,
      spedition_id INTEGER NOT NULL REFERENCES speditionen(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add kuerzel / ort columns if not yet present
  await pool.query(`ALTER TABLE spedition_relationen ADD COLUMN IF NOT EXISTS kuerzel TEXT`);
  await pool.query(`ALTER TABLE spedition_relationen ADD COLUMN IF NOT EXISTS ort TEXT`);
  // Migrate existing rows: split "AGB - Graben" → kuerzel="AGB", ort="Graben"
  await pool.query(`
    UPDATE spedition_relationen
    SET
      kuerzel = TRIM(SPLIT_PART(name, ' - ', 1)),
      ort     = TRIM(SUBSTRING(name FROM POSITION(' - ' IN name) + 3))
    WHERE kuerzel IS NULL AND name LIKE '% - %'
  `);
}

export default router;
