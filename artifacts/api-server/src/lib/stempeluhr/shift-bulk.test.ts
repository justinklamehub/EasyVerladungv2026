import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { ensureClockTables } from "./model";
import { planning, saveShift, saveShiftAssignments } from "./shifts";
import { CreateClockShiftAssignmentsBody } from "@workspace/api-zod";

after(async () => { await pool.end(); });
test("bulk assignment validates the whole selection, retains existing plans, and saves one complete audited cycle per employee (rollback only)", async () => {
  await ensureClockTables();
  const c = await pool.connect(), tag = `CLOCK_BULK_TEST_${randomUUID()}`;
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(674092)");
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) ids.push((await c.query("INSERT INTO clock_employees(card_number,first_name,last_name) VALUES($1,$2,$3) RETURNING id", [`${tag}_${i}`, `Person${i}`, tag])).rows[0].id);
    const early = await saveShift(c, "shift", { name: `${tag}_Früh`, startTime: "06:00", endTime: "14:00", pauseMinutes: 30 }, tag);
    const late = await saveShift(c, "shift", { name: `${tag}_Spät`, startTime: "14:00", endTime: "22:00", pauseMinutes: 30 }, tag);
    const input = { employeeIds: ids, startsOn: "2026-12-21", endsOn: null, weekdays: [5, 1, 2, 3, 4], shiftIds: [early.id, late.id] };
    const count = async () => (await c.query("SELECT count(*)::int AS n FROM clock_shift_assignments WHERE employee_id=ANY($1::integer[])", [ids])).rows[0].n;
    const auditCount = async () => (await c.query("SELECT count(*)::int AS n FROM clock_audit WHERE actor=$1 AND action='Schicht zugeteilt'", [tag])).rows[0].n;
    assert.equal(CreateClockShiftAssignmentsBody.safeParse({ ...input, employeeIds: [] }).success, false);
    await assert.rejects(saveShiftAssignments(c, { ...input, employeeIds: [ids[0], ids[0]] }, tag), /unterschiedliche/);
    await assert.rejects(saveShiftAssignments(c, { ...input, employeeIds: [1.5] }, tag), /unterschiedliche/);
    await assert.rejects(saveShiftAssignments(c, { ...input, employeeIds: Array.from({ length: 501 }, (_, i) => i + 1) }, tag), /500/);
    await assert.rejects(saveShiftAssignments(c, { ...input, employeeIds: [ids[0], 2147483647] }, tag), /fehlt/);
    await assert.rejects(saveShiftAssignments(c, { ...input, shiftIds: [2147483647] }, tag), /existiert nicht/);
    assert.equal(await count(), 0);
    await c.query("UPDATE clock_employees SET active=false WHERE id=$1", [ids[1]]);
    await assert.rejects(saveShiftAssignments(c, input, tag), /nicht mehr aktiv/);
    await c.query("UPDATE clock_employees SET active=true WHERE id=$1", [ids[1]]);
    const existing = await saveShift(c, "assignment", { employeeId: ids[1], ...input, startsOn: input.startsOn }, tag);
    await assert.rejects(saveShiftAssignments(c, input, tag), (err: any) => err.status === 409 && err.message.includes("Person1"));
    assert.equal(await count(), 1, "no partial assignments for nonconflicting staff");
    assert.equal(await auditCount(), 1, "conflict does not create audit records");
    await c.query("DELETE FROM clock_shift_assignments WHERE id=$1", [existing.id]);
    const saved = await saveShiftAssignments(c, input, tag);
    assert.equal(saved.length, 3);
    assert.equal(await count(), 3);
    assert.equal(await auditCount(), 4);
    assert.deepEqual(new Set(saved.map((a) => a.employeeId)), new Set(ids));
    for (const id of ids) {
      const p = await planning(c, "2026-12-21", "2026-12-28", id);
      assert.equal(p.days.find((d) => d.day === "2026-12-21")?.shiftId, early.id);
      assert.equal(p.days.find((d) => d.day === "2026-12-28")?.shiftId, late.id);
      assert.equal(p.days.find((d) => d.day === "2026-12-26")?.shiftName, "Frei");
    }
    await assert.rejects(saveShiftAssignments(c, input, tag), /Überschneidung/);
    assert.equal(await count(), 3, "retry cannot duplicate the batch");
    assert.deepEqual((await c.query("SELECT data FROM clock_shift_assignments WHERE id=$1", [saved[0].id])).rows[0].data.weekdays, [1, 2, 3, 4, 5]);
  } finally { await c.query("ROLLBACK"); c.release(); }
});
