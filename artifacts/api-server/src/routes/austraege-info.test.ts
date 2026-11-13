import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import { db, pool, lkwAustraegeTable, palletMovementsTable, shipmentsTable, speditionenTable } from "@workspace/db";
import austraegeRouter from "./austraege";
import shipmentsRouter from "./shipments";
import { invalidatePermissionsCache } from "../lib/permissions";

// All database entry points are mocked: no business records or notifications are created.
test("Dusseldorf info persists separately, stays internal and never affects pallet accounting", async t => {
  const receipts: Record<string, any>[] = [];
  const movements: Record<string, any>[] = [];
  const shipment = { id: 21, speditionId: 1, status: "Verladen" };
  const chain = (rows: any[]) => {
    const q: any = { then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
    q.where = q.orderBy = q.limit = () => q;
    return q;
  };
  t.mock.method(db, "select", () => ({
    from: (table: unknown) => chain(
      table === lkwAustraegeTable ? receipts :
      table === shipmentsTable ? [shipment] :
      table === speditionenTable ? [{ id: 1, name: "Test", palletFaktor: 1 }] : [],
    ),
  }));
  t.mock.method(db, "execute", async () => ({ rows: [
    { role: "speditions_bearbeiter", permission: "austrag.create", allowed: true },
  ] }));
  t.mock.method(pool, "query", async () => { throw new Error("Unexpected database access"); });
  t.mock.method(db, "insert", (table: unknown) => ({
    values: (data: any) => {
      const row = { id: receipts.length + 1, ...data };
      if (table === lkwAustraegeTable) receipts.push(row);
      if (table === palletMovementsTable) movements.push(data);
      return { returning: async () => [row], then: (resolve: any) => Promise.resolve([]).then(resolve) };
    },
  }));
  t.mock.method(db, "update", () => ({ set: () => ({ where: async () => [] }) }));
  t.mock.method(db, "delete", () => ({ where: () => ({ returning: async () => receipts.splice(0, 1) }) }));
  invalidatePermissionsCache();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: req.headers["x-no-auth"] ? undefined : 1, role: req.headers["x-role"] || "comet_admin", speditionId: 1 };
    next();
  });
  app.use("/api", austraegeRouter, shipmentsRouter);
  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => { server.close(); invalidatePermissionsCache(); });
  const address = server.address() as { port: number };
  const call = (path: string, body?: Record<string, any>, role = "comet_admin", method = body ? "POST" : "GET") =>
    fetch(`http://127.0.0.1:${address.port}/api/${path}`, {
      method, headers: { "content-type": "application/json", "x-role": role },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const base = { datum: "2026-11-13", shipmentId: 21, beauftragteSpeditionId: 1 };
  const json = (response: Awaited<ReturnType<typeof fetch>>) => response.json() as Promise<any>;
  await t.test("info-only entry is stored but creates no pallet movement", async () => {
    const response = await call("austraege", { ...base, duesseldorferPaletten: 18 });
    assert.equal(response.status, 201);
    assert.equal((await json(response)).duesseldorferPaletten, 18);
    assert.equal(receipts[0].duesseldorferPaletten, 18);
    assert.equal(movements.length, 0);
    const reloaded = await json(await call("austraege?shipmentId=21"));
    assert.equal(reloaded[0].duesseldorferPaletten, 18);
  });
  await t.test("Euro accounting is unchanged when info is supplied", async () => {
    const response = await call("austraege", {
      ...base, duesseldorferPaletten: 9, vonCometEuropaletten: 33, anCometEuropaletten: 3,
    });
    assert.equal(response.status, 201);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].amount, 30);
    assert(!Object.hasOwn(movements[0], "duesseldorferPaletten"));
  });
  await t.test("null and explicit zero remain distinct", async () => {
    for (const value of [null, 0]) {
      const response = await call("austraege", { ...base, duesseldorferPaletten: value });
      assert.equal(response.status, 201);
      assert.equal((await json(response)).duesseldorferPaletten, value);
    }
    const response = await call("austraege", base);
    assert.equal((await json(response)).duesseldorferPaletten, null);
  });
  await t.test("bad counts are rejected without writing", async () => {
    const before = receipts.length;
    for (const value of [-1, 1.5, "12", "", true, 2147483648, {}]) {
      const response = await call("austraege", { ...base, duesseldorferPaletten: value });
      assert.equal(response.status, 400, JSON.stringify(value));
    }
    assert.equal(receipts.length, before);
  });
  await t.test("COMET exports receive sums; carriers receive no internal value", async () => {
    for (const role of ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]) {
      const response = await call("shipments", undefined, role);
      assert.equal(response.status, 200);
      const rows = await json(response);
      assert.equal(rows[0].duesseldorferVerladen, 27);
    }
    const response = await call("shipments", undefined, "speditions_bearbeiter");
    assert.equal(response.status, 200);
    const rows = await json(response);
    assert.equal(rows.length, 1);
    assert(!Object.hasOwn(rows[0], "duesseldorferVerladen"));
    assert.equal((await call("austraege", undefined, "speditions_bearbeiter")).status, 403);
    const before = receipts.length;
    assert.equal((await call("austraege", { ...base, duesseldorferPaletten: 7 }, "speditions_bearbeiter")).status, 403);
    assert.equal(receipts.length, before);
  });
  await t.test("deleting a receipt removes its info from future exports without accounting changes", async () => {
    assert.equal((await call("austraege/1", undefined, "comet_admin", "DELETE")).status, 200);
    const rows = await json(await call("shipments"));
    assert.equal(rows[0].duesseldorferVerladen, 9);
    assert.equal(movements.length, 1);
  });
});
