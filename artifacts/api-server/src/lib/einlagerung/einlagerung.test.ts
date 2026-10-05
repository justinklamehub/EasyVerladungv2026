import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { CreateEinlagerungRecordBody, UpdateEinlagerungRecordBody } from "@workspace/api-zod";
import { parseCsv, prepareImport, commitImport, type ImportInput } from "./import";
import { aggregateStock, checkData, records, settingsSchema, defaults, read } from "./model";
import { occupancy, search } from "./search";
import { calendarWeek, matchesTerm } from "./calendar";
import { readFile } from "node:fs/promises";
import { parseLegacySql } from "../../../../../lib/db/scripts/legacy-sql-parser.mjs";

after(async () => { await pool.end(); });

test("CSV: BOM, CRLF, quoting, delimiters, multiline cells and leading zeros", () => {
  assert.deepEqual(parseCsv('\uFEFFArtikel;EAN;Name\r\n001;000020;"Text; mit ""Zitat""\nzweite Zeile"\r\n'),
    [["Artikel", "EAN", "Name"], ["001", "000020", 'Text; mit "Zitat"\nzweite Zeile']]);
  assert.deepEqual(parseCsv("a,b\n01,02"), [["a", "b"], ["01", "02"]]);
  assert.deepEqual(parseCsv("a\tb\n01\t02"), [["a", "b"], ["01", "02"]]);
  assert.throws(() => parseCsv('a;b\n1;"offen'), /Anführungszeichen/);
});

test("Settings: partial import profiles and bounded freshness", () => {
  assert.deepEqual(settingsSchema.parse(defaults), defaults);
  assert.equal(settingsSchema.parse({ ...defaults, profiles: { artikel: { ean: 0 } } }).profiles.artikel?.ean, 0);
  assert.deepEqual(settingsSchema.parse({ hideFull: true, staleHours: 24, profiles: {} }).colors, defaults.colors);
  assert.equal(settingsSchema.parse({ ...defaults, colors: { ...defaults.colors, full: "#123ABC" } }).colors.full, "#123ABC");
  assert.throws(() => settingsSchema.parse({ ...defaults, colors: { ...defaults.colors, full: "red" } }));
  assert.throws(() => settingsSchema.parse({ ...defaults, staleHours: 0 }));
  assert.throws(() => settingsSchema.parse({ ...defaults, profiles: { bad: {} } }));
});

test("Calendar week searches retain old KW.Jahr terms and derive ISO weeks from imported dates", () => {
  assert.equal(calendarWeek("22.09.2026"), "39.2026");
  assert.equal(calendarWeek("2021-01-01"), "53.2020");
  assert.equal(calendarWeek("KW 47.2026"), "47.2026");
  assert.equal(calendarWeek("31.02.2026"), "");
  assert.equal(calendarWeek("53.2025"), "");
  assert.equal(matchesTerm("22.09.2026", "", "39.2026"), true);
  assert.equal(matchesTerm("2026-09-22", "", "22.09.2026"), true);
  assert.equal(matchesTerm("47.2024", "3", "47.2024"), true);
  assert.equal(matchesTerm("47.2024", "3", "47.2026"), false);
});

test("Legacy parser reads quoted data without executing statements", () => {
  const sql = "DROP TABLE users;\nINSERT INTO `test` (`id`,`code`,`note`,`optional`) VALUES (1,'001','Grüße; \\'Zitat\\' (Text)',NULL),(2,'002','zweite\\nZeile',4);";
  assert.deepEqual(parseLegacySql(sql, new Set(["test"])).test, [
    { id: 1, code: "001", note: "Grüße; 'Zitat' (Text)", optional: null },
    { id: 2, code: "002", note: "zweite\nZeile", optional: 4 },
  ]);
  assert.deepEqual(parseLegacySql(sql, new Set(["not-test"])), {});
});

test("Complete migration preserves every original row, ID and timestamp", async (t) => {
  const archive = (await pool.query("SELECT type,rows,row_count FROM einlagerung_datasets WHERE type LIKE 'legacy:%'")).rows;
  if (!archive.some((a) => a.type === "legacy:manifest")) { t.skip("No legacy migration in this database"); return; }
  const sql = await readFile(new URL("../../../../../attached_assets/0_einlagerung_(1)_1791201795799.sql", import.meta.url), "utf8");
  const original = parseLegacySql(sql);
  for (const [table, rows] of Object.entries(original)) {
    const saved = archive.find((a) => a.type === `legacy:${table}`);
    assert.ok(saved, `missing original table ${table}`);
    assert.equal(saved.row_count, rows.length, table);
    assert.deepEqual(saved.rows, rows, `${table}: no field or row may be lost`);
  }
  const all = await read(records);
  // Use an independent query for operational IDs, not an archive-only migration.
  const rules = all.filter((r) => r.kind === "rule");
  for (const old of original.einlagerung_zuordnung!) assert.ok(rules.some((r) => r.data.legacyId === old.id));
  const reservations = all.filter((r) => r.kind === "reservation");
  for (const old of original.lager_vormerkungen!) {
    const r = reservations.find((r) => r.data.legacyId === old.id)!;
    assert.ok(r);
    assert.equal(r.data.speditionName, old.spedition);
    assert.equal(r.data.termin, old.lfdat);
    assert.equal(r.data.plusKw, old.plus_kw);
  }
  const carriers = all.filter((r) => r.kind === "carrier");
  for (const old of original.speditionsfarben!) assert.ok(carriers.some((r) => r.data.name === old.spediteur_name1 && r.data.color === old.farbe));
  assert.ok(all.some((r) => r.kind === "shelf" && r.data.name === "K"));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM einlagerung_events WHERE action IN ('Alte Vollmeldung offen','Alte Vollmeldung erledigt')")).rows[0].n, original.regal_voll_meldungen!.length);
});

test("Record validation rejects duplicate cross-article EANs and unknown kinds", () => {
  const all = [{ id: 1, kind: "article", updatedAt: "", data: { number: "001", ean: "0002", active: true } }];
  assert.throws(() => checkData("article", { number: "0002" }, all), /bereits vergeben/);
  assert.throws(() => checkData("article", { number: "003", ean: "001" }, all), /bereits vergeben/);
  assert.throws(() => checkData("toString", {}, []), /Unbekannter/);
});

test("Reservation dialog payloads support creation and editing with default, blank and populated Plus-KW", () => {
  const all = [
    { id: 1, kind: "shelf", updatedAt: "2026-10-05T00:00:00.000Z", data: { name: "S1", active: true } },
    { id: 4, kind: "carrier", updatedAt: "", data: { name: "Testspedition", speditionId: 2, active: true } },
  ];
  const form = { shelfId: 1, carrierId: 4, speditionId: null, speditionName: "", relation: "Relation", termin: "2026-10-05",
    note: "", status: "offen", plusKw: "" };
  for (const value of ["", " ", "0", "2", "02"]) {
    // Text inputs are trimmed by RecordDialog; IDs from numeric selects are numbers.
    const submitted = { ...form, plusKw: value.trim() };
    const expected = { ...submitted, speditionId: 2, speditionName: "Testspedition" };
    const create = CreateEinlagerungRecordBody.parse({ data: submitted });
    assert.deepEqual(checkData("reservation", create.data, all), expected);
    const existing = { id: 3, kind: "reservation", updatedAt: all[0]!.updatedAt, data: { ...form, plusKw: "4" } };
    const edit = UpdateEinlagerungRecordBody.parse({
      data: { ...existing.data, ...submitted }, expectedUpdatedAt: existing.updatedAt,
    });
    assert.deepEqual(checkData("reservation", edit.data, [...all, existing], existing.id), expected);
    assert.equal(edit.expectedUpdatedAt, existing.updatedAt);
  }
  assert.equal(checkData("reservation", { ...form, plusKw: undefined }, all).plusKw, "");
  assert.throws(() => checkData("reservation", { ...form, plusKw: "1".repeat(31) }, all), /plusKw/);
});

test("Occupancy counts distinct HUs, not CSV lines or mixed-material groups", () => {
  const rows = [
    { lagerplatz: "S1", material: "001", lagereinh: "HU1" },
    { lagerplatz: "S1", material: "002", lagereinh: "HU1" },
    { lagerplatz: "S1", material: "001", lagereinh: "HU2" },
    { lagerplatz: "S1", material: "001", lagereinh: "HU2" },
  ];
  assert.equal(occupancy([{ type: "istbestand", rows }])[0]?.ist, 2);
  assert.deepEqual(aggregateStock(rows, "istbestand", []).map((r) => r.paletten), [2, 1]);
});

test("Transactional CSV preview/commit, merge by HU, replace, and current strategy search", async () => {
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(736291)");
  const suffix = randomUUID();
  const add = async (kind: string, data: Record<string, unknown>) =>
    (await client.query("INSERT INTO einlagerung_records (kind,data) VALUES ($1,$2) RETURNING id", [kind, JSON.stringify(data)])).rows[0].id;
  try {
    const hall = await add("hall", { name: `TEST-${suffix}`, active: true, sort: 99 });
    const aisle = await add("aisle", { name: `TEST-${suffix}`, hallId: hall, active: true, sort: 99 });
    const shelfName = `TEST-${suffix}`, otherName = `TEST2-${suffix}`;
    const shelf = await add("shelf", { name: shelfName, aisleId: aisle, active: true, sort: 99, full: false });
    await add("shelf", { name: otherName, aisleId: aisle, active: true, sort: 100, full: false });
    // Reservation smoke test: validate dialog-shaped bodies and round-trip JSON storage
    // for create, populated edit, zero text, and clearing the field. All writes roll back.
    const reservationSpedition = (await client.query("SELECT id FROM speditionen ORDER BY id LIMIT 1")).rows[0];
    assert.ok(reservationSpedition, "reservation smoke test needs an existing spedition");
    const carrierId = await add("carrier", { name: `TEST-CARRIER-${suffix}`, speditionId: reservationSpedition.id, active: true });
    const form = { shelfId: shelf, carrierId, relation: "TEST",
      termin: "2026-10-05", plusKw: "", note: "", status: "offen" };
    const createBody = CreateEinlagerungRecordBody.parse({ data: form });
    const reservationId = await add("reservation", checkData("reservation", createBody.data, await records(client)));
    for (const plusKw of ["", "02", "0", ""]) {
      const all = await records(client);
      const existing = all.find((r) => r.id === reservationId)!;
      const editBody = UpdateEinlagerungRecordBody.parse({
        data: { ...existing.data, plusKw }, expectedUpdatedAt: existing.updatedAt,
      });
      const validated = checkData("reservation", editBody.data, all, reservationId);
      await client.query("UPDATE einlagerung_records SET data=$1,updated_at=clock_timestamp() WHERE id=$2",
        [JSON.stringify(validated), reservationId]);
      const saved = (await records(client)).find((r) => r.id === reservationId)!;
      assert.equal(saved.data.plusKw, plusKw);
      assert.equal(typeof saved.data.plusKw, "string");
    }
    await client.query("DELETE FROM einlagerung_records WHERE id=$1", [reservationId]);
    const articleNo = `00-${suffix}`, ean = `000-${suffix}`;
    const articleInput: ImportInput = { type: "artikel", filename: "test.csv", mode: "merge", mapping: {},
      csv: `artikelnummer;ean;artikelname\n${articleNo};${ean};Testartikel` };
    const before = (await records(client)).length;
    assert.equal((await prepareImport(client, articleInput)).preview.valid, true);
    assert.equal((await records(client)).length, before, "preview must not mutate");
    await commitImport(client, articleInput, "Automatischer Test");
    const article = (await records(client)).find((r) => r.kind === "article" && r.data.number === articleNo)!;
    assert.equal(article.data.ean, ean);
    await add("rule", { articleId: article.id, shelfId: shelf, groupId: null, priority: 1, note: "", active: true });
    const scan = await search(client, { mode: "artikel", q: ean });
    assert.equal(scan.article.id, article.id);
    assert.equal(scan.locations[0].shelf.id, shelf);
    const carrier = await add("carrier", { name: `SOURCE-${suffix}`, number: "", speditionId: null, color: "#ede9fe", textColor: "#111827", active: true });
    const sourceReservation = checkData("reservation", { shelfId: shelf, carrierId: carrier,
      relation: "", termin: "47.2026", plusKw: "2", note: "", status: "offen" }, await records(client));
    assert.equal(sourceReservation.speditionName, `SOURCE-${suffix}`);
    assert.equal(sourceReservation.speditionId, null);
    const sourceRecords = await records(client);
    assert.throws(() => checkData("reservation", { ...sourceReservation, termin: "kaputt" }, sourceRecords), /gültiges/);
    const sourceResId = await add("reservation", sourceReservation);
    assert.equal((await search(client, { mode: "auftraege", spedition: `SOURCE-${suffix}`, termin: "47.2026" })).reservations.length, 1);
    await client.query("DELETE FROM einlagerung_records WHERE id=$1", [sourceResId]);
    const orderHu = `HU-${suffix}`, orderNo = `00-${suffix}`;
    const orderInput: ImportInput = { type: "auftraege", filename: "test-orders.csv", mode: "replace", mapping: {},
      csv: `Verkaufsb.;LFDAT;+KW;Debitor;Name 1;PLZ;Beleg;ern.ausl.;Ret.klasse;Parkkennz.;Handling Unit;Typ;Platz;Spediteur;Name 1;Relation;Q;KartonAnz\n${orderNo};22.09.2026;;;;;${orderNo};;;;${orderHu};020;${shelfName};;SOURCE-${suffix};;;1\nOTHER-${suffix};22.09.2026;;;;;OTHER-${suffix};;;;OTHERHU-${suffix};020;${shelfName};;SOURCE-${suffix};;;1` };
    assert.equal((await prepareImport(client, orderInput)).preview.valid, true);
    await commitImport(client, orderInput, "Automatischer Test");
    assert.equal((await search(client, { mode: "auftraege", q: orderNo, termin: "39.2026" })).orders.length, 1);
    assert.equal((await search(client, { mode: "auftraege", q: orderNo })).orders[0].paletten, 1, "only matching orders count");
    assert.equal((await search(client, { mode: "auftraege", shelfId: shelf })).orders[0].paletten, 2);
    assert.equal((await search(client, { mode: "auftraege", q: orderHu })).orders[0].shelf, shelfName);
    assert.equal((await search(client, { mode: "auftraege", termin: "40.2026" })).orders.length, 0);
    const spedition = (await client.query("SELECT id FROM speditionen ORDER BY id LIMIT 1")).rows[0];
    assert.ok(spedition);
    const reservationData = checkData("reservation", { shelfId: shelf, speditionId: spedition.id,
      relation: `TEST-${suffix}`, termin: "2026-10-05", plusKw: 2, note: "", status: "offen" }, await records(client));
    assert.equal(reservationData.plusKw, "2", "numeric form input must be normalized");
    const reservation = await add("reservation", reservationData);
    assert.equal((await search(client, { mode: "auftraege", shelfId: shelf, relation: `TEST-${suffix}` })).reservations.length, 1);
    assert.equal((await search(client, { mode: "auftraege", shelfId: shelf, relation: "NO MATCH" })).reservations.length, 0);
    const changed = checkData("reservation", { ...reservationData, status: "erledigt" }, await records(client), reservation);
    await client.query("UPDATE einlagerung_records SET data=$1 WHERE id=$2", [JSON.stringify(changed), reservation]);
    assert.equal((await search(client, { mode: "auftraege", shelfId: shelf })).reservations[0].data.status, "erledigt");
    await client.query("DELETE FROM einlagerung_records WHERE id=$1", [reservation]);
    assert.equal((await search(client, { mode: "auftraege", shelfId: shelf })).reservations.length, 0);
    const stock: ImportInput = { type: "istbestand", filename: "test-stock.csv", mode: "replace", mapping: {},
      csv: `typ;lagerplatz;material;b;dauer;charge;lagereinh;bme;verfueg_bestand\nX;${shelfName};${articleNo};;;;HU1;;1\nX;${shelfName};${articleNo};;;;HU1;;1\nX;${shelfName};${articleNo};;;;HU2;;1` };
    const prepared = await prepareImport(client, stock);
    assert.equal(prepared.preview.valid, true);
    assert.equal(prepared.preview.rowCount, 2);
    assert.ok(prepared.preview.warnings.some((w) => w.includes("Dubletten")));
    await commitImport(client, stock, "Automatischer Test");
    assert.equal((await search(client, { mode: "regal", shelfId: shelf })).locations[0].ist[0].paletten, 2);
    const moved = { ...stock, mode: "merge" as const,
      csv: `typ;lagerplatz;material;b;dauer;charge;lagereinh;bme;verfueg_bestand\nX;${otherName};${articleNo};;;;HU1;;1` };
    await commitImport(client, moved, "Automatischer Test");
    assert.equal((await search(client, { mode: "regal", shelfId: shelf })).locations[0].ist[0].paletten, 1);
    const conflict = { ...stock, csv: `${stock.csv}\nX;${otherName};${articleNo};;;;HU1;;1` };
    assert.equal((await prepareImport(client, conflict)).preview.valid, false);
    const empty = { ...stock, csv: "typ;lagerplatz;material;b;dauer;charge;lagereinh;bme;verfueg_bestand\n" };
    assert.equal((await prepareImport(client, empty)).preview.valid, false);
    await assert.rejects(commitImport(client, empty, "Automatischer Test"), /keine Datenzeilen/);
    assert.equal((await search(client, { mode: "regal", shelfId: shelf })).locations[0].ist[0].paletten, 1);
    const bad = { ...stock, csv: stock.csv.replaceAll(shelfName, "UNKNOWN") };
    assert.equal((await prepareImport(client, bad)).preview.valid, false);
    // All mutations above are invisible to other sessions and rolled back.
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
