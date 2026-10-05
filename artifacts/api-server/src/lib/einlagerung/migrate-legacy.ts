// Explicit, additive, one-time import. Only Einlagerung tables are written.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { parseLegacySql } from "../../../../../lib/db/scripts/legacy-sql-parser.mjs";
import { records, transaction, type Data } from "./model";
import { commitImport, parseCsv } from "./import";

const [source, csvSource, flag] = process.argv.slice(2);
if (!source || !csvSource || !["--dry-run", "--apply"].includes(flag || ""))
  throw new Error("Usage: migrate-legacy.ts dump.sql auftraege.csv --dry-run|--apply");
if (process.env.NODE_ENV === "production") throw new Error("Keine automatische Übernahme in der Produktion.");
const sourceText = await readFile(source, "utf8");
const names = ["artikel", "eingelagerte_auftraege", "einlagerung_zuordnung", "kundengruppen",
  "lager_gaenge", "lager_regale", "lager_vormerkungen", "regal_voll_meldungen", "speditionsfarben",
  "zlthu_istbestand", "zlthu_retoure"];
const tables = parseLegacySql(sourceText, new Set(names));
for (const n of names) if (!tables[n]) throw new Error(`Tabelle fehlt: ${n}`);
const csv = await readFile(csvSource, "utf8");
const report: Data = { source: basename(source), tables: Object.fromEntries(names.map((n) => [n, tables[n]!.length])),
  csvRows: parseCsv(csv).length - 1 };
const hash = createHash("sha256").update(sourceText).update(csv).digest("hex");
const timestamp = (n: unknown) => n ? new Date(Number(n) * 1000).toISOString() : null;
const norm = (s: unknown) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

try {
  if (flag === "--dry-run") console.log(JSON.stringify(report, null, 2));
  else {
    await transaction(async (client) => {
      const done = await client.query("SELECT id FROM einlagerung_datasets WHERE type='legacy:manifest' AND filename=$1", [hash]);
      if (done.rowCount) { report.alreadyImported = true; return; }
      const existing = await records(client);
      const used = new Set<number>();
      const map = new Map<string, number>();
      let added = 0;
      const add = async (kind: string, legacyId: unknown, data: Data, match: (d: Data) => boolean) => {
        const prior = existing.find((r) => r.kind === kind && !used.has(r.id) && match(r.data));
        let id: number;
        if (prior) {
          id = prior.id; used.add(id);
          // Retain current editable values; attach source identity for traceability.
          await client.query("UPDATE einlagerung_records SET data=data || $1::jsonb WHERE id=$2",
            [JSON.stringify({ legacyId }), id]);
        } else {
          id = (await client.query("INSERT INTO einlagerung_records(kind,data) VALUES($1,$2) RETURNING id",
            [kind, JSON.stringify({ ...data, legacyId })])).rows[0].id;
          added++;
        }
        map.set(`${kind}:${legacyId}`, id);
        return id;
      };
      const ref = (kind: string, oldId: unknown) => {
        const id = map.get(`${kind}:${oldId}`);
        if (!id) throw new Error(`Fehlende Altreferenz ${kind}:${oldId}`);
        return id;
      };
      for (const h of [1, 2, 3]) await add("hall", h, { name: `Halle ${h}`, sort: h, active: true }, (d) => d.name === `Halle ${h}`);
      for (const r of tables.lager_gaenge!) await add("aisle", r.id, { name: r.gang_nr, hallId: ref("hall", Math.ceil(Number(r.gang_nr) / 6)),
        sort: Number(r.gang_nr), active: !!r.aktiv }, (d) => d.name === r.gang_nr);
      for (const r of tables.lager_regale!) {
        const id = await add("shelf", r.id, { name: r.regal_nr, aisleId: ref("aisle", r.gang_id), position: Number(r.regal_nr.split("-")[1]),
          sort: r.sortierung, active: !!r.aktiv, full: !!r.voll_gemeldet, fullAt: timestamp(r.voll_gemeldet_at),
          fullNote: r.voll_hinweis || "" }, (d) => d.name === r.regal_nr);
        // Preserve newer scanner actions; restore the legacy status otherwise.
        const newer = await client.query("SELECT id FROM einlagerung_events WHERE action IN ('Regal voll gemeldet','Regal freigegeben') AND detail LIKE $1 LIMIT 1", [`${r.regal_nr}: %`]);
        if (!newer.rowCount) await client.query("UPDATE einlagerung_records SET data=data || $1::jsonb,updated_at=clock_timestamp() WHERE id=$2",
          [JSON.stringify({ full: !!r.voll_gemeldet, fullAt: timestamp(r.voll_gemeldet_at), fullNote: r.voll_hinweis || "" }), id]);
      }
      for (const r of tables.artikel!) await add("article", r.id, { number: r.artikelnummer, ean: r.ean || "", name: r.artikelname || "", active: !!r.aktiv }, (d) => d.number === r.artikelnummer);
      for (const r of tables.kundengruppen!) await add("group", r.id, { name: r.name, color: r.farbe || "#64748b", active: true }, (d) => d.name === r.name);
      for (const r of tables.einlagerung_zuordnung!) {
        const articleId = ref("article", r.artikel_id), shelfId = ref("shelf", r.regal_id);
        await add("rule", r.id, { articleId, shelfId, groupId: r.kundengruppe_id ? ref("group", r.kundengruppe_id) : null,
          priority: r.prioritaet, note: r.hinweis || "", active: !!r.aktiv },
          (d) => d.articleId === articleId && d.shelfId === shelfId && d.active === !!r.aktiv);
      }
      // Source carriers stay usable even without a corresponding COMET account.
      const speditionen = (await client.query("SELECT id,name FROM speditionen")).rows;
      const carrierNames = new Map(tables.speditionsfarben!.map((r) => [r.spediteur_name1, r]));
      for (const r of tables.eingelagerte_auftraege!) if (r.spediteur_name1 && !carrierNames.has(r.spediteur_name1))
        carrierNames.set(r.spediteur_name1, { id: `order:${r.spediteur_name1}`, spediteur_name1: r.spediteur_name1, farbe: "#ede9fe", textfarbe: "#111827", aktiv: 1 });
      for (const r of tables.lager_vormerkungen!) if (!carrierNames.has(r.spedition))
        carrierNames.set(r.spedition, { id: `reservation:${r.spedition}`, spediteur_name1: r.spedition, farbe: "#ede9fe", textfarbe: "#111827", aktiv: 1 });
      const carriers = new Map<string, number>();
      for (const [name, r] of carrierNames) {
        const matches = speditionen.filter((s) => norm(s.name) === norm(name));
        const number = tables.eingelagerte_auftraege!.find((o) => o.spediteur_name1 === name)?.spediteur || "";
        carriers.set(name, await add("carrier", r.id, { name, number, speditionId: matches.length === 1 ? matches[0].id : null,
          color: r.farbe, textColor: r.textfarbe, active: !!r.aktiv }, (d) => d.name === name));
      }
      // Staging/non-rack locations are real order locations, not discarded rows.
      const shelfNames = new Set(tables.lager_regale!.map((r) => r.regal_nr));
      const places = new Set(tables.eingelagerte_auftraege!.map((r) => r.platz));
      for (const p of places) if (p && !shelfNames.has(p)) {
        const hallId = await add("hall", "extra", { name: "Sonderplätze", sort: 100, active: true }, (d) => d.name === "Sonderplätze");
        const aisleId = await add("aisle", "extra", { name: "Zusatzplätze", hallId, sort: 100, active: true }, (d) => d.name === "Zusatzplätze");
        await add("shelf", `place:${p}`, { name: p, aisleId, position: 0, sort: 0, active: true, full: false, fullAt: null, fullNote: "" }, (d) => d.name === p);
      }
      for (const r of tables.lager_vormerkungen!) {
        const shelfOld = tables.lager_regale!.find((s) => s.regal_nr === r.regal);
        if (!shelfOld) throw new Error(`Vormerkung mit unbekanntem Regal: ${r.regal}`);
        const carrierId = carriers.get(r.spedition)!;
        const carrierData = (await client.query("SELECT data FROM einlagerung_records WHERE id=$1", [carrierId])).rows[0].data;
        await add("reservation", r.id, { shelfId: ref("shelf", shelfOld.id), carrierId, speditionId: carrierData.speditionId,
          speditionName: r.spedition, relation: r.relation || "", termin: r.lfdat, plusKw: r.plus_kw || "", note: r.bemerkung || "",
          status: r.status, createdAt: timestamp(r.created_at), legacyUpdatedAt: timestamp(r.updated_at) }, (d) => d.legacyId === r.id);
      }
      for (const r of tables.regal_voll_meldungen!) {
        const s = tables.lager_regale!.find((s) => s.id === r.regal_id);
        if (!s) throw new Error(`Vollmeldung mit unbekanntem Regal: ${r.regal_id}`);
        await client.query("INSERT INTO einlagerung_events(action,username,detail,created_at) VALUES($1,'Altbestand',$2,$3)",
          [r.erledigt ? "Alte Vollmeldung erledigt" : "Alte Vollmeldung offen",
            `${s.regal_nr}: ${r.bemerkung || ""} | Alt-ID ${r.id}, Artikel-ID ${r.artikel_id ?? "-"}${r.erledigt_at ? ` | erledigt am ${timestamp(r.erledigt_at)}` : ""}`, timestamp(r.meldung_at)]);
      }
      // Full original rows, IDs and timestamps remain available alongside the
      // editable operational records, including duplicate inactive rules.
      const snapshot = async (type: string, rows: Data[], filename: string) =>
        client.query("INSERT INTO einlagerung_datasets(type,filename,rows,row_count,imported_by) VALUES($1,$2,$3,$4,'Altbestand')",
          [type, filename, JSON.stringify(rows), rows.length]);
      for (const n of names) await snapshot(`legacy:${n}`, tables[n]!, basename(source));
      for (const [type, table] of [["istbestand", "zlthu_istbestand"], ["retouren", "zlthu_retoure"], ["auftraege", "eingelagerte_auftraege"]]) {
        const prior = await client.query("SELECT id FROM einlagerung_datasets WHERE type=$1 LIMIT 1", [type]);
        if (prior.rowCount) throw new Error(`Es gibt bereits ${type}-Daten. Die vollständige Übernahme ersetzt keine neueren Daten automatisch.`);
        await snapshot(type!, tables[table!]!, `Altstand – ${basename(source)}`);
      }
      // The supplied fresh CSV becomes the visible orders snapshot. Its
      // original table snapshot and SQL archive are both retained.
      await commitImport(client, { type: "auftraege", csv, filename: basename(csvSource), mode: "replace", mapping: {} }, "Altdaten-Übernahme");
      report.addedRecords = added;
      report.carriers = carriers.size;
      report.fullShelves = tables.lager_regale!.filter((r) => r.voll_gemeldet).length;
      await snapshot("legacy:manifest", [report], hash);
      await client.query("INSERT INTO einlagerung_events(action,username,detail) VALUES('Altdaten vollständig übernommen','System',$1)", [JSON.stringify(report)]);
    });
    console.log(JSON.stringify(report, null, 2));
  }
} finally { await pool.end(); }
