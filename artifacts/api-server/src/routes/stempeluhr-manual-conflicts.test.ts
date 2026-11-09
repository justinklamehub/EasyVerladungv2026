import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import { db, pool } from "@workspace/db";
import { invalidatePermissionsCache } from "../lib/permissions";
import { DEFAULT_SETTINGS } from "../lib/stempeluhr/calculation";
import router from "./stempeluhr";

// Exercise the actual HTTP handlers, with ALL database IO mocked.
test("manual times: warning, explicit override, concurrency, duplicates and exact persisted values", async (t) => {
  const rows: any[] = [], audits: any[][] = [];
  let sequence = 0, version = 0, writes = 0;
  const result = (rows: any[]) => ({ rows, rowCount: rows.length });
  const client = { release() {}, async query(sql: string, v: any[] = []) {
    if (sql.includes("SELECT role,is_active FROM users")) return result([{ role: "comet_admin", is_active: true }]);
    if (sql.startsWith("SELECT id FROM clock_employees")) return result([{ id: 1 }]);
    if (sql.startsWith("SELECT * FROM clock_settings")) return result([{ data: DEFAULT_SETTINGS, updated_at: "2026-11-09T12:00:00Z" }]);
    if (sql.startsWith("SELECT e.*")) {
      if (sql.includes("e.employee_id=$1")) {
        const [employee, start, end, exclude] = v;
        return result(rows.filter((r) => r.employee_id === employee && r.id !== exclude && !r.deleted_at && (
          (Date.parse(r.started_at) < (end ? Date.parse(end) : Infinity) && (r.ended_at ? Date.parse(r.ended_at) : Infinity) > Date.parse(start))
          || (r.started_at === start && r.ended_at === end)
          || (!r.ended_at && !end)
        )).map((r) => structuredClone(r)));
      }
      return result(rows.filter((r) => r.id === v[0]).map((r) => structuredClone(r)));
    }
    const timestamp = () => new Date(Date.UTC(2026, 10, 9, 12, 0, ++version)).toISOString();
    if (sql.startsWith("INSERT INTO clock_entries(")) {
      const r = { id: ++sequence, employee_id: v[0], started_at: v[1], ended_at: v[2],
        original_started_at: v[1], original_ended_at: v[2], rules: structuredClone(v[3]),
        pause_override: v[4], reason: v[5], source: "manual", updated_at: timestamp(),
        card_number: "TEST", first_name: "Test", last_name: "Person", provider: "", activity: "" };
      rows.push(r); writes++;
      return result([{ id: r.id }]);
    }
    if (sql.startsWith("UPDATE clock_entries SET started_at")) {
      Object.assign(rows.find((r) => r.id === v[0]), { started_at: v[1], ended_at: v[2],
        pause_override: v[3], rules: structuredClone(v[4]), reason: v[5], updated_at: timestamp() });
      writes++;
    }
    if (sql.startsWith("INSERT INTO clock_audit(")) audits.push(v);
    return result([]);
  } };
  t.mock.method(pool, "connect", async () => client as any);
  t.mock.method(pool, "query", async () => { throw new Error("Real DB IO forbidden"); });
  t.mock.method(db, "execute", async () => ({ rows: [{ role: "comet_admin", permission: "stempeluhr.correct", allowed: true }] }) as any);
  invalidatePermissionsCache();
  t.after(() => invalidatePermissionsCache());
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: 999, role: "comet_admin" } as any;
    req.log = { error() {}, warn() {} } as any;
    next();
  });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = async (body: any, id?: number) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/stempeluhr/entries${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const input = { employeeId: 1, startedAt: "2026-11-08T06:00:00Z",
    endedAt: "2026-11-08T18:00:00Z", pauseOverride: 0, reason: "Manuell" };
  const first = await request(input);
  assert.equal(first.status, 201);
  assert.equal(first.body.bookedStart, input.startedAt.replace("Z", ".000Z"));
  const duplicate = await request(input);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, "CLOCK_ENTRY_WARNING");
  assert.equal(duplicate.body.conflicts.length, 1);
  assert.equal(writes, 1, "warning never persists anything");
  assert.equal(audits.length, 1);
  const confirmed = await request({ ...input, confirmation: duplicate.body.confirmation });
  assert.equal(confirmed.status, 201);
  assert.equal(rows.length, 2, "no existing entry deleted");
  assert.equal(confirmed.body.bookedEnd, input.endedAt.replace("Z", ".000Z"));
  assert.equal(confirmed.body.netMinutes, 720);
  assert.equal(audits.length, 2);

  // Another conflict appeared; a previous confirmation must no longer work.
  const replay = await request({ ...input, confirmation: duplicate.body.confirmation });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.conflicts.length, 2);
  assert.notEqual(replay.body.confirmation, duplicate.body.confirmation);
  const changedInput = await request({ ...input, reason: "Andere Eingabe", confirmation: replay.body.confirmation });
  assert.equal(changedInput.status, 409);
  assert.equal(writes, 2);

  // A system-generated change while the dialog is open can be explicitly overwritten.
  Object.assign(rows[0], { updated_at: "2026-11-09T13:00:00Z", reason: "Automatisch ausgestempelt" });
  const correction = { ...input, startedAt: "2026-11-07T06:00:00Z", endedAt: "2026-11-07T18:30:00Z",
    expectedUpdatedAt: first.body.updatedAt };
  const stale = await request(correction, 1);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.currentEntry.reason, "Automatisch ausgestempelt");
  assert.equal(stale.body.conflicts.length, 0);
  const override = await request({ ...correction, confirmation: stale.body.confirmation }, 1);
  assert.equal(override.status, 200);
  assert.equal(override.body.bookedEnd, "2026-11-07T18:30:00.000Z");
  assert.equal(override.body.originalStartedAt, first.body.originalStartedAt);
  const lastAudit = audits.at(-1)!;
  assert.equal(JSON.parse(lastAudit[3]).reason, "Automatisch ausgestempelt");
  assert.equal(JSON.parse(lastAudit[4]).reason, input.reason);

  // Long manual ranges are not blocked by the terminal/import seven-day guard.
  const long = await request({ ...input, startedAt: "2026-09-01T06:00:00Z", endedAt: "2026-09-10T18:00:00Z" });
  assert.equal(long.status, 201);
  const zero = { ...input, startedAt: "2026-08-01T06:00:00Z", endedAt: "2026-08-01T06:00:00Z" };
  assert.equal((await request(zero)).status, 201);
  assert.equal((await request(zero)).status, 409, "identical zero-length entries also warn");
  const open = { ...input, startedAt: "2026-12-01T06:00:00Z", endedAt: null };
  assert.equal((await request(open)).status, 201);
  const secondOpen = await request({ ...open, startedAt: "2026-12-02T06:00:00Z" });
  assert.equal(secondOpen.status, 409);
  assert.equal((await request({ ...open, startedAt: "2026-12-02T06:00:00Z", confirmation: secondOpen.body.confirmation })).status, 201);
  assert.equal(rows.filter((r) => !r.ended_at).length, 2);
  const beforeInvalid = writes;
  assert.equal((await request({ ...input, endedAt: "2026-01-01T00:00:00Z" })).status, 400);
  assert.equal(writes, beforeInvalid, "invalid ranges still rejected");
});
