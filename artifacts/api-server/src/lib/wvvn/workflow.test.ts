import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { editCompletedSession } from "./edit";
import { ensureWvvnTables, sessionDetail } from "./model";
import { reportWindow, prepareReport } from "./reports";
import { UpdateWvvnSessionBody } from "@workspace/api-zod";

after(async () => { await pool.end(); });

test("midnight report belongs to the completed Berlin day, including DST and year change", () => {
  assert.deepEqual(reportWindow(new Date("2026-10-19T22:00:00Z")), { date: "2026-10-19", cutoffDate: "2026-10-20" });
  assert.deepEqual(reportWindow(new Date("2026-10-19T21:59:59Z")), { date: "2026-10-18", cutoffDate: "2026-10-19" });
  assert.deepEqual(reportWindow(new Date("2026-03-29T22:00:00Z")), { date: "2026-03-29", cutoffDate: "2026-03-30" });
  assert.deepEqual(reportWindow(new Date("2026-10-25T23:00:00Z")), { date: "2026-10-25", cutoffDate: "2026-10-26" });
  assert.deepEqual(reportWindow(new Date("2026-12-31T23:00:00Z")), { date: "2026-12-31", cutoffDate: "2027-01-01" });
  assert.deepEqual(reportWindow(new Date("2026-10-19T22:00:00Z"), true), { date: "2026-10-20", cutoffDate: null });
});

test("report snapshot selects only previous-day completed work, keeps modes separate, and does not suppress midnight after manual mail", async () => {
  const calls: { sql: string; args: any[] }[] = [];
  let saved: any = null;
  let status = "";
  const c = { query: async (sql: string, args: any[] = []) => {
    calls.push({ sql, args });
    const result = (rows: any[]) => ({ rows, rowCount: rows.length });
    if (sql.includes("status IN ('pending','failed')")) return result(saved && status === "pending" ? [saved] : []);
    if (sql.includes("automatic_day=$2")) return result(saved ? [{ exists: true }] : []);
    if (sql.startsWith("SELECT id FROM wvvn_sessions")) {
      assert.ok(sql.includes("finished_at < ($2::date::timestamp AT TIME ZONE 'Europe/Berlin')"));
      assert.deepEqual(args, ["WERKSVERKAUF", "2026-10-20"]);
      assert.ok(sql.includes("legacy_id IS NULL"));
      return result([{ id: 10 }, { id: 11 }]);
    }
    if (sql.startsWith("SELECT i.*")) {
      assert.deepEqual(args, [[10, 11]]);
      return result([{ article_number: "T", article_name: "Test", pieces: 12, netto: true, kware: false }]);
    }
    if (sql.includes("MAX(running_no)")) return result([{ n: 51 }]);
    if (sql.startsWith("INSERT INTO wvvn_reports")) {
      assert.equal(args[1], "2026-10-19");
      assert.equal(args[4], "2026-10-19");
      assert.ok(args[3].includes("T;Test;Ja;Nein;12;ALLE"));
      saved = { id: 77, mode: args[0], report_date: args[1], csv: args[3] };
      status = "pending";
      return result([saved]);
    }
    return result([]);
  } } as unknown as PoolClient;
  const first = await prepareReport(c, "WERKSVERKAUF", new Date("2026-10-19T22:00:00Z"));
  assert.equal(first?.id, 77);
  assert.equal((await prepareReport(c, "WERKSVERKAUF", new Date("2026-10-19T22:01:00Z")))?.id, 77);
  status = "sent";
  assert.equal(await prepareReport(c, "WERKSVERKAUF", new Date("2026-10-20T12:00:00Z")), null);
  assert.equal(calls.filter((q) => q.sql.startsWith("INSERT INTO wvvn_reports")).length, 1);
});

test("completed-list corrections preserve original units, are versioned, and guard reported lists; all fixtures roll back", async () => {
  await ensureWvvnTables();
  const c = await pool.connect();
  const tag = `WVVN_UNIT_${randomUUID()}`;
  try {
    await c.query("BEGIN");
    const rec = (await c.query("INSERT INTO einlagerung_records(kind,data) VALUES('article',$1) RETURNING id",
      [JSON.stringify({ number: tag, name: "Test", ean: "", veEan: tag + "_VE", veFactor: 99, active: true })])).rows[0];
    const s = (await c.query(`INSERT INTO wvvn_sessions(owner_key,actor,mode,netto,kware,status,finished_at)
      VALUES($1,$1,'WERKSVERKAUF',false,true,'done',now()) RETURNING id`, [tag])).rows[0];
    const it = (await c.query(`INSERT INTO wvvn_items(session_id,article_number,article_name,scanned_code,unit,quantity,ve_factor,pieces)
      VALUES($1,$2,'Historischer Name',$3,'VE',1,12,12) RETURNING id`, [s.id, tag, tag + "_VE"])).rows[0];
    const body = UpdateWvvnSessionBody.parse({ revision: 0, mode: "VERNICHTUNG", netto: true, kware: false, reason: "Menge kontrolliert",
      acknowledgeReported: false, items: [{ id: it.id, quantity: 2 }, { code: tag, quantity: 3 }] });
    const edited = await editCompletedSession(c, s.id, body, tag);
    assert.equal(edited.revision, 1);
    assert.equal(edited.pieces, 27);
    assert.equal(edited.mode, "VERNICHTUNG");
    assert.equal(edited.kware, false);
    assert.equal(edited.items.find((i) => i.id === it.id)?.veFactor, 12);
    assert.equal(edited.items.find((i) => i.id === it.id)?.articleName, "Historischer Name");
    await assert.rejects(editCompletedSession(c, s.id, body, tag), /inzwischen geändert/);
    await assert.rejects(editCompletedSession(c, s.id, { ...body, revision: 1, items: [{ id: 2147483647, quantity: 1 }] }, tag), /fremde Position/);
    const r = (await c.query(`INSERT INTO wvvn_reports(mode,report_date,running_no,status,csv)
      SELECT 'VERNICHTUNG','2099-01-01',COALESCE(MAX(running_no),0)+10000,'pending','original CSV' FROM wvvn_reports
      WHERE mode='VERNICHTUNG' RETURNING id`)).rows[0];
    await c.query("UPDATE wvvn_sessions SET report_id=$1 WHERE id=$2", [r.id, s.id]);
    await assert.rejects(editCompletedSession(c, s.id, { ...body, revision: 1 }, tag), /Versand zugeordnet/);
    await c.query("UPDATE wvvn_reports SET status='sent' WHERE id=$1", [r.id]);
    await assert.rejects(editCompletedSession(c, s.id, { ...body, revision: 1 }, tag), /bestätigen/);
    const revised = await editCompletedSession(c, s.id, { ...body, revision: 1, acknowledgeReported: true, items: [{ id: it.id, quantity: 3 }] }, tag);
    assert.equal(revised.pieces, 36);
    assert.equal(revised.revision, 2);
    assert.equal(revised.items.length, 1);
    assert.equal((await c.query("SELECT csv FROM wvvn_reports WHERE id=$1", [r.id])).rows[0].csv, "original CSV");
    assert.equal((await c.query("SELECT count(*)::int AS n FROM wvvn_revisions WHERE session_id=$1", [s.id])).rows[0].n, 2);
    const legacy = (await c.query("SELECT id FROM wvvn_sessions WHERE legacy_id IS NOT NULL LIMIT 1")).rows[0];
    if (legacy) await assert.rejects(editCompletedSession(c, legacy.id, body, tag), /Altdaten/);
    assert.equal((await sessionDetail(c, s.id)).reported, true);
    assert.ok(rec.id > 0);
    // PostgreSQL itself interprets Berlin day boundaries correctly across DST.
    const dst = (await c.query(`SELECT
      EXTRACT(EPOCH FROM (('2026-03-30'::date::timestamp AT TIME ZONE 'Europe/Berlin') -
      ('2026-03-29'::date::timestamp AT TIME ZONE 'Europe/Berlin')))/3600 AS spring,
      EXTRACT(EPOCH FROM (('2026-10-26'::date::timestamp AT TIME ZONE 'Europe/Berlin') -
      ('2026-10-25'::date::timestamp AT TIME ZONE 'Europe/Berlin')))/3600 AS autumn`)).rows[0];
    assert.equal(Number(dst.spring), 23);
    assert.equal(Number(dst.autumn), 25);
  } finally { await c.query("ROLLBACK"); c.release(); }
});
