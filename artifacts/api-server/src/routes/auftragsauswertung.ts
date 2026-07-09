import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { can } from "../lib/permissions";

const router = Router();

export async function ensureAuftragAnalyseTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auftrag_analyse_ergebnisse (
      id SERIAL PRIMARY KEY,
      uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      filename TEXT,
      uploaded_by_id INTEGER,
      total_rows INTEGER NOT NULL DEFAULT 0,
      total_paletten INTEGER NOT NULL DEFAULT 0,
      total_auftraege INTEGER NOT NULL DEFAULT 0,
      total_punkte NUMERIC NOT NULL DEFAULT 0,
      results JSONB NOT NULL DEFAULT '[]'
    )
  `);
  await pool.query(`
    ALTER TABLE auftrag_analyse_ergebnisse
    ADD COLUMN IF NOT EXISTS total_punkte NUMERIC NOT NULL DEFAULT 0
  `);
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = ";";
  const headers = lines[0]
    .split(sep)
    .map((h) => h.trim().replace(/^\uFEFF/, "").toLowerCase());

  const idx = (keywords: string[]) => {
    for (const kw of keywords) {
      const i = headers.findIndex((h) => h.includes(kw));
      if (i >= 0) return i;
    }
    return -1;
  };

  const colAuftrag   = idx(["verkaufsb"]);
  const colLfdat     = idx(["lfdat"]);
  const colSpediteur = idx(["spediteur"]);
  const colRelation  = idx(["relation"]);
  const colKarton    = idx(["kartonanz"]);
  const colNtgew     = idx(["ntgew14g"]);

  // "name 1" appears twice: 1st = Kundenname, 2nd = Speditionsname
  let spedNameCol = -1;
  let nameCount = 0;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === "name 1") {
      nameCount++;
      if (nameCount === 2) { spedNameCol = i; break; }
    }
  }

  const rows: Array<{
    auftrag: string;
    lfdat: string;
    spediteurNr: string;
    spedName: string;
    leitgebiet: string;
    kartons: number;
    ntgew: number;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep);
    const get = (col: number) => (col >= 0 ? (cells[col] ?? "").trim() : "");
    const spediteurNr = get(colSpediteur);
    if (!spediteurNr) continue;
    rows.push({
      auftrag:    get(colAuftrag),
      lfdat:      get(colLfdat),
      spediteurNr,
      spedName:   spedNameCol >= 0 ? get(spedNameCol) : "",
      leitgebiet: get(colRelation),
      kartons:    parseInt(get(colKarton)) || 0,
      ntgew:      parseFloat(get(colNtgew).replace(",", ".")) || 0,
    });
  }
  return rows;
}

function buildResults(
  rows: ReturnType<typeof parseCsv>,
  spedByNr: Map<string, { id: number; name: string }>
) {
  type LgEntry  = { auftraegeSet: Set<string>; paletten: number; punkte: number };
  type LtEntry  = { auftraegeSet: Set<string>; paletten: number; punkte: number; leitgebiete: Map<string, LgEntry> };
  type SpedEntry = {
    spediteurNr: string; csvName: string;
    speditionId: number | null; speditionDbName: string | null;
    auftraegeSet: Set<string>; paletten: number; punkte: number;
    liefertermine: Map<string, LtEntry>;
  };

  const grouped = new Map<string, SpedEntry>();

  for (const row of rows) {
    if (!grouped.has(row.spediteurNr)) {
      const cleanName = row.spedName.replace(/\s*\*\d+\*\s*$/, "").trim();
      const dbMatch   = spedByNr.get(row.spediteurNr);
      grouped.set(row.spediteurNr, {
        spediteurNr:    row.spediteurNr,
        csvName:        cleanName,
        speditionId:    dbMatch?.id ?? null,
        speditionDbName: dbMatch?.name ?? null,
        auftraegeSet:   new Set(),
        paletten:       0,
        punkte:         0,
        liefertermine:  new Map(),
      });
    }
    const rowPunkte = row.ntgew * 3;
    const g = grouped.get(row.spediteurNr)!;
    if (row.auftrag) g.auftraegeSet.add(row.auftrag);
    g.paletten++;
    g.punkte += rowPunkte;

    // Nest: Liefertermin → Leitgebiet
    const lfdatKey = row.lfdat || "__kein_termin__";
    if (!g.liefertermine.has(lfdatKey)) {
      g.liefertermine.set(lfdatKey, { auftraegeSet: new Set(), paletten: 0, punkte: 0, leitgebiete: new Map() });
    }
    const lt = g.liefertermine.get(lfdatKey)!;
    if (row.auftrag) lt.auftraegeSet.add(row.auftrag);
    lt.paletten++;
    lt.punkte += rowPunkte;

    const lgKey = row.leitgebiet || "__kein_leitgebiet__";
    if (!lt.leitgebiete.has(lgKey)) {
      lt.leitgebiete.set(lgKey, { auftraegeSet: new Set(), paletten: 0, punkte: 0 });
    }
    const lg = lt.leitgebiete.get(lgKey)!;
    if (row.auftrag) lg.auftraegeSet.add(row.auftrag);
    lg.paletten++;
    lg.punkte += rowPunkte;
  }

  return Array.from(grouped.values())
    .map((g) => ({
      spediteurNr:     g.spediteurNr,
      csvName:         g.csvName,
      speditionId:     g.speditionId,
      speditionDbName: g.speditionDbName,
      matched:         g.speditionId !== null,
      auftraege:       g.auftraegeSet.size,
      paletten:        g.paletten,
      punkte:          Math.round(g.punkte * 100) / 100,
      freigegeben:     false,
      liefertermine: Array.from(g.liefertermine.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([lfdat, lt]) => ({
          lfdat: lfdat === "__kein_termin__" ? "" : lfdat,
          auftraege: lt.auftraegeSet.size,
          paletten:  lt.paletten,
          punkte:    Math.round(lt.punkte * 100) / 100,
          leitgebiete: Array.from(lt.leitgebiete.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([lg, sub]) => ({
              leitgebiet: lg === "__kein_leitgebiet__" ? "" : lg,
              auftraege:  sub.auftraegeSet.size,
              paletten:   sub.paletten,
              punkte:     Math.round(sub.punkte * 100) / 100,
            })),
        })),
    }))
    .sort((a, b) => a.spediteurNr.localeCompare(b.spediteurNr));
}

// GET /api/auftragsauswertung/latest — load persisted analysis
router.get("/auftragsauswertung/latest", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const speditionId = req.session.speditionId ?? null;
    const canFull  = await can(role, "auftrag.analyse");
    const canSped  = await can(role, "auftrag.analyse.spedition");
    if (!canFull && !canSped) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    const r = await pool.query(`
      SELECT a.*, u.username AS uploaded_by_username
      FROM auftrag_analyse_ergebnisse a
      LEFT JOIN users u ON u.id = a.uploaded_by_id
      ORDER BY a.uploaded_at DESC LIMIT 1
    `);
    if (r.rows.length === 0) return res.json(null);
    const row = r.rows[0];
    let results: any[] = row.results ?? [];

    // Spedition users only see their own row + freigegeben rows
    if (!canFull && canSped && speditionId) {
      results = results.filter(
        (e: any) => e.speditionId === speditionId || e.freigegeben === true
      );
    }

    return res.json({
      uploadedAt:          row.uploaded_at,
      filename:            row.filename,
      uploadedByUsername:  row.uploaded_by_username ?? null,
      totalRows:           row.total_rows,
      totalPaletten:       row.total_paletten,
      totalAuftraege:      row.total_auftraege,
      totalPunkte:         parseFloat(row.total_punkte) || 0,
      results,
    });
  } catch (err) {
    console.error("[auftragsauswertung] latest", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

// PATCH /api/auftragsauswertung/freigaben — toggle freigabe for one row (admin only)
router.patch("/auftragsauswertung/freigaben", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "auftrag.analyse"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    const { spediteurNr, freigegeben } = req.body as { spediteurNr: string; freigegeben: boolean };
    if (!spediteurNr || typeof freigegeben !== "boolean") {
      return res.status(400).json({ error: "spediteurNr und freigegeben (boolean) erforderlich" });
    }

    const r = await pool.query(
      "SELECT id, results FROM auftrag_analyse_ergebnisse ORDER BY uploaded_at DESC LIMIT 1"
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Keine Auswertung vorhanden" });

    const { id, results } = r.rows[0];
    const updated = (results as any[]).map((e: any) =>
      e.spediteurNr === spediteurNr ? { ...e, freigegeben } : e
    );
    await pool.query(
      "UPDATE auftrag_analyse_ergebnisse SET results = $1 WHERE id = $2",
      [JSON.stringify(updated), id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[auftragsauswertung] freigaben", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

// POST /api/auftragsauswertung/upload — parse CSV, persist, return result
router.post("/auftragsauswertung/upload", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "auftrag.analyse"))) {
      return res.status(403).json({ error: "Keine Berechtigung für Auftragsauswertung" });
    }

    const { csv, filename } = req.body as { csv?: string; filename?: string };
    if (!csv?.trim()) {
      return res.status(400).json({ error: "Keine CSV-Daten übermittelt" });
    }

    const rows = parseCsv(csv);
    if (rows.length === 0) {
      return res.status(400).json({ error: "Keine auswertbaren Zeilen gefunden (Spediteur-Spalte leer?)" });
    }

    // Load active speditionen for matching by speditionsnummer
    const spedResult = await pool.query(
      "SELECT id, name, speditionsnummer FROM speditionen WHERE status = 'aktiv'"
    );
    const spedByNr = new Map<string, { id: number; name: string }>();
    for (const s of spedResult.rows) {
      if (s.speditionsnummer) {
        spedByNr.set(String(s.speditionsnummer).trim(), { id: s.id, name: s.name });
      }
    }

    const results = buildResults(rows, spedByNr);
    const totalPaletten  = results.reduce((s, r) => s + r.paletten, 0);
    const totalAuftraege = results.reduce((s, r) => s + r.auftraege, 0);
    const totalPunkte    = Math.round(results.reduce((s, r) => s + r.punkte, 0) * 100) / 100;

    // Persist: replace any previous result
    await pool.query("DELETE FROM auftrag_analyse_ergebnisse");
    const inserted = await pool.query(
      `INSERT INTO auftrag_analyse_ergebnisse
         (filename, uploaded_by_id, total_rows, total_paletten, total_auftraege, total_punkte, results)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING uploaded_at`,
      [
        filename ?? null,
        req.session.userId ?? null,
        rows.length,
        totalPaletten,
        totalAuftraege,
        totalPunkte,
        JSON.stringify(results),
      ]
    );

    return res.json({
      uploadedAt:     inserted.rows[0].uploaded_at,
      filename:       filename ?? null,
      totalRows:      rows.length,
      totalPaletten,
      totalAuftraege,
      totalPunkte,
      results,
    });
  } catch (err) {
    console.error("[auftragsauswertung] upload", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

export default router;
