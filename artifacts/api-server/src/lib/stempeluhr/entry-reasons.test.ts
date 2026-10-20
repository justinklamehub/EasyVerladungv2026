import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { ensureEntryReasons } from "./entry-reasons";

after(async () => { await pool.end(); });
test("isolated legacy backfill uses the last nonempty entry reason, ignores unrelated audits and runs only once", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Temporary shadow tables: no existing employee, entry or audit record is read or changed.
    await c.query(`CREATE TEMP TABLE clock_entries(id INTEGER PRIMARY KEY) ON COMMIT DROP;
      CREATE TEMP TABLE clock_audit(id INTEGER PRIMARY KEY,action TEXT,reason TEXT,after_data JSONB) ON COMMIT DROP;
      INSERT INTO clock_entries VALUES(1),(2),(3);
      INSERT INTO clock_audit VALUES
        (1,'Zeit manuell angelegt','Manuell','{"id":1}'),
        (2,'Zeit korrigiert','Arzttermin','{"id":1}'),
        (3,'Zeit korrigiert','','{"id":1}'),
        (4,'Zeit korrigiert','Angepasst','{"id":2}'),
        (5,'Mitarbeiter geändert','Kein Zeitgrund','{"id":3}'),
        (6,'Zeit storniert','Nicht übernehmen','{"id":1}');`);
    await ensureEntryReasons(c);
    assert.deepEqual((await c.query("SELECT reason FROM clock_entries ORDER BY id")).rows.map((r) => r.reason), ["Arzttermin", "Angepasst", ""]);
    await c.query("UPDATE clock_entries SET reason='' WHERE id=1");
    await ensureEntryReasons(c);
    assert.equal((await c.query("SELECT reason FROM clock_entries WHERE id=1")).rows[0].reason, "", "a cleared current reason must never be resurrected from history");
    await c.query("INSERT INTO clock_entries(id) VALUES(4)");
    assert.equal((await c.query("SELECT reason FROM clock_entries WHERE id=4")).rows[0].reason, "");
  } finally { await c.query("ROLLBACK"); c.release(); }
});
