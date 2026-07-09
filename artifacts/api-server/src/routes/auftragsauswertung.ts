import { Router } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { can } from "../lib/permissions";

const upload = multer({ storage: multer.memoryStorage() });

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
  const colBeleg     = idx(["beleg"]);

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
    beleg: string;
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
      beleg:      get(colBeleg),
    });
  }
  return rows;
}

// Parse DownloadDark CSV: VBELN → NTGEW14G lookup map
function parseDarkCsv(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return map;

  // Try semicolon first, then comma
  const sep = lines[0].includes(";") ? ";" : ",";
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

  const colVbeln = idx(["vbeln"]);
  const colNtgew = idx(["ntgew14g"]);
  if (colVbeln < 0 || colNtgew < 0) return map;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep);
    const get = (col: number) => (col >= 0 ? (cells[col] ?? "").trim() : "");
    const vbeln = get(colVbeln);
    if (!vbeln) continue;
    const ntgew = parseFloat(get(colNtgew).replace(",", ".")) || 0;
    map.set(vbeln, (map.get(vbeln) ?? 0) + ntgew);
  }
  return map;
}

function buildResults(
  rows: ReturnType<typeof parseCsv>,
  spedByNr: Map<string, { id: number; name: string }>,
  darkMap: Map<string, number>
) {
  type BelegEntry = { paletten: number; punkte: number; ntgew: number };
  type LgEntry  = { auftraegeSet: Set<string>; paletten: number; punkte: number; belege: Map<string, BelegEntry> };
  type LtEntry  = { auftraegeSet: Set<string>; paletten: number; punkte: number; leitgebiete: Map<string, LgEntry> };
  type SpedEntry = {
    spediteurNr: string; csvName: string;
    speditionId: number | null; speditionDbName: string | null;
    auftraegeSet: Set<string>; paletten: number; punkte: number;
    liefertermine: Map<string, LtEntry>;
  };

  const grouped = new Map<string, SpedEntry>();
  // Track which Belege have already had their Punkte counted (count once per unique delivery)
  const countedBelege = new Set<string>();

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
    // Punkte only counted once per unique Beleg (delivery number)
    const isNewBeleg = !!row.beleg && !countedBelege.has(row.beleg);
    if (row.beleg) countedBelege.add(row.beleg);
    const rowPunkte = isNewBeleg ? (darkMap.get(row.beleg) ?? 0) * 3 : 0;
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
      lt.leitgebiete.set(lgKey, { auftraegeSet: new Set(), paletten: 0, punkte: 0, belege: new Map() });
    }
    const lg = lt.leitgebiete.get(lgKey)!;
    if (row.auftrag) lg.auftraegeSet.add(row.auftrag);
    lg.paletten++;
    lg.punkte += rowPunkte;

    // Accumulate per-Beleg data within this Leitgebiet
    if (row.beleg) {
      const ntgew = darkMap.get(row.beleg) ?? 0;
      if (!lg.belege.has(row.beleg)) {
        lg.belege.set(row.beleg, { paletten: 0, punkte: isNewBeleg ? ntgew * 3 : 0, ntgew });
      }
      lg.belege.get(row.beleg)!.paletten++;
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
      punkte:          Math.ceil(g.punkte),
      freigegeben:     false,
      liefertermine: Array.from(g.liefertermine.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([lfdat, lt]) => ({
          lfdat: lfdat === "__kein_termin__" ? "" : lfdat,
          auftraege: lt.auftraegeSet.size,
          paletten:  lt.paletten,
          punkte:    Math.ceil(lt.punkte),
          leitgebiete: Array.from(lt.leitgebiete.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([lg, sub]) => ({
              leitgebiet: lg === "__kein_leitgebiet__" ? "" : lg,
              auftraege:  sub.auftraegeSet.size,
              paletten:   sub.paletten,
              punkte:     Math.ceil(sub.punkte),
              belege: Array.from(sub.belege.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([beleg, b]) => ({
                  beleg,
                  paletten: b.paletten,
                  punkte:   Math.ceil(b.punkte),
                  ntgew:    Math.round(b.ntgew * 100) / 100,
                })),
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

// GET /api/auftragsauswertung/vergleich — compare latest Auswertung with open shipments
router.get("/auftragsauswertung/vergleich", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    const sessionSpeditionId = req.session.speditionId ?? null;
    const canFull = await can(role, "auftrag.analyse");
    const canSped = await can(role, "auftrag.analyse.spedition");
    if (!canFull && !canSped) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }

    // Load latest Auswertung
    const aRow = await pool.query(
      "SELECT results FROM auftrag_analyse_ergebnisse ORDER BY uploaded_at DESC LIMIT 1"
    );
    if (aRow.rows.length === 0) return res.json({ lkwOhneAuftrag: [], auftragOhneLkw: [] });
    let results: any[] = aRow.rows[0].results ?? [];

    // Spedition users: only see their own row if it is freigegeben
    if (!canFull && canSped && sessionSpeditionId) {
      const myRow = results.find((e: any) => e.speditionId === sessionSpeditionId && e.freigegeben === true);
      if (!myRow) return res.json({ lkwOhneAuftrag: [], auftragOhneLkw: [] });
      results = [myRow];
    }

    // Build Auswertung set: key = "speditionId::relation" (only matched entries)
    // Also track meta per key for the "auftragOhneLkw" list
    type LieferterminDetail = { lfdat: string; paletten: number; punkte: number };
    type AuftragEntry = {
      spediteurNr: string; speditionId: number; speditionName: string;
      leitgebiet: string; paletten: number; punkte: number;
      liefertermine: LieferterminDetail[];
    };
    const auftragMap = new Map<string, AuftragEntry>();
    for (const sped of results) {
      if (!sped.speditionId) continue;
      for (const lt of sped.liefertermine ?? []) {
        for (const lg of lt.leitgebiete ?? []) {
          const rel = (lg.leitgebiet ?? "").trim();
          const key = `${sped.speditionId}::${rel.toLowerCase()}`;
          if (!auftragMap.has(key)) {
            auftragMap.set(key, {
              spediteurNr: sped.spediteurNr,
              speditionId: sped.speditionId,
              speditionName: sped.speditionDbName ?? sped.csvName,
              leitgebiet: rel,
              paletten: 0,
              punkte: 0,
              liefertermine: [],
            });
          }
          const entry = auftragMap.get(key)!;
          entry.paletten += lg.paletten ?? 0;
          entry.punkte   += lg.punkte ?? 0;
          // Accumulate per-Liefertermin detail
          const existing = entry.liefertermine.find((x) => x.lfdat === lt.lfdat);
          if (existing) {
            existing.paletten += lg.paletten ?? 0;
            existing.punkte   += lg.punkte ?? 0;
          } else {
            entry.liefertermine.push({
              lfdat:    lt.lfdat,
              paletten: lg.paletten ?? 0,
              punkte:   lg.punkte ?? 0,
            });
          }
        }
      }
    }
    // Sort each liefertermine list chronologically
    for (const entry of auftragMap.values()) {
      entry.liefertermine.sort((a, b) => a.lfdat.localeCompare(b.lfdat));
    }

    // Load open shipments (not Abgefertigt/Storniert)
    // For sped users: restrict to their own speditionId
    const sRows = (!canFull && canSped && sessionSpeditionId)
      ? await pool.query(`
          SELECT s.id, s.spedition_id, s.relation, s.eta_date, s.status, s.bezeichnung, sp.name AS spedition_name
          FROM shipments s
          LEFT JOIN speditionen sp ON sp.id = s.spedition_id
          WHERE s.status NOT IN ('Abgefertigt', 'Storniert')
            AND s.spedition_id = $1
        `, [sessionSpeditionId])
      : await pool.query(`
          SELECT s.id, s.spedition_id, s.relation, s.eta_date, s.status, s.bezeichnung, sp.name AS spedition_name
          FROM shipments s
          LEFT JOIN speditionen sp ON sp.id = s.spedition_id
          WHERE s.status NOT IN ('Abgefertigt', 'Storniert')
            AND s.spedition_id IS NOT NULL
        `);

    // Build shipment set: key = "speditionId::relation"
    type ShipmentGroup = {
      speditionId: number; speditionName: string; relation: string;
      count: number; earliestEta: string | null;
    };
    const shipmentMap = new Map<string, ShipmentGroup>();
    for (const row of sRows.rows) {
      const rel = (row.relation ?? "").trim();
      const key = `${row.spedition_id}::${rel.toLowerCase()}`;
      if (!shipmentMap.has(key)) {
        shipmentMap.set(key, {
          speditionId:   row.spedition_id,
          speditionName: row.spedition_name ?? `#${row.spedition_id}`,
          relation:      rel,
          count:         0,
          earliestEta:   null,
        });
      }
      const g = shipmentMap.get(key)!;
      g.count++;
      if (row.eta_date && (!g.earliestEta || row.eta_date < g.earliestEta)) {
        g.earliestEta = row.eta_date;
      }
    }

    const PALETTEN_PRO_LKW = 32;

    // Case A: LKW ohne Auftrag — shipment key NOT in auftragMap
    const lkwOhneAuftrag = Array.from(shipmentMap.values())
      .filter((g) => !auftragMap.has(`${g.speditionId}::${g.relation.toLowerCase()}`))
      .sort((a, b) => a.speditionName.localeCompare(b.speditionName) || a.relation.localeCompare(b.relation));

    // Case B: Auftrag ohne LKW — auftrag key NOT in shipmentMap
    const auftragOhneLkw = Array.from(auftragMap.values())
      .filter((e) => !shipmentMap.has(`${e.speditionId}::${e.leitgebiet.toLowerCase()}`))
      .sort((a, b) => a.speditionName.localeCompare(b.speditionName) || a.leitgebiet.localeCompare(b.leitgebiet));

    // Case C: Both present but capacity doesn't match
    // fehlendeLkw > 0 → need more LKWs; < 0 → surplus LKWs
    type KapazitaetEntry = {
      speditionId: number; speditionName: string; leitgebiet: string;
      paletten: number; punkte: number;
      lkwCount: number; lkwKapazitaet: number; fehlendeLkw: number;
    };
    const kapazitaetAbweichung: KapazitaetEntry[] = [];
    for (const [key, auftrag] of auftragMap.entries()) {
      const sGroup = shipmentMap.get(key);
      if (!sGroup) continue; // handled by Case B
      const lkwKapazitaet = sGroup.count * PALETTEN_PRO_LKW;
      const fehlendeLkw = Math.ceil(auftrag.paletten / PALETTEN_PRO_LKW) - sGroup.count;
      if (fehlendeLkw !== 0) {
        kapazitaetAbweichung.push({
          speditionId:   auftrag.speditionId,
          speditionName: auftrag.speditionName,
          leitgebiet:    auftrag.leitgebiet,
          paletten:      auftrag.paletten,
          punkte:        auftrag.punkte,
          lkwCount:      sGroup.count,
          lkwKapazitaet,
          fehlendeLkw,
        });
      }
    }
    kapazitaetAbweichung.sort((a, b) =>
      a.speditionName.localeCompare(b.speditionName) || a.leitgebiet.localeCompare(b.leitgebiet)
    );

    return res.json({ lkwOhneAuftrag, auftragOhneLkw, kapazitaetAbweichung });
  } catch (err) {
    console.error("[auftragsauswertung] vergleich", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

// POST /api/auftragsauswertung/upload — parse CSV, persist, return result
router.post(
  "/auftragsauswertung/upload",
  requireAuth,
  upload.fields([{ name: "zlthu2", maxCount: 1 }, { name: "dark", maxCount: 1 }]),
  async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "auftrag.analyse"))) {
      return res.status(403).json({ error: "Keine Berechtigung für Auftragsauswertung" });
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const zlthu2File = files?.["zlthu2"]?.[0];
    const darkFile   = files?.["dark"]?.[0];

    if (!zlthu2File) {
      return res.status(400).json({ error: "Keine ZLTHU2-Datei hochgeladen" });
    }
    if (!darkFile) {
      return res.status(400).json({ error: "Keine DownloadDark-Datei hochgeladen (NTGEW14G-Datei fehlt)" });
    }

    const zlthu2Csv = zlthu2File.buffer.toString("utf-8");
    const darkCsv   = darkFile.buffer.toString("utf-8");
    const filename  = zlthu2File.originalname;

    const rows = parseCsv(zlthu2Csv);
    if (rows.length === 0) {
      return res.status(400).json({ error: "Keine auswertbaren Zeilen gefunden (Spediteur-Spalte leer?)" });
    }

    const darkMap = parseDarkCsv(darkCsv);

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

    const results = buildResults(rows, spedByNr, darkMap);
    const totalPaletten  = results.reduce((s, r) => s + r.paletten, 0);
    const totalAuftraege = results.reduce((s, r) => s + r.auftraege, 0);
    const totalPunkte    = Math.ceil(results.reduce((s, r) => s + r.punkte, 0));

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
