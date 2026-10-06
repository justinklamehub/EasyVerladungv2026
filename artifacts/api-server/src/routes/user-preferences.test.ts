import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import router from "./user-preferences";
import { DEFAULT_SHELF_PLAN_PREFERENCE, SHELF_PLAN_PREFERENCE_KEY } from "../lib/shelf-plan-preference";

test("Benutzereinstellungen: Persistenz, Wertebereich und Sitzungsisolation", async (t) => {
  // Exercise the real router and SQL ownership boundary without touching live data.
  const saved = new Map<string, unknown>();
  const dialect = new PgDialect();
  let statements = 0;
  t.mock.method(db, "execute", async (statement: SQL) => {
    statements++;
    const { sql, params } = dialect.sqlToQuery(statement);
    const ownerKey = `${params[0]}:${params[1]}`;
    if (sql.includes("INSERT INTO")) {
      saved.set(ownerKey, JSON.parse(String(params[2])));
      return { rows: [] };
    }
    assert.ok(sql.includes("WHERE user_id ="));
    return { rows: saved.has(ownerKey) ? [{ value: saved.get(ownerKey) }] : [] };
  });
  const app = express();
  app.use(express.json());
  // Only this isolated test server uses a header to simulate authenticated sessions.
  app.use((req, _res, next) => {
    req.session = { userId: Number(req.headers["x-test-user"]) || undefined } as typeof req.session;
    next();
  });
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/user-preferences/`;
  const request = (owner: number | undefined, method = "GET", value?: unknown, extra?: object, key = SHELF_PLAN_PREFERENCE_KEY) =>
    fetch(base + key, {
      method,
      headers: { "Content-Type": "application/json", ...(owner ? { "x-test-user": String(owner) } : {}) },
      ...(method === "PUT" ? { body: JSON.stringify({ value, ...extra }) } : {}),
    });

  assert.equal((await request(undefined)).status, 401);
  assert.equal((await request(undefined, "PUT", DEFAULT_SHELF_PLAN_PREFERENCE)).status, 401);
  assert.equal(statements, 0);
  assert.equal((await request(11)).status, 404);

  for (const contentMode of ["planned", "orders", "returns", "reservations"]) {
    for (const view of ["matrix", "tiles"]) {
      const value = { contentMode, view };
      assert.equal((await request(11, "PUT", value, { userId: 12 })).status, 200);
      // Independent reads stand in for navigation and a full reload.
      for (let i = 0; i < 2; i++) assert.deepEqual(await (await request(11)).json(), { value });
      assert.equal((await request(12)).status, 404);
    }
  }
  const other = { contentMode: "returns", view: "matrix" };
  await request(12, "PUT", other);
  for (const value of [
    null, {}, { contentMode: "bad", view: "tiles" }, { contentMode: "orders", view: "bad" },
    { contentMode: "orders", view: "tiles", search: "Nicht speichern" },
    { contentMode: "orders", view: "tiles", occupancy: [] },
  ]) {
    const before: number = statements;
    assert.equal((await request(11, "PUT", value)).status, 400);
    assert.equal(statements, before, "Invalid values must never reach the database");
  }
  assert.deepEqual(await (await request(12)).json(), { value: other });
  saved.set(`11:${SHELF_PLAN_PREFERENCE_KEY}`, { contentMode: "legacy", view: "broken" });
  assert.deepEqual(await (await request(11)).json(), { value: DEFAULT_SHELF_PLAN_PREFERENCE });
  assert.deepEqual(await (await request(12)).json(), { value: other });

  // Other existing preference keys keep their original contract.
  const columns = { visibility: { lkw: true }, order: ["lkw"] };
  assert.equal((await request(11, "PUT", columns, undefined, "shipments_col_visibility")).status, 200);
  assert.deepEqual(await (await request(11, "GET", undefined, undefined, "shipments_col_visibility")).json(), { value: columns });
});
