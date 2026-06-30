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
      results JSONB NOT NULL DEFAULT '[]'
    )
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
    });
  }
  return rows;
}

function buildResults(
  rows: ReturnType<typeof parseCsv>,
  spedByNr: Map<string, { id: number; name: string }>
) {
  type SubGroup = { auftraegeSet: Set<string>; paletten: number };
  type Group = {
    spediteurNr: string;
    csvName: string;
    speditionId: number | null;
    speditionDbName: string | null;
    auftraegeSet: Set<string>;
    paletten: number;
    leitgebieteMap: Map<string, SubGroup>;
    liefertermineMap: Map<string, SubGroup>;
  };
  const grouped = new Map<string, Group>();

  for (const row of rows) {
    if (!grouped.has(row.spediteurNr)) {
      const cleanName = row.spedName.replace(/\s*\*\d+\*\s*$/, "").trim();
      const dbMatch = spedByNr.get(row.spediteurNr);
      grouped.set(row.spediteurNr, {
        spediteurNr:      row.spediteurNr,
        csvName:          cleanName,
        speditionId:      dbMatch?.id ?? null,
        speditionDbName:  dbMatch?.name ?? null,
        auftraegeSet:     new Set(),
        paletten:         0,
        leitgebieteMap:   new Map(),
        liefertermineMap: new Map(),
      });
    }
    const g = grouped.get(row.spediteurNr)!;
    if (row.auftrag) g.auftraegeSet.add(row.auftrag);
    g.paletten++;

    // Per-Leitgebiet: track auftraege + paletten
    if (row.leitgebiet) {
      const lg = g.leitgebieteMap.get(row.leitgebiet) ?? { auftraegeSet: new Set<string>(), paletten: 0 };
      if (row.auftrag) lg.auftraegeSet.add(row.auftrag);
      lg.paletten++;
      g.leitgebieteMap.set(row.leitgebiet, lg);
    }

    // Per-Liefertermin: track auftraege + paletten
    if (row.lfdat) {
      const lt = g.liefertermineMap.get(row.lfdat) ?? { auftraegeSet: new Set<string>(), paletten: 0 };
      if (row.auftrag) lt.auftraegeSet.add(row.auftrag);
      lt.paletten++;
      g.liefertermineMap.set(row.lfdat, lt);
    }
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
      leitgebiete: Array.from(g.leitgebieteMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([leitgebiet, sub]) => ({
          leitgebiet,
          auftraege: sub.auftraegeSet.size,
          paletten:  sub.paletten,
        })),
      liefertermine: Array.from(g.liefertermineMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([lfdat, sub]) => ({
          lfdat,
          auftraege: sub.auftraegeSet.size,
          paletten:  sub.paletten,
        })),
    }))
    .sort((a, b) => a.spediteurNr.localeCompare(b.spediteurNr));
}

// GET /api/auftragsauswertung/latest — load persisted analysis
router.get("/auftragsauswertung/latest", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "auftrag.analyse"))) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    const r = await pool.query(
      "SELECT * FROM auftrag_analyse_ergebnisse ORDER BY uploaded_at DESC LIMIT 1"
    );
    if (r.rows.length === 0) return res.json(null);
    const row = r.rows[0];
    return res.json({
      uploadedAt:     row.uploaded_at,
      filename:       row.filename,
      totalRows:      row.total_rows,
      totalPaletten:  row.total_paletten,
      totalAuftraege: row.total_auftraege,
      results:        row.results,
    });
  } catch (err) {
    console.error("[auftragsauswertung] latest", err);
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

    // Persist: replace any previous result
    await pool.query("DELETE FROM auftrag_analyse_ergebnisse");
    const inserted = await pool.query(
      `INSERT INTO auftrag_analyse_ergebnisse
         (filename, uploaded_by_id, total_rows, total_paletten, total_auftraege, results)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING uploaded_at`,
      [
        filename ?? null,
        req.session.userId ?? null,
        rows.length,
        totalPaletten,
        totalAuftraege,
        JSON.stringify(results),
      ]
    );

    return res.json({
      uploadedAt:     inserted.rows[0].uploaded_at,
      filename:       filename ?? null,
      totalRows:      rows.length,
      totalPaletten,
      totalAuftraege,
      results,
    });
  } catch (err) {
    console.error("[auftragsauswertung] upload", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

export default router;
