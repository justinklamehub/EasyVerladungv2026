import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { aggregateStock, deliveryNumberOf } from "./model";
import { commitImport } from "./import";
import { listPickupPlans, pickupInput, pickupShipmentAccess, savePickupPlan } from "./pickup-plans";
import { pickupBatchInput, savePickupBatch } from "./pickup-batch";

after(async () => { await pool.end(); });

test("batch input rejects duplicates, empty selections and ambiguous truck actions", () => {
  const valid = { deliveries: [{ deliveryNumber: "800000111", expectedUpdatedAt: null }], planned: true, shipmentMode: "keep", shipmentId: null };
  assert.ok(pickupBatchInput.parse(valid));
  for (const invalid of [
    { ...valid, deliveries: [] }, { ...valid, deliveries: [...valid.deliveries, ...valid.deliveries] },
    { ...valid, deliveries: [{ deliveryNumber: "800000111" }] },
    { ...valid, shipmentMode: "assign" }, { ...valid, shipmentId: 11 }, { ...valid, planned: false },
  ]) assert.throws(() => pickupBatchInput.parse(invalid));
});

test("delivery identity matches grouped imports, preserves text identity, and validates planning input", () => {
  assert.equal(deliveryNumberOf({ beleg: " 80001234 ", verkaufsbeleg: "50001234" }), "80001234");
  assert.equal(deliveryNumberOf({ beleg: "50001234", verkaufsbeleg: "80001234" }), "80001234");
  assert.equal(deliveryNumberOf({ beleg: "50001234" }), "");
  assert.throws(() => pickupInput.parse({ planned: false, shipmentId: 1, expectedUpdatedAt: null }));
  assert.throws(() => pickupInput.parse({ planned: true, shipmentId: null }));
});

test("pickup plans survive real merge/replace imports, missing deliveries and truck removal; scoped links, resets and optimistic locking work (temporary tables only)", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Every table touched by import/planning is shadowed in pg_temp. No business rows or shared sequences.
    await c.query(`CREATE TEMP TABLE einlagerung_records(id SERIAL PRIMARY KEY,kind TEXT,data JSONB,updated_at TIMESTAMPTZ DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE einlagerung_datasets(id SERIAL PRIMARY KEY,type TEXT,filename TEXT,rows JSONB,row_count INTEGER,imported_by TEXT,imported_at TIMESTAMPTZ DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE einlagerung_events(id SERIAL PRIMARY KEY,action TEXT,username TEXT,detail TEXT,created_at TIMESTAMPTZ DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE einlagerung_pickup_plans(delivery_number TEXT PRIMARY KEY,planned BOOLEAN,shipment_id INTEGER,updated_at TIMESTAMPTZ DEFAULT date_trunc('milliseconds',clock_timestamp()),CHECK(planned OR shipment_id IS NULL)) ON COMMIT DROP;
      CREATE TEMP TABLE settings(key TEXT,value TEXT) ON COMMIT DROP;
      CREATE TEMP TABLE shipments(id INTEGER PRIMARY KEY,spedition_id INTEGER,kennzeichen TEXT,eta_date DATE,eta_time TEXT,status TEXT,relation TEXT) ON COMMIT DROP;
      CREATE TEMP TABLE speditionen(id INTEGER PRIMARY KEY,name TEXT) ON COMMIT DROP;
      CREATE TEMP TABLE spedition_permissions(granting_spedition_id INTEGER,receiving_spedition_id INTEGER,permission_level TEXT) ON COMMIT DROP;
      INSERT INTO einlagerung_records(kind,data) VALUES('shelf','{"name":"A1","active":true}');
      INSERT INTO speditionen VALUES(1,'Test Spedition'),(2,'Nicht freigegeben');
      INSERT INTO shipments VALUES(11,1,'TEST-11','2026-10-22','08:00','Angemeldet','Test'),(12,2,'PRIVAT',NULL,NULL,'Angemeldet','Privat'),(13,1,'STORNO',NULL,NULL,'Storniert','Test');
      INSERT INTO spedition_permissions VALUES(1,3,'view');`);
    const imported = (number: string, mode: "merge" | "replace") => commitImport(c, {
      type: "auftraege", mode, filename: "owned-pickup-test.csv",
      csv: `platz;handling_unit;beleg;lfdat\nA1;HU-${number};${number};22.10.2026`,
    }, "pickup-test");
    await imported("800000111", "replace");
    const first = await savePickupPlan(c, "800000111", { planned: true, shipmentId: 11, expectedUpdatedAt: null }, "pickup-test", [1]);
    assert.equal(first.shipment?.kennzeichen, "TEST-11");
    assert.equal(first.shipment?.etaDate, "2026-10-22");
    await c.query("UPDATE shipments SET status='Abgefertigt' WHERE id=11");
    const completed = (await listPickupPlans(c, null))[0];
    assert.equal(completed.shipment?.status, "Abgefertigt");
    assert.equal(completed.updatedAt, first.updatedAt, "Austragen aktualisiert die Anzeige, nicht die gespeicherte Abholplanung");
    await c.query("UPDATE shipments SET status='Angemeldet' WHERE id=11");
    await imported("800000111", "merge");
    await imported("800000222", "replace");
    assert.equal((await listPickupPlans(c, null))[0].shipmentId, 11, "even temporarily absent deliveries keep their plan");
    await imported("800000111", "replace");
    const ds = (await c.query("SELECT rows FROM einlagerung_datasets ORDER BY id DESC LIMIT 1")).rows[0].rows;
    assert.equal(aggregateStock(ds, "auftraege", [], true)[0].deliveryNumber, first.deliveryNumber);
    assert.equal((await listPickupPlans(c, null))[0].updatedAt, first.updatedAt, "imports never rewrite planning");
    const hidden = (await listPickupPlans(c, [2]))[0];
    assert.equal(hidden.shipment, null, "private truck details are hidden");
    assert.equal(await pickupShipmentAccess(c, "comet_admin", null), null);
    assert.deepEqual(await pickupShipmentAccess(c, "speditions_viewer", 3), [3, 1]);
    await assert.rejects(savePickupPlan(c, "800000111", { planned: true, shipmentId: 12, expectedUpdatedAt: first.updatedAt }, "pickup-test", [1]), /nicht gefunden|freigegeben/);
    await assert.rejects(savePickupPlan(c, "800000111", { planned: true, shipmentId: 13, expectedUpdatedAt: first.updatedAt }, "pickup-test", [1]), /aktive/);
    await assert.rejects(savePickupPlan(c, "800000999", { planned: true, shipmentId: null, expectedUpdatedAt: null }, "pickup-test", null), /nicht gefunden/);
    await assert.rejects(savePickupPlan(c, "800000111", { planned: true, shipmentId: null, expectedUpdatedAt: null }, "pickup-test", null), /zwischenzeitlich/);
    const unlinked = await savePickupPlan(c, "800000111", { planned: true, shipmentId: null, expectedUpdatedAt: first.updatedAt }, "pickup-test", null);
    assert.equal(unlinked.planned, true);
    assert.equal(unlinked.shipmentId, null);
    await assert.rejects(savePickupPlan(c, "800000111", { planned: false, shipmentId: null, expectedUpdatedAt: first.updatedAt }, "pickup-test", null), /zwischenzeitlich/);
    const linked = await savePickupPlan(c, "800000111", { planned: true, shipmentId: 11, expectedUpdatedAt: unlinked.updatedAt }, "pickup-test", null);
    await c.query("DELETE FROM shipments WHERE id=11");
    assert.equal((await listPickupPlans(c, null))[0].planned, true);
    assert.equal((await listPickupPlans(c, null))[0].shipment, null);
    const cleared = await savePickupPlan(c, "800000111", { planned: false, shipmentId: null, expectedUpdatedAt: linked.updatedAt }, "pickup-test", null);
    await imported("800000111", "replace");
    assert.equal((await listPickupPlans(c, null))[0].planned, false);
    assert.equal(cleared.shipmentId, null);
    assert.equal(Number((await c.query("SELECT count(*) FROM einlagerung_events WHERE action='Abholplanung geändert'")).rows[0].count), 4);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

test("bulk planning is all-or-nothing, preserves existing links by default and never changes unselected deliveries (temporary tables only)", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`CREATE TEMP TABLE einlagerung_datasets(id SERIAL PRIMARY KEY,type TEXT,filename TEXT,rows JSONB,row_count INTEGER,imported_by TEXT,imported_at TIMESTAMPTZ DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE einlagerung_events(id SERIAL PRIMARY KEY,action TEXT,username TEXT,detail TEXT,created_at TIMESTAMPTZ DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE einlagerung_pickup_plans(delivery_number TEXT PRIMARY KEY,planned BOOLEAN,shipment_id INTEGER,updated_at TIMESTAMPTZ DEFAULT date_trunc('milliseconds',clock_timestamp()),CHECK(planned OR shipment_id IS NULL)) ON COMMIT DROP;
      CREATE TEMP TABLE shipments(id INTEGER PRIMARY KEY,spedition_id INTEGER,kennzeichen TEXT,eta_date DATE,eta_time TEXT,status TEXT,relation TEXT) ON COMMIT DROP;
      CREATE TEMP TABLE speditionen(id INTEGER PRIMARY KEY,name TEXT) ON COMMIT DROP;
      INSERT INTO speditionen VALUES(1,'Test'),(2,'Nicht freigegeben');
      INSERT INTO shipments VALUES(11,1,'TEST',NULL,NULL,'Angemeldet','Test'),(12,2,'PRIVAT',NULL,NULL,'Angemeldet','Privat'),(13,1,'STORNO',NULL,NULL,'Storniert','Test');
      INSERT INTO einlagerung_datasets(type,rows) VALUES('auftraege','[{"beleg":"800000111"},{"beleg":"800000222"},{"beleg":"800000333"}]');
      INSERT INTO einlagerung_pickup_plans(delivery_number,planned,shipment_id) VALUES('800000333',true,12);`);
    const numbers = ["800000111", "800000222"];
    const targets = async () => {
      const plans = new Map((await listPickupPlans(c, null)).map((p) => [p.deliveryNumber, p]));
      return numbers.map((deliveryNumber) => ({ deliveryNumber, expectedUpdatedAt: plans.get(deliveryNumber)?.updatedAt ?? null }));
    };
    const unchanged = (await listPickupPlans(c, null))[0];
    const input = { deliveries: await targets(), planned: true, shipmentMode: "keep", shipmentId: null };
    const first = await savePickupBatch(c, input, "batch-test", [1]);
    assert.equal(first.length, 2);
    assert.ok(first.every((p) => p.planned && p.shipmentId === null));
    const beforeErrors = await listPickupPlans(c, null);
    const current = await targets();
    await assert.rejects(savePickupBatch(c, { ...input, deliveries: [current[0], { ...current[1], expectedUpdatedAt: null }], planned: false, shipmentMode: "remove" }, "batch-test", [1]), /zwischenzeitlich/);
    await assert.rejects(savePickupBatch(c, { ...input, deliveries: [current[0], { deliveryNumber: "800000999", expectedUpdatedAt: null }] }, "batch-test", [1]), /nicht gefunden/);
    for (const shipmentId of [12, 13, 999]) {
      await assert.rejects(savePickupBatch(c, { ...input, deliveries: current, shipmentMode: "assign", shipmentId }, "batch-test", [1]), /nicht gefunden|aktive/);
    }
    assert.deepEqual(await listPickupPlans(c, null), beforeErrors, "kein Datensatz wird bei einem Konflikt oder ungültigen LKW teilweise gespeichert");
    const assigned = await savePickupBatch(c, { ...input, deliveries: await targets(), shipmentMode: "assign", shipmentId: 11 }, "batch-test", [1]);
    assert.ok(assigned.every((p) => p.shipmentId === 11));
    await c.query("UPDATE shipments SET status='Abgefertigt' WHERE id=11");
    await c.query("UPDATE einlagerung_pickup_plans SET shipment_id=12 WHERE delivery_number='800000222'");
    const kept = await savePickupBatch(c, { ...input, deliveries: await targets() }, "batch-test", [1]);
    assert.equal(kept[0].shipmentId, 11);
    assert.equal(kept[0].shipment?.status, "Abgefertigt");
    assert.equal(kept[1].shipmentId, 12, "Standardaktion erhält auch unterschiedliche bisherige LKW-Verknüpfungen");
    assert.equal(kept[1].shipment, null, "private LKW-Details bleiben geschützt");
    await assert.rejects(savePickupBatch(c, { ...input, deliveries: await targets(), shipmentMode: "assign", shipmentId: 11 }, "batch-test", [1]), /aktive/);
    const removed = await savePickupBatch(c, { ...input, deliveries: await targets(), shipmentMode: "remove" }, "batch-test", [1]);
    assert.ok(removed.every((p) => p.planned && p.shipmentId === null));
    const reset = await savePickupBatch(c, { ...input, deliveries: await targets(), planned: false, shipmentMode: "remove" }, "batch-test", [1]);
    assert.ok(reset.every((p) => !p.planned && p.shipmentId === null));
    assert.deepEqual((await listPickupPlans(c, null)).find((p) => p.deliveryNumber === unchanged.deliveryNumber), unchanged);
    assert.equal(Number((await c.query("SELECT count(*) FROM einlagerung_events")).rows[0].count), 5, "eine nachvollziehbare Auditaktion je erfolgreichem Stapel, keine bei Fehlern");
  } finally { await c.query("ROLLBACK"); c.release(); }
});
