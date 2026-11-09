import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "./calculation";
import { UpdateClockEntryBody } from "@workspace/api-zod";
import { closeOverdueEntries, MIDNIGHT_COMMENT } from "./midnight";

test("midnight closes all and only overdue open entries, preserves notes/scans/rules, and is idempotent", async () => {
  const rows = [
    makeEntry(1, "2026-11-08T10:00:00Z", "Vorhandene Notiz"),
    makeEntry(2, "2026-11-08T21:00:00Z"),
    makeEntry(3, "2026-11-08T23:00:00Z"), // today's exact midnight
    makeEntry(4, "2026-11-09T10:00:00Z"), // future
    { ...makeEntry(5, "2026-11-07T10:00:00Z"), deleted_at: "2026-11-07T11:00:00Z" },
    { ...makeEntry(6, "2026-11-08T10:00:00Z"), ended_at: "2026-11-08T11:00:00Z" },
  ];
  const { c, audits } = mockClient(rows);
  assert.equal(await closeOverdueEntries(c, new Date("2026-11-08T23:00:00Z")), 2);
  assert.equal(rows[0].ended_at, "2026-11-08T23:00:00.000Z");
  assert.equal(rows[1].ended_at, rows[0].ended_at);
  assert.equal(rows[0].reason, `Vorhandene Notiz\n${MIDNIGHT_COMMENT}`);
  assert.equal(rows[1].reason, MIDNIGHT_COMMENT);
  assert.equal(rows[0].original_ended_at, null);
  assert.equal(rows[2].ended_at, null);
  assert.equal(audits.length, 2);
  assert.equal(audits[0][1], "System");
  const before = JSON.parse(audits[0][3]), after = JSON.parse(audits[0][4]);
  assert.equal(before.endedAt, null);
  assert.equal(after.endedAt, rows[0].ended_at);
  assert.equal(after.originalEndedAt, null);
  assert.equal(after.pauseOverride, 0);
  assert.equal(await closeOverdueEntries(c, new Date("2026-11-08T23:01:00Z")), 0);
  assert.equal(audits.length, 2);
});

test("downtime catch-up uses first midnight, including DST changes", async () => {
  for (const [start, expected] of [
    ["2026-03-29T00:00:00Z", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25T00:00:00Z", "2026-10-25T23:00:00.000Z"],
    ["2026-10-01T10:00:00Z", "2026-10-01T22:00:00.000Z"],
  ]) {
    const rows = [makeEntry(1, start)];
    const { c } = mockClient(rows);
    await closeOverdueEntries(c, new Date("2026-11-09T12:00:00Z"));
    assert.equal(rows[0].ended_at, expected);
    assert.equal(rows[0].rules.manualStart, true);
    assert.equal(rows[0].source, "manual");
  }
});

test("a full-length note stays editable and reopening does not duplicate the system comment", async () => {
  const rows = [makeEntry(1, "2026-11-08T10:00:00Z", "A".repeat(1000))];
  const { c } = mockClient(rows);
  const now = new Date("2026-11-09T12:00:00Z");
  await closeOverdueEntries(c, now);
  assert.ok(UpdateClockEntryBody.safeParse({ employeeId: 1,
    startedAt: rows[0].started_at, endedAt: rows[0].ended_at,
    pauseOverride: 0, reason: rows[0].reason }).success);
  const reason = rows[0].reason;
  rows[0].ended_at = null;
  await closeOverdueEntries(c, now);
  assert.equal(rows[0].reason, reason);
});

function makeEntry(id: number, start: string, reason = "") {
  return { id, employee_id: id, started_at: start, ended_at: null as string | null,
    original_started_at: start, original_ended_at: null, reason, deleted_at: null as string | null,
    updated_at: start, rules: { ...DEFAULT_SETTINGS, manualStart: true }, pause_override: 0, source: "manual",
    card_number: "TEST", first_name: "Test", last_name: "Person", provider: "", activity: "" };
}
function mockClient(rows: ReturnType<typeof makeEntry>[]) {
  const audits: any[][] = [];
  const c = { async query(sql: string, values: any[]) {
    const result = (rows: any[]) => ({ rows, rowCount: rows.length });
    if (sql.startsWith("SELECT e.*")) {
      assert.match(sql, /ended_at IS NULL AND e.deleted_at IS NULL/);
      assert.match(sql, /FOR UPDATE OF e/);
      return result(rows.filter((r) => !r.ended_at && !r.deleted_at && new Date(r.started_at) < values[0]).map((r) => structuredClone(r)));
    }
    if (sql.startsWith("UPDATE clock_entries")) {
      const r = rows.find((r) => r.id === values[0])!;
      r.ended_at = values[1].toISOString();
      r.reason = values[2];
      return result([structuredClone(r)]);
    }
    if (sql.startsWith("INSERT INTO clock_audit")) { audits.push(values); return result([]); }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  return { c: c as any, audits };
}
