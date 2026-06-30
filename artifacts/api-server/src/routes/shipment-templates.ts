import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

export async function ensureShipmentTemplatesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_templates (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      bezeichnung  TEXT,
      lkw_art      TEXT,
      eta_time     TEXT,
      tor          TEXT,
      spedition_id INTEGER,
      relation     TEXT,
      telefon      TEXT,
      status       TEXT NOT NULL DEFAULT 'Angemeldet',
      created_by   INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

router.get("/shipments/templates", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, s.name AS spedition_name
       FROM shipment_templates t
       LEFT JOIN speditionen s ON t.spedition_id = s.id
       ORDER BY t.name ASC`,
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[templates] GET", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.post("/shipments/templates", requireAuth, async (req, res) => {
  try {
    const { name, bezeichnung, lkwArt, etaTime, tor, speditionId, relation, telefon, status } = req.body as {
      name?: string;
      bezeichnung?: string;
      lkwArt?: string;
      etaTime?: string;
      tor?: string;
      speditionId?: number | null;
      relation?: string;
      telefon?: string;
      status?: string;
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: "Name ist erforderlich" });
    }

    const result = await pool.query(
      `INSERT INTO shipment_templates
         (name, bezeichnung, lkw_art, eta_time, tor, spedition_id, relation, telefon, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        name.trim(),
        bezeichnung?.trim() || null,
        lkwArt || null,
        etaTime || null,
        tor || null,
        speditionId || null,
        relation?.trim() || null,
        telefon?.trim() || null,
        status || "Angemeldet",
        req.session.userId,
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[templates] POST", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.patch("/shipments/templates/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });

    const { name, bezeichnung, lkwArt, etaTime, tor, speditionId, relation, telefon, status } = req.body as {
      name?: string;
      bezeichnung?: string;
      lkwArt?: string;
      etaTime?: string;
      tor?: string;
      speditionId?: number | null;
      relation?: string;
      telefon?: string;
      status?: string;
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: "Name ist erforderlich" });
    }

    const result = await pool.query(
      `UPDATE shipment_templates SET
         name=$1, bezeichnung=$2, lkw_art=$3, eta_time=$4, tor=$5,
         spedition_id=$6, relation=$7, telefon=$8, status=$9, updated_at=NOW()
       WHERE id=$10
       RETURNING *`,
      [
        name.trim(),
        bezeichnung?.trim() || null,
        lkwArt || null,
        etaTime || null,
        tor || null,
        speditionId || null,
        relation?.trim() || null,
        telefon?.trim() || null,
        status || "Angemeldet",
        id,
      ],
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Vorlage nicht gefunden" });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[templates] PATCH", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

router.delete("/shipments/templates/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Ungültige ID" });
    await pool.query("DELETE FROM shipment_templates WHERE id=$1", [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[templates] DELETE", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

export default router;
