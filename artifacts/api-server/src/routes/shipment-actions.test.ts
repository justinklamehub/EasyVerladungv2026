import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { once } from "node:events";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, pool, shipmentsTable, speditionPermissionsTable } from "@workspace/db";
import { invalidatePermissionsCache } from "../lib/permissions";
import shipmentsRouter from "./shipments";
import { shipmentArrivalFields } from "../lib/shipment-arrival";

// In-process HTTP tests. Every DB entry point is mocked; no business data is read or written.
test("shipment print and next-status actions enforce independent permissions over HTTP", async (t) => {
  const initial = { id: 71, status: "Angemeldet", wareStatus: "vorbereitet", kennzeichen: "TEST-71", speditionId: null, updatedBy: null };
  let shipment: Record<string, any> = { ...initial };
  let updates: Record<string, any>[] = [];
  let conflict = false;
  let whereSql = "";
  const matrix = [
    { role: "comet_lager", permission: "shipment.print", allowed: true },
    { role: "comet_lager", permission: "shipment.advance", allowed: true },
    { role: "custom_internal", permission: "shipment.advance", allowed: true },
    { role: "custom_editor", permission: "shipment.edit", allowed: true },
    { role: "speditions_admin", permission: "shipment.print", allowed: true },
    { role: "speditions_admin", permission: "shipment.advance", allowed: true },
  ];
  t.mock.method(db, "execute", async () => ({ rows: matrix }));
  t.mock.method(db, "select", () => ({
    from: (table: unknown) => table === shipmentsTable
      ? { where: () => ({ limit: async () => [{ ...shipment }] }) }
      : table === speditionPermissionsTable ? { where: async () => [] } : Promise.resolve([]),
  }) as any);
  t.mock.method(db, "update", () => ({
    set: (input: Record<string, any>) => ({
      where: (where: any) => {
        whereSql = new PgDialect().sqlToQuery(where).sql;
        return { returning: async () => {
          if (conflict) return [];
          updates.push(input);
          shipment = { ...shipment, ...input };
          return [{ ...shipment }];
        } };
      },
    }),
  }) as any);
  t.mock.method(db, "insert", () => ({ values: async () => [] }) as any);
  t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }) as any);
  invalidatePermissionsCache();
  t.after(() => invalidatePermissionsCache());

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: 1, role: req.get("x-test-role") ?? "comet_lager" } as any;
    req.log = { error() {} } as any;
    next();
  });
  app.use("/api", shipmentsRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/shipments/71`;
  const request = (path: string, role = "comet_lager", body?: unknown) =>
    fetch(base + path, {
      method: path === "/deckblatt" ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "x-test-role": role },
      ...(body === undefined || path === "/deckblatt" ? {} : { body: JSON.stringify(body) }),
    });

  await t.test("denied roles cannot read print data, mark printed or advance", async () => {
    for (const path of ["/deckblatt", "/printed", "/advance-status"]) {
      const response = await request(path, "comet_viewer", path === "/advance-status" ? { expectedStatus: "Angemeldet" } : undefined);
      assert.equal(response.status, 403);
    }
    assert.equal(updates.length, 0);
  });
  await t.test("spedition roles remain excluded even if their action permissions are enabled", async () => {
    for (const path of ["/deckblatt", "/printed", "/advance-status"]) {
      assert.equal((await request(path, "speditions_admin", { expectedStatus: "Angemeldet" })).status, 403);
    }
    assert.equal(updates.length, 0);
  });
  await t.test("printing permission works without general edit and cannot change unrelated fields", async () => {
    const data = await request("/deckblatt");
    assert.equal(data.status, 200);
    assert.equal(((await data.json()) as { kennzeichen: string }).kennzeichen, "TEST-71");
    const printed = await request("/printed", "comet_lager", { status: "Abgefertigt", kennzeichen: "WRONG" });
    assert.equal(printed.status, 200);
    assert.equal(shipment.wareStatus, "ausgedruckt");
    assert.equal(shipment.status, "Angemeldet");
    assert.equal(shipment.kennzeichen, "TEST-71");
  });
  await t.test("advance only permits the exact requested chain, ignoring client-supplied targets", async () => {
    for (const [before, after] of [["Angemeldet", "Angekommen"], ["Angekommen", "in Verladung"], ["in Verladung", "Verladen"]]) {
      const previousAta = { ataDate: shipment.ataDate, ataTime: shipment.ataTime };
      const response = await request("/advance-status", "comet_lager", { expectedStatus: before, status: "Abgefertigt", kennzeichen: "WRONG" });
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { status: string }).status, after);
      assert.equal(shipment.kennzeichen, "TEST-71");
      assert.equal(shipment.gesperrtFuerSpedition, true);
      assert.ok(shipment.statusChangedAt instanceof Date);
      if (before === "Angemeldet") {
        const expected = shipmentArrivalFields(shipment.statusChangedAt);
        assert.equal(shipment.ataDate, expected.ataDate);
        assert.equal(shipment.ataTime, expected.ataTime);
        assert.equal(updates.at(-1)?.ataDate, expected.ataDate, "ATA is saved in the same atomic update as arrival status");
      } else {
        assert.deepEqual({ ataDate: shipment.ataDate, ataTime: shipment.ataTime }, previousAta, "later steps retain the original arrival time");
        assert.equal(Object.hasOwn(updates.at(-1)!, "ataDate"), false);
        assert.equal(Object.hasOwn(updates.at(-1)!, "ataTime"), false);
      }
      assert.match(whereSql, /"status"/, "UPDATE must include a status compare-and-set condition");
    }
    const count = updates.length;
    assert.equal((await request("/advance-status", "comet_lager", { expectedStatus: "in Verladung" })).status, 409);
    assert.equal(updates.length, count);
  });
  await t.test("stale and malformed requests cannot advance or skip a step", async () => {
    shipment = { ...initial, status: "Angekommen" };
    const count = updates.length;
    assert.equal((await request("/advance-status", "comet_lager", { expectedStatus: "Angemeldet" })).status, 409);
    assert.equal((await request("/advance-status", "comet_lager", {})).status, 400);
    assert.equal((await request("/advance-status", "comet_lager", { expectedStatus: "Abgefertigt" })).status, 400);
    assert.equal(updates.length, count);
  });
  await t.test("concurrent write conflicts return 409 rather than reporting success", async () => {
    conflict = true;
    const count = updates.length;
    assert.equal((await request("/advance-status", "comet_lager", { expectedStatus: "Angekommen" })).status, 409);
    assert.equal(updates.length, count);
    conflict = false;
  });
  await t.test("custom internal roles can advance without print or edit permission", async () => {
    shipment = { ...initial };
    assert.equal((await request("/deckblatt", "custom_internal")).status, 403);
    assert.equal((await request("/advance-status", "custom_internal", { expectedStatus: "Angemeldet" })).status, 200);
    assert.equal(shipment.status, "Angekommen");
  });
  await t.test("carrier reassignment requires edit permission and refreshes old and new carrier rooms", async () => {
    shipment = { ...initial, speditionId: 10 };
    const events: { room: string; event: string }[] = [];
    app.set("io", { to: (room: string) => ({ emit: (event: string) => events.push({ room, event }) }) });
    const patch = (role: string) => fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-role": role },
      body: JSON.stringify({ speditionId: 20 }),
    });
    assert.equal((await patch("comet_viewer")).status, 403);
    assert.equal(shipment.speditionId, 10);
    assert.equal((await patch("custom_editor")).status, 200);
    assert.equal(shipment.speditionId, 20);
    assert.ok(events.some(e => e.room === "spedition:10" && e.event === "shipment.updated"));
    assert.ok(events.some(e => e.room === "spedition:20" && e.event === "shipment.updated"));
  });
});
