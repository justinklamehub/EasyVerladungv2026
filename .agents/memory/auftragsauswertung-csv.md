---
name: Auftragsauswertung CSV schema
description: SAP export CSV format used for Auftragsauswertung feature and DB matching strategy
---

## CSV Format (SAP export, semicolon-delimited, UTF-8 BOM)

Columns (0-indexed):
- 0: Verkaufsb. — Auftragsnummer (distinct count = Aufträge per Spedition)
- 1: LFDAT — Lieferwoche, format "14.2026" (= KW 14, 2026); display as "KW 14 / 2026"
- 13: Handling Unit — one row per HU = one pallet (count = Paletten)
- 16: Spediteur — 5-digit SAP spedition number (matches speditionen.speditionsnummer)
- 17: "Name 1" (second occurrence) — Speditionsname; strip `*number*` suffix (e.g. "Hellmann Worldwide *71459*" → "Hellmann Worldwide")
- 18: Relation — Leitgebiet (e.g. "32A")
- 20: KartonAnz — carton count

**"Name 1" appears twice:** col5 = Kundenname, col17 = Speditionsname. Backend finds 2nd occurrence by iterating headers.

## DB Matching
- `speditionen.speditionsnummer TEXT` added via ALTER TABLE IF NOT EXISTS on startup
- Match by `spediteur_nr (col16) == speditionen.speditionsnummer`
- Unmatched rows show amber warning; user should add Speditionsnummer in Stammdaten

## Backend
- Route: POST /api/auftragsauswertung/upload, permission: `auftrag.analyse`
- Accepts JSON `{ csv: string }`, parses server-side

## speditionsnummer in speditionen table
- Not in Drizzle schema → handled via pool.query UPDATE after Drizzle insert/update
- GET /speditionen uses pool.query("SELECT * FROM speditionen ORDER BY name") to include the extra column

**Why:** Drizzle schema is in lib/db (separate package requiring rebuild); pool.query avoids schema changes while keeping full column access.
