import { Router } from "express";
import { db, pool } from "@workspace/db";
import { wareneingangProtokollTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

export async function ensureWareneingangTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wareneingang_protokolle (
      id                      SERIAL PRIMARY KEY,
      lfd_nr                  INTEGER NOT NULL,
      shipment_id             INTEGER REFERENCES shipments(id),
      lkwid                   TEXT,
      palettenschein_nr       TEXT,
      anlieferungsdatum       DATE,
      beauftrage_spedition    TEXT,
      ausfuehrende_spedition  TEXT,
      kfz_kennzeichen         TEXT,
      anz_paletten            TEXT,
      defekte_paletten        TEXT,
      anz_kartons_soll        TEXT,
      anz_kartons_ist         TEXT,
      art_retoure             BOOLEAN DEFAULT false,
      art_serviceware         BOOLEAN DEFAULT false,
      art_sonstiges           BOOLEAN DEFAULT false,
      lagerplatz_retoure      TEXT,
      lagerplatz_serviceware  TEXT,
      lagerplatz_sonstiges    TEXT,
      bemerkungen             TEXT,
      ware_erhalten_datum     DATE,
      unterschrift            TEXT,
      druckbuchstaben         TEXT,
      eingereicht_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
}

router.post("/scanner/wareneingang", async (req, res) => {
  try {
    const {
      shipmentId,
      lkwid,
      palettenscheinNr,
      anlieferungsdatum,
      beauftrageSpedition,
      ausfuehrendeSpedition,
      kfzKennzeichen,
      anzPaletten,
      defektePaletten,
      anzKartonsSoll,
      anzKartonsIst,
      artRetoure,
      artServiceware,
      artSonstiges,
      lagerplatzRetoure,
      lagerplatzServiceware,
      lagerplatzSonstiges,
      bemerkungen,
      wareErhaltenDatum,
      unterschrift,
      druckbuchstaben,
    } = req.body as Record<string, unknown>;

    const lfdResult = await pool.query("SELECT COALESCE(MAX(lfd_nr), 0) + 1 AS next FROM wareneingang_protokolle");
    const lfdNr = Number(lfdResult.rows[0].next);

    const [row] = await db
      .insert(wareneingangProtokollTable)
      .values({
        lfdNr,
        shipmentId:            shipmentId ? Number(shipmentId) : null,
        lkwid:                 lkwid as string ?? null,
        palettenscheinNr:      palettenscheinNr as string ?? null,
        anlieferungsdatum:     anlieferungsdatum as string ?? null,
        beauftrageSpedition:   beauftrageSpedition as string ?? null,
        ausfuehrendeSpedition: ausfuehrendeSpedition as string ?? null,
        kfzKennzeichen:        kfzKennzeichen as string ?? null,
        anzPaletten:           anzPaletten as string ?? null,
        defektePaletten:       defektePaletten as string ?? null,
        anzKartonsSoll:        anzKartonsSoll as string ?? null,
        anzKartonsIst:         anzKartonsIst as string ?? null,
        artRetoure:            Boolean(artRetoure),
        artServiceware:        Boolean(artServiceware),
        artSonstiges:          Boolean(artSonstiges),
        lagerplatzRetoure:     lagerplatzRetoure as string ?? null,
        lagerplatzServiceware: lagerplatzServiceware as string ?? null,
        lagerplatzSonstiges:   lagerplatzSonstiges as string ?? null,
        bemerkungen:           bemerkungen as string ?? null,
        wareErhaltenDatum:     wareErhaltenDatum as string ?? null,
        unterschrift:          unterschrift as string ?? null,
        druckbuchstaben:       druckbuchstaben as string ?? null,
      })
      .returning();

    return res.status(201).json({ ok: true, id: row.id, lfdNr: row.lfdNr });
  } catch (err) {
    console.error("POST /scanner/wareneingang error:", err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

router.get("/wareneingang-protokolle", requireAuth, async (req, res) => {
  try {
    const shipmentId = req.query.shipmentId ? Number(req.query.shipmentId) : null;
    let rows;
    if (shipmentId) {
      rows = await db
        .select()
        .from(wareneingangProtokollTable)
        .where(eq(wareneingangProtokollTable.shipmentId, shipmentId))
        .orderBy(desc(wareneingangProtokollTable.eingereichtAt))
        .limit(200);
    } else {
      rows = await db
        .select()
        .from(wareneingangProtokollTable)
        .orderBy(desc(wareneingangProtokollTable.eingereichtAt))
        .limit(200);
    }
    return res.json(rows);
  } catch (err) {
    console.error("GET /wareneingang-protokolle error:", err);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

export default router;
