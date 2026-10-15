/**
 * After confirming the official development target, run with --development-db=name:oid.
 * All test writes (including the counter) are rolled back; no employee IDs are consumed.
 */
import assert from "node:assert/strict";
import { pool } from "../lib/db/src/index";
import { ensureClockTables } from "../artifacts/api-server/src/lib/stempeluhr/model";
import { allocateClockCardNumber, previewClockCardNumber, formatClockCardNumber } from "../artifacts/api-server/src/lib/stempeluhr/employee-numbers";

async function run() {
  const target = (await pool.query("SELECT current_database() AS name,oid FROM pg_database WHERE datname=current_database()")).rows[0];
  assert(process.argv.includes(`--development-db=${target.name}:${target.oid}`), "Explicit development-database proof required.");
  await ensureClockTables();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(674092)");
    const initialCounter = (await c.query("SELECT last_number FROM clock_card_counter WHERE id=1")).rows[0].last_number;
    const next = await previewClockCardNumber(c);
    assert.equal(await previewClockCardNumber(c), next, "Preview must not reserve numbers");
    assert.equal(await allocateClockCardNumber(c), next);
    const n = Number(next.slice(1));
    assert.equal(await allocateClockCardNumber(c), formatClockCardNumber(n + 1));
    // Negative explicit ID avoids advancing the employees SERIAL during a rolled-back test.
    const id = -Math.floor(Math.random() * 1000000000 + 1);
    await c.query("INSERT INTO clock_employees(id,card_number,first_name,last_name) VALUES($1,$2,$3,$4)",
      [id, formatClockCardNumber(n + 20), "Isolierter", "Nummerntest"]);
    assert.equal(await allocateClockCardNumber(c), formatClockCardNumber(n + 21), "Imported higher numbers must be respected");
    await c.query("DELETE FROM clock_employees WHERE id=$1", [id]);
    assert.equal(await allocateClockCardNumber(c), formatClockCardNumber(n + 22), "Deletion must not cause number reuse");
    await c.query("UPDATE clock_card_counter SET last_number=99999999 WHERE id=1");
    await assert.rejects(() => allocateClockCardNumber(c), /ausgeschöpft/);
    await assert.rejects(() => previewClockCardNumber(c), /ausgeschöpft/);
    await c.query("ROLLBACK");
    assert.equal((await c.query("SELECT last_number FROM clock_card_counter WHERE id=1")).rows[0].last_number, initialCounter);
    assert.equal((await c.query("SELECT id FROM clock_employees WHERE id=$1", [id])).rowCount, 0);
    console.log(JSON.stringify({ result: "passed", previewDoesNotReserve: true, sequentialAllocation: true, importedNumbersRespected: true, noReuseAfterDeletion: true, exhaustionHandled: true, allTestChangesRolledBack: true }));
  } finally { await c.query("ROLLBACK"); c.release(); }
}
run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
