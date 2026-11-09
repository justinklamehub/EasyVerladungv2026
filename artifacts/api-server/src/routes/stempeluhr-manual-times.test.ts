import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import { db, pool } from "@workspace/db";
import { invalidatePermissionsCache } from "../lib/permissions";
import { DEFAULT_SETTINGS } from "../lib/stempeluhr/calculation";
import { entry } from "../lib/stempeluhr/model";
import router from "./stempeluhr";

// All DB calls are mocked; no employee, attendance or audit data is written.
test("manual creation and corrections persist exact time rules and retain original scans", async (t) => {
  let saved: any;
  const audits: any[] = [];
  const client = {
    release() {},
    async query(sql: string, values: any[] = []) {
      const result = (rows: any[]) => ({ rows, rowCount: rows.length });
      if (sql.includes("SELECT role,is_active FROM users")) return result([{ role: "comet_admin", is_active: true }]);
      if (sql.startsWith("SELECT id FROM clock_employees")) return result([{ id: 1 }]);
      if (sql.startsWith("SELECT * FROM clock_settings")) return result([{ data: DEFAULT_SETTINGS, updated_at: "2026-10-19T00:00:00Z" }]);
      if (sql.startsWith("SELECT e.*")) return result(saved ? [structuredClone(saved)] : []);
      if (sql.startsWith("INSERT INTO clock_entries(")) {
        saved = {
          id: 1, employee_id: values[0], started_at: values[1], ended_at: values[2],
          original_started_at: values[1], original_ended_at: values[2],
          rules: structuredClone(values[3]), pause_override: values[4], reason: values[5], source: "manual",
          updated_at: "2026-10-19T18:00:00Z", card_number: "TEST", first_name: "Test", last_name: "Person",
          provider: "", activity: "",
        };
        return result([{ id: 1 }]);
      }
      if (sql.startsWith("UPDATE clock_entries SET started_at")) {
        Object.assign(saved, { started_at: values[1], ended_at: values[2], pause_override: values[3],
          rules: structuredClone(values[4]), reason: values[5], updated_at: "2026-10-19T18:01:00Z" });
      }
      if (sql.startsWith("INSERT INTO clock_audit(")) audits.push(values);
      return result([]);
    },
  };
  t.mock.method(pool, "connect", async () => client as any);
  t.mock.method(pool, "query", async () => { throw new Error("Unexpected real database entry point"); });
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
  const request = (method: string, path: string, body: any) => fetch(`http://127.0.0.1:${address.port}/api/stempeluhr/entries${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const original = { employeeId: 1, startedAt: "2026-10-19T06:00:00+02:00", endedAt: "2026-10-19T16:30:00+02:00", pauseOverride: 20 };
  const created = await request("POST", "", original);
  assert.equal(created.status, 201);
  const createdBody = await created.json() as any;
  assert.equal(createdBody.bookedStart, "2026-10-19T04:00:00.000Z");
  assert.equal(createdBody.bookedEnd, "2026-10-19T14:30:00.000Z");
  assert.equal(createdBody.netMinutes, 610);
  assert.equal(saved.rules.manualStart, true);
  assert.equal(saved.rules.manualEnd, true);
  assert.equal(entry(structuredClone(saved)).netMinutes, 610, "reloaded entries and exports use the saved overrides");

  // Simulate a previously automatic terminal entry with an assigned shift.
  saved.source = "terminal";
  saved.rules = { ...DEFAULT_SETTINGS, shiftWindow: {
    day: "2026-10-19", name: "Früh", shiftId: 1, start: "2026-10-19T04:00:00Z", end: "2026-10-19T12:00:00Z",
  } };
  const corrected = await request("PUT", "/1", {
    ...original, startedAt: "2026-10-19T05:30:00+02:00", endedAt: "2026-10-19T17:00:00+02:00",
    pauseOverride: 0, expectedUpdatedAt: createdBody.updatedAt,
  });
  assert.equal(corrected.status, 200);
  const correctedBody = await corrected.json() as any;
  assert.equal(correctedBody.bookedStart, "2026-10-19T03:30:00.000Z");
  assert.equal(correctedBody.bookedEnd, "2026-10-19T15:00:00.000Z");
  assert.equal(correctedBody.netMinutes, 690);
  assert.equal(correctedBody.originalStartedAt, createdBody.originalStartedAt);
  assert.equal(correctedBody.originalEndedAt, createdBody.originalEndedAt);
  assert.equal(correctedBody.shiftName, "Früh");
  assert.equal(saved.rules.manualStart, true);
  assert.equal(saved.rules.manualEnd, true);
  assert.equal(audits.length, 2);
  assert.equal(entry(structuredClone(saved)).netMinutes, 690);
});
