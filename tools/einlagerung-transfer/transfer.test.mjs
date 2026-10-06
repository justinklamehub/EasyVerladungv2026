import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { envelope, validate, mapCarriers, remapRecord } from "./model.mjs";
import { exportSnapshot, importSnapshot } from "./database.mjs";

const stamp = "2026-10-06T10:00:00.000Z";
const row = (id, kind, data) => ({ id, kind, data, updated_at: stamp });
const fixture = () => envelope({
  exportedAt: stamp,
  records: [
    row(1, "hall", { name: "Test-Halle" }),
    row(2, "aisle", { name: "Test-Gang", hallId: 1 }),
    row(3, "shelf", { name: "Test-Regal", aisleId: 2, full: true }),
    row(4, "article", { number: "Test-Artikel" }),
    row(5, "group", { name: "Test-Gruppe" }),
    row(6, "carrier", { name: "Test-Spedition", speditionId: 12 }),
    row(7, "rule", { articleId: 4, shelfId: 3, groupId: 5 }),
    row(8, "reservation", { shelfId: 3, carrierId: 6, speditionId: 12, termin: "KW 42.2026", plusKw: "2", status: "offen" }),
  ],
  datasets: [{ id: 1, type: "auftraege", filename: "test.csv", rows: [{ platz: "Test-Regal", handling_unit: "HU-Test" }], row_count: 1, imported_by: "Test", imported_at: stamp }],
  events: [{ id: 1, username: "Test", action: "CSV-Import", detail: "Test", created_at: stamp }],
  settings: JSON.stringify({ hideFull: true, staleHours: 24, profiles: {}, deadlineThresholds: { criticalDays: 2, soonDays: 7, upcomingDays: 14 } }),
  carriers: [{ id: 12, name: "Test-Spedition", kuerzel: "TEST" }],
});

test("checks checksum, format and complete references", () => {
  assert.equal(validate(fixture()).records.length, 8);
  const bad = fixture(); bad.payload.records[0].data.name = "changed";
  assert.throws(() => validate(bad), /Prüfsumme/);
  const broken = fixture().payload; broken.records[1].data.hallId = 99;
  assert.throws(() => validate(envelope(broken)), /Referenz/);
  const unknown = fixture().payload; unknown.records[0].kind = "user";
  assert.throws(() => validate(envelope(unknown)), /Stammdatensatz/);
});
test("carrier IDs mapped by identity, never copied across environments", () => {
  const source = fixture().payload.carriers;
  assert.equal(mapCarriers(source, [{ id: 37, name: "Anderer Name", kuerzel: "test" }]).get(12), 37);
  assert.equal(mapCarriers(source, [{ id: 38, name: "Test-Spedition", kuerzel: "OTHER" }]).get(12), 38);
  assert.throws(() => mapCarriers(source, []), /nicht eindeutig/);
  assert.throws(() => mapCarriers(source, [{ id: 1, name: "Test-Spedition", kuerzel: "A" }, { id: 2, name: "Test-Spedition", kuerzel: "B" }]), /nicht eindeutig/);
  assert.equal(mapCarriers(source, [{ id: 37, name: "Manuell", kuerzel: "M" }], { 12: 37 }).get(12), 37);
  assert.throws(() => mapCarriers(source, [], { 12: 99 }), /Ungültige/);
});
test("local references remapped without changing original payload", () => {
  const r = fixture().payload.records[7];
  const data = remapRecord(r, new Map([[3, 103], [6, 106]]), new Map([[12, 37]]));
  assert.equal(data.shelfId, 103); assert.equal(data.carrierId, 106); assert.equal(data.speditionId, 37);
  assert.equal(data.plusKw, "2"); assert.equal(r.data.shelfId, 3);
});
test("original migration archives preserved as inactive legacy snapshots", () => {
  const p = fixture().payload;
  p.datasets.push({ ...p.datasets[0], id: 2, type: "legacy:manifest" });
  assert.equal(validate(envelope(p)).datasets.length, 2);
  p.datasets[1].type = "other";
  assert.throws(() => validate(envelope(p)), /Importstand 2/);
});

test("isolated PostgreSQL: dry-run, backup, atomic rollback, replacement and return", { skip: !process.env.DATABASE_URL }, async () => {
  const require = createRequire(resolve("lib/db/package.json"));
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const schema = `transfer_test_${process.pid}_${Date.now()}`;
  const dir = await mkdtemp(join(tmpdir(), "comet-transfer-"));
  let created = false;
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`); created = true;
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE einlagerung_records(id serial PRIMARY KEY, kind text, data jsonb, updated_at timestamptz DEFAULT now());
      CREATE TABLE einlagerung_datasets(id serial PRIMARY KEY, type text,filename text,rows jsonb,row_count int,imported_by text,imported_at timestamptz DEFAULT now());
      CREATE TABLE einlagerung_events(id serial PRIMARY KEY,username text,action text,detail text,created_at timestamptz DEFAULT now());
      CREATE TABLE settings(key text PRIMARY KEY,value text);
      CREATE TABLE speditionen(id int PRIMARY KEY,name text,kuerzel text);
      CREATE TABLE unrelated_productive_data(id int PRIMARY KEY,value text);
      INSERT INTO speditionen VALUES(37,'Test-Spedition','TEST');
      INSERT INTO unrelated_productive_data VALUES(1,'must remain');
      INSERT INTO settings VALUES('other-setting','untouched'),('einlagerung_settings','{"hideFull":false}');
      INSERT INTO einlagerung_records(kind,data) VALUES('hall','{"name":"Existing"}');
    `);
    const before = join(dir, "before.json");
    await exportSnapshot(client, before);
    const count = async () => (await client.query("SELECT COUNT(*)::int AS n FROM einlagerung_records")).rows[0].n;
    const probe = await importSnapshot(client, fixture());
    assert.equal(probe.pruefung, "OK – keine Änderung"); assert.equal(await count(), 1);
    const rejected = fixture().payload; rejected.carriers[0].kuerzel = "NONE"; rejected.carriers[0].name = "Unknown";
    await assert.rejects(importSnapshot(client, envelope(rejected), { apply: true, backup: join(dir, "bad.json") }), /nicht eindeutig/);
    assert.equal(await count(), 1);
    await assert.rejects(importSnapshot(client, fixture(), { apply: true, backup: before }), /EEXIST/);
    assert.equal(await count(), 1);
    // Force an error after deletes/inserts; all warehouse and settings changes must roll back.
    await client.query("ALTER TABLE einlagerung_records ADD CONSTRAINT fail_test CHECK(kind <> 'reservation')");
    await assert.rejects(importSnapshot(client, fixture(), { apply: true, backup: join(dir, "rollback.json") }));
    assert.equal(await count(), 1);
    await client.query("ALTER TABLE einlagerung_records DROP CONSTRAINT fail_test");
    const backup = join(dir, "backup.json");
    await importSnapshot(client, fixture(), { apply: true, backup });
    assert.equal(await count(), 8);
    const records = (await client.query("SELECT id,kind,data FROM einlagerung_records")).rows;
    const byKind = (k) => records.find((r) => r.kind === k);
    assert.equal(byKind("aisle").data.hallId, byKind("hall").id);
    assert.equal(byKind("shelf").data.aisleId, byKind("aisle").id);
    assert.equal(byKind("rule").data.articleId, byKind("article").id);
    assert.equal(byKind("rule").data.groupId, byKind("group").id);
    assert.equal(byKind("reservation").data.shelfId, byKind("shelf").id);
    assert.equal(byKind("reservation").data.carrierId, byKind("carrier").id);
    assert.equal(byKind("reservation").data.speditionId, 37);
    assert.equal((await client.query("SELECT value FROM settings WHERE key='other-setting'")).rows[0].value, "untouched");
    assert.equal((await client.query("SELECT value FROM unrelated_productive_data")).rows[0].value, "must remain");
    const exported = join(dir, "roundtrip.json");
    await exportSnapshot(client, exported);
    const roundtrip = validate(JSON.parse(await readFile(exported, "utf8")));
    assert.equal(roundtrip.datasets[0].row_count, 1);
    assert.equal(roundtrip.events.length, 1);
    assert.equal(JSON.parse(roundtrip.settings).deadlineThresholds.upcomingDays, 14);
    await importSnapshot(client, JSON.parse(await readFile(backup, "utf8")), { apply: true, backup: join(dir, "return.json") });
    assert.equal(await count(), 1);
    assert.equal((await client.query("SELECT data FROM einlagerung_records")).rows[0].data.name, "Existing");
    assert.equal((await client.query("SELECT value FROM settings WHERE key='einlagerung_settings'")).rows[0].value, '{"hideFull":false}');
  } finally {
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end(); await rm(dir, { recursive: true, force: true });
  }
});
