/**
 * Targeted HTTP integration check. Run only after independently confirming the
 * app database matches the explicitly selected development database.
 * Usage: pnpm --filter @workspace/api-server exec tsx ../../tools/test-pallet-purchases.ts --development-db=heliumdb:16384
 * Only this script's own purchase records and their audit rows are removed.
 */
import express from "express";
import assert from "node:assert/strict";
import { pool } from "../lib/db/src/index";
import purchases from "../artifacts/api-server/src/routes/pallet-purchases";
import pallets from "../artifacts/api-server/src/routes/pallets";
import { berlinToday } from "../artifacts/api-server/src/lib/pallet-purchases";

async function run() {
  const target = (await pool.query("SELECT current_database() AS name,oid FROM pg_database WHERE datname=current_database()")).rows[0];
  assert(process.argv.includes(`--development-db=${target.name}:${target.oid}`), "Explicit development-database proof required.");
  const user = (await pool.query("SELECT id FROM users WHERE role='comet_admin' AND is_active=true LIMIT 1")).rows[0];
  assert(user, "An active COMET administrator is required; no permissions will be changed.");
  const ids: number[] = [];
  const app = express();
  app.use(express.json());
  // Test-only app bound to loopback, never mounted in the actual API.
  app.use((req: any, _res, next) => {
    req.session = req.headers["x-test-anonymous"] ? {} : {
      userId: user.id, role: req.headers["x-test-role"] ?? "comet_admin", speditionId: null,
    };
    req.log = { error: () => {} }; next();
  });
  app.use("/api", purchases, pallets);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  assert(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}/api`;
  const request = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const before = (await request("/pallet-werkbestand")).body;
    const accounts = (await request("/pallet-balances")).body;
    const input = { purchaseDate: berlinToday(), amount: 53, speditionName: "Automatischer Kaufpaletten-Test – freie Eingabe", reference: "Testbeleg", note: "Temporäre Prüfung" };
    assert.equal((await request("/pallet-purchases", "GET", undefined, { "x-test-anonymous": "true" })).status, 401);
    assert.equal((await request("/pallet-purchases", "GET", undefined, { "x-test-role": "speditions_viewer" })).status, 403);
    assert.equal((await request("/pallet-purchases", "POST", input, { "x-test-role": "unbekannte-testrolle" })).status, 403);
    for (const change of [{ amount: 0 }, { amount: -2 }, { amount: 2.5 }, { speditionName: " " }, { purchaseDate: "2026-02-30" }]) {
      assert.equal((await request("/pallet-purchases", "POST", { ...input, ...change })).status, 400);
    }
    const created = await request("/pallet-purchases", "POST", input);
    assert.equal(created.status, 201); ids.push(created.body.id);
    assert.equal(created.body.speditionName, input.speditionName);
    const included = before.hasInventur && input.purchaseDate >= before.inventurDate;
    const checkStock = async (quantity: number) => {
      const stock = (await request("/pallet-werkbestand")).body;
      assert.equal(stock.werkbestand, before.werkbestand === null ? null : before.werkbestand + (included ? quantity : 0));
      assert.deepEqual((await request("/pallet-balances")).body, accounts, "Purchase must never affect accounts, balances or account history.");
    };
    await checkStock(53);
    const list = await request(`/pallet-purchases?dateFrom=${input.purchaseDate}&dateTo=${input.purchaseDate}`);
    assert(list.body.some((r: any) => r.id === created.body.id));
    const edited = await request(`/pallet-purchases/${created.body.id}`, "PUT", { ...input, amount: 9, reference: "", note: "", expectedUpdatedAt: created.body.updatedAt });
    assert.equal(edited.status, 200); assert.equal(edited.body.reference, ""); assert.equal(edited.body.note, "");
    await checkStock(9);
    const stale = await request(`/pallet-purchases/${created.body.id}`, "PUT", { ...input, expectedUpdatedAt: created.body.updatedAt });
    assert.equal(stale.status, 409);
    const history = await request(`/pallet-purchases/${created.body.id}`, "PUT", { ...input, amount: 9, purchaseDate: "1900-01-01", expectedUpdatedAt: edited.body.updatedAt });
    assert.equal(history.status, 200);
    if (before.hasInventur && before.inventurDate > "1900-01-01") await checkStock(0);
    assert.equal((await request(`/pallet-purchases/${created.body.id}`, "DELETE", { expectedUpdatedAt: edited.body.updatedAt })).status, 409);
    assert.equal((await request(`/pallet-purchases/${created.body.id}`, "DELETE", { expectedUpdatedAt: history.body.updatedAt })).status, 204);
    await checkStock(0);
    assert.equal((await request("/pallet-purchases")).body.some((r: any) => ids.includes(r.id)), false);
    const audit = await pool.query("SELECT field FROM audit_log WHERE module='pallet_purchase' AND record_id=ANY($1::int[])", [ids]);
    assert(audit.rows.some((r) => r.field === "created") && audit.rows.some((r) => r.field === "updated") && audit.rows.some((r) => r.field === "deleted"));
    console.log(JSON.stringify({ result: "passed", stockAndPropertyChange: true, accountsUnchanged: true, freeVendor: true, createEditDelete: true, invalidInput: true, permissions: true, staleVersionsRejected: true, inventoryBoundary: true, audit: true }));
  } finally {
    if (ids.length) {
      await pool.query("DELETE FROM pallet_purchases WHERE id=ANY($1::int[])", [ids]);
      await pool.query("DELETE FROM audit_log WHERE module='pallet_purchase' AND record_id=ANY($1::int[])", [ids]);
    }
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
}
run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
