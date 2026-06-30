import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { can } from "../lib/permissions";

const router = Router();

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

router.post("/auftragsauswertung/upload", requireAuth, async (req, res) => {
  try {
    const role = req.session.role!;
    if (!(await can(role, "auftrag.analyse"))) {
      return res.status(403).json({ error: "Keine Berechtigung für Auftragsauswertung" });
    }

    const { csv } = req.body as { csv?: string };
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

    // Group by Spediteur number
    type Group = {
      spediteurNr: string;
      csvName: string;
      speditionId: number | null;
      speditionDbName: string | null;
      auftraegeSet: Set<string>;
      paletten: number;
      leitgebieteMap: Map<string, number>;
      liefertermineSet: Set<string>;
      kartons: number;
    };
    const grouped = new Map<string, Group>();

    for (const row of rows) {
      if (!grouped.has(row.spediteurNr)) {
        const cleanName = row.spedName.replace(/\s*\*\d+\*\s*$/, "").trim();
        const dbMatch = spedByNr.get(row.spediteurNr);
        grouped.set(row.spediteurNr, {
          spediteurNr:     row.spediteurNr,
          csvName:         cleanName,
          speditionId:     dbMatch?.id ?? null,
          speditionDbName: dbMatch?.name ?? null,
          auftraegeSet:    new Set(),
          paletten:        0,
          leitgebieteMap:  new Map(),
          liefertermineSet: new Set(),
          kartons:         0,
        });
      }
      const g = grouped.get(row.spediteurNr)!;
      if (row.auftrag) g.auftraegeSet.add(row.auftrag);
      g.paletten++;
      if (row.leitgebiet) g.leitgebieteMap.set(row.leitgebiet, (g.leitgebieteMap.get(row.leitgebiet) ?? 0) + 1);
      if (row.lfdat) g.liefertermineSet.add(row.lfdat);
      g.kartons += row.kartons;
    }

    const results = Array.from(grouped.values())
      .map((g) => ({
        spediteurNr:     g.spediteurNr,
        csvName:         g.csvName,
        speditionId:     g.speditionId,
        speditionDbName: g.speditionDbName,
        matched:         g.speditionId !== null,
        auftraege:       g.auftraegeSet.size,
        paletten:        g.paletten,
        kartons:         g.kartons,
        leitgebiete:     Array.from(g.leitgebieteMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([leitgebiet, anzahl]) => ({ leitgebiet, anzahl })),
        liefertermine: Array.from(g.liefertermineSet).sort(),
      }))
      .sort((a, b) => a.spediteurNr.localeCompare(b.spediteurNr));

    return res.json({
      totalRows:      rows.length,
      totalPaletten:  results.reduce((s, r) => s + r.paletten, 0),
      totalAuftraege: results.reduce((s, r) => s + r.auftraege, 0),
      results,
    });
  } catch (err) {
    console.error("[auftragsauswertung] upload", err);
    return res.status(500).json({ error: "Interner Fehler" });
  }
});

export default router;
