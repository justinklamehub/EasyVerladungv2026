/**
 * Isolated database check. Confirm the official development DB first, then run:
 * pnpm --filter @workspace/api-server exec tsx ../../tools/test-unlimited-clock-terminals.ts --development-db=heliumdb:16384
 * All test terminal rows are rolled back. No user, setting or attendance record changes.
 */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import type { Request } from "express";
import { pool } from "../lib/db/src/index";
import { ensureClockTables } from "../artifacts/api-server/src/lib/stempeluhr/model";
import { activeTerminal, createTerminalRecord, terminalResult, TERMINAL_COOKIE } from "../artifacts/api-server/src/lib/stempeluhr/terminal";

async function run() {
  const target = (await pool.query("SELECT current_database() AS name,oid FROM pg_database WHERE datname=current_database()")).rows[0];
  assert(process.argv.includes(`--development-db=${target.name}:${target.oid}`), "Explicit development-database proof required.");
  await ensureClockTables();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const user = (await c.query("SELECT id FROM users WHERE is_active=true AND role='comet_admin' LIMIT 1")).rows[0];
    assert(user, "Active COMET administrator required; no users or permissions will be modified.");
    const token = randomBytes(32).toString("hex"), finiteToken = randomBytes(32).toString("hex");
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    const req = (t: string) => ({ get: (name: string) => name === "cookie" ? `${TERMINAL_COOKIE}=${t}` : undefined }) as unknown as Request;
    const forever = await createTerminalRecord(c, hash(token), "Isolierter Laufzeittest", user.id, null);
    const finite = await createTerminalRecord(c, hash(finiteToken), "Isolierter Stundenlaufzeittest", user.id, 12);
    assert.equal(forever.expires_at, null);
    assert(finite.expires_at instanceof Date);
    assert.equal((await activeTerminal(c, req(token)))?.id, forever.id);
    assert.equal((await activeTerminal(c, req(finiteToken)))?.id, finite.id);
    assert.equal(terminalResult(forever).expiresAt, null);
    const hours = (await c.query("SELECT EXTRACT(EPOCH FROM (expires_at-NOW()))/3600 AS hours FROM clock_terminals WHERE id=$1", [finite.id])).rows[0];
    assert.equal(Number(hours.hours), 12);
    await c.query("UPDATE clock_terminals SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [finite.id]);
    assert.equal(await activeTerminal(c, req(finiteToken)), undefined);
    assert.equal((await activeTerminal(c, req(token)))?.id, forever.id);
    await c.query("UPDATE clock_terminals SET revoked_at=NOW() WHERE id=$1", [forever.id]);
    assert.equal(await activeTerminal(c, req(token)), undefined);
    console.log(JSON.stringify({ result: "passed", unlimitedExpiry: true, validDeviceAccess: true, timedExpiryPreserved: true, expiredDevicesBlocked: true, unlimitedRevocation: true, testRows: "rolled back", settingsAndUsers: "unchanged" }));
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
}
run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
