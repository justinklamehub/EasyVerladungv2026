import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import router from "./user-preferences";
import { EMPTY_SHIPMENT_WORK_VIEWS, SHIPMENT_WORK_VIEWS_KEY, type ShipmentWorkViews } from "@workspace/api-zod/shipment-work-views";

test("Arbeitsansichten: Router-Persistenz, Sitzungsisolation, Validierung und konkurrierende Schreibvorgänge", async t => {
  const saved = new Map<string, ShipmentWorkViews>();
  const dialect = new PgDialect();
  let writes = 0;
  t.mock.method(db, "execute", async (statement: SQL) => {
    const { sql, params } = dialect.sqlToQuery(statement);
    if (sql.includes("INSERT INTO")) {
      writes++;
      const key = `${params[0]}:${params[1]}`;
      if (saved.has(key)) return { rows: [] };
      const value = JSON.parse(String(params[2]));
      saved.set(key, value);
      return { rows: [{ value }] };
    }
    if (sql.includes("UPDATE user_preferences")) {
      writes++;
      const key = `${params[1]}:${params[2]}`;
      if (saved.get(key)?.revision !== params[3]) return { rows: [] };
      const value = JSON.parse(String(params[0]));
      saved.set(key, value);
      return { rows: [{ value }] };
    }
    assert.ok(sql.includes("WHERE user_id ="));
    const value = saved.get(`${params[0]}:${params[1]}`);
    return { rows: value ? [{ value }] : [] };
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: Number(req.headers["x-test-user"]) || undefined } as typeof req.session;
    next();
  });
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/user-preferences/${SHIPMENT_WORK_VIEWS_KEY}`;
  const request = (user?: number, value?: unknown) => fetch(url, {
    method: value === undefined ? "GET" : "PUT",
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify({ value, userId: 22 }) }),
  });
  assert.equal((await request()).status, 401);
  assert.equal((await request(undefined, EMPTY_SHIPMENT_WORK_VIEWS)).status, 401);
  assert.deepEqual(await (await request(11)).json(), { value: EMPTY_SHIPMENT_WORK_VIEWS });
  const initial = { ...EMPTY_SHIPMENT_WORK_VIEWS, views: [{
    id: "550e8400-e29b-41d4-a716-446655440000", name: "Heute",
    filters: { search: "", status: "__all__", speditionId: "__all__", lkwArt: "__all__", tor: "__all__",
      date: { mode: "today" }, sortField: "etaDate", sortDir: "asc", showAbgefertigt: false, showStorniert: false },
  }] };
  const first = await request(11, initial);
  assert.equal(first.status, 200);
  const result = await first.json() as { ok: boolean; value: ShipmentWorkViews };
  assert.equal(result.value.revision, 1);
  for (let i = 0; i < 2; i++) assert.deepEqual(await (await request(11)).json(), { value: result.value });
  assert.deepEqual(await (await request(22)).json(), { value: EMPTY_SHIPMENT_WORK_VIEWS }, "Body userId is never used");
  assert.equal((await request(11, initial)).status, 409, "Stale initial writes cannot erase saved data");
  const rename = { ...result.value, views: [{ ...result.value.views[0], name: "Umbenannt" }] };
  assert.equal((await request(11, rename)).status, 200);
  assert.equal((await request(11, { ...result.value, views: [] })).status, 409, "Stale delete cannot erase a renamed view");
  const before = writes;
  assert.equal((await request(11, { ...rename, views: [{ ...rename.views[0], name: " " }] })).status, 400);
  assert.equal(writes, before, "Invalid values never reach the database");
  const current = (await (await request(11)).json() as { value: ShipmentWorkViews }).value;
  assert.equal(current.views[0].name, "Umbenannt");
  assert.equal((await request(11, { ...current, views: [] })).status, 200);
  assert.deepEqual((await (await request(11)).json() as { value: ShipmentWorkViews }).value.views, []);
});
