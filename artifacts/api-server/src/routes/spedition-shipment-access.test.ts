import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, pool, shipmentsTable, speditionenTable, speditionPermissionsTable, lkwArtenTable } from "@workspace/db";
import { invalidatePermissionsCache } from "../lib/permissions";
import { isLkwArtAllowed } from "../lib/spedition-lkw-arten";
import shipmentsRouter from "./shipments";
import speditionenRouter from "./speditionen";
import lkwArtenRouter from "./lkw-arten";

test("truck type restrictions distinguish all, none, and intersection", () => {
  assert.equal(isLkwArtAllowed(1, [null, null]), true);
  assert.equal(isLkwArtAllowed(1, [[]]), false);
  assert.equal(isLkwArtAllowed(1, [[1, 2], [2]]), false);
  assert.equal(isLkwArtAllowed(2, [[1, 2], [2]]), true);
});

// Every database entry point is mocked. These requests never touch business data.
test("carrier selection and truck type restrictions are enforced over HTTP", async (t) => {
  const carriers = [
    { id: 1, name: "Own", allowed: [1, 2] as number[] | null, dailyShipmentLimit: null as number | null },
    { id: 2, name: "Edit", allowed: [2] as number[] | null, dailyShipmentLimit: null as number | null },
    { id: 3, name: "Read", allowed: null, dailyShipmentLimit: null },
    { id: 4, name: "Pending", allowed: null, dailyShipmentLimit: null },
    { id: 5, name: "Reverse", allowed: null, dailyShipmentLimit: null },
  ];
  let grants = [
    { grantingSpeditionId: 2, receivingSpeditionId: 1, permissionLevel: "edit" },
    { grantingSpeditionId: 3, receivingSpeditionId: 1, permissionLevel: "view" },
    { grantingSpeditionId: 4, receivingSpeditionId: 1, permissionLevel: "pending" },
    { grantingSpeditionId: 1, receivingSpeditionId: 5, permissionLevel: "edit" },
  ];
  const types = [
    { id: 1, name: "Abholung", aktiv: true, sortOrder: 0 },
    { id: 2, name: "Anlieferung", aktiv: true, sortOrder: 1 },
    { id: 3, name: "Gesperrt", aktiv: true, sortOrder: 2 },
    { id: 4, name: "Inaktiv", aktiv: false, sortOrder: 3 },
  ];
  let inserted: Record<string, any>[] = [];
  let updated: Record<string, any>[] = [];
  const existing: Record<string, any> = { id: 71, speditionId: 2, lkwArt: "Historisch", status: "Angemeldet", wareStatus: "nicht bereit", etaDate: "2026-11-09", etaTime: "08:00", kennzeichen: "ALT", subSpedition: "Alt" };
  const dialect = new PgDialect();
  t.mock.method(db, "execute", async () => ({ rows: [
    { role: "speditions_bearbeiter", permission: "shipment.create", allowed: true },
    { role: "speditions_bearbeiter", permission: "shipment.edit", allowed: true },
    { role: "speditions_bearbeiter", permission: "shipment.reschedule", allowed: true },
    { role: "comet_admin", permission: "shipment.create", allowed: true },
    { role: "comet_admin", permission: "shipment.edit", allowed: true },
  ] }));
  t.mock.method(db, "select", (fields?: any) => ({
    from: (table: unknown) => {
      const rowsFor = (params?: any[]) => {
        if (table === speditionenTable) return carriers.filter((c) => !params || params.includes(c.id));
        if (table === speditionPermissionsTable) return grants.filter((g) => !params || params.includes(g.receivingSpeditionId));
        if (table === lkwArtenTable) return types;
        if (table === shipmentsTable) return fields?.count ? [{ count: 0 }] : [existing];
        return [];
      };
      const result = Promise.resolve(rowsFor());
      return Object.assign(result, {
        where: (where: any) => {
          const rows = rowsFor(dialect.sqlToQuery(where).params);
          return Object.assign(Promise.resolve(rows), { limit: async () => rows.slice(0, 1) });
        },
        orderBy: async () => rowsFor(),
      });
    },
  }) as any);
  t.mock.method(db, "insert", (table: unknown) => ({
    values: (input: any) => ({ returning: async () => {
      if (table !== shipmentsTable) return [];
      const rows = (Array.isArray(input) ? input : [input]).map((row: any, i: number) => ({ id: 100 + i, ...row }));
      inserted.push(...rows);
      return rows;
    } }),
  }) as any);
  t.mock.method(db, "update", (table: unknown) => ({
    set: (input: any) => ({ where: () => ({ returning: async () => {
      if (table === speditionenTable) {
        if (input.allowedLkwArtIds !== undefined) carriers[0].allowed = input.allowedLkwArtIds;
        return [{ ...carriers[0], allowedLkwArtIds: carriers[0].allowed }];
      }
      updated.push(input);
      return [{ ...existing, ...input }];
    } }) }),
  }) as any);
  t.mock.method(pool, "query", async (query: string) => ({
    rows: query.startsWith("SELECT * FROM speditionen") ? carriers.map((c) => ({ ...c, allowed_lkw_art_ids: c.allowed })) : [],
    rowCount: 0,
  }) as any);
  invalidatePermissionsCache();
  t.after(() => invalidatePermissionsCache());
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: 900, role: req.get("x-role") ?? "speditions_bearbeiter", speditionId: req.get("x-no-carrier") ? null : 1 } as any;
    req.log = { error() {} } as any;
    next();
  });
  app.use("/api", shipmentsRouter, speditionenRouter, lkwArtenRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = (path: string, body?: any, role?: string, method = body ? "POST" : "GET", noCarrier = false) =>
    fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method, headers: { "Content-Type": "application/json", ...(role ? { "x-role": role } : {}), ...(noCarrier ? { "x-no-carrier": "1" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  await t.test("list marks only own and received edit grants as creatable", async () => {
    const response = await request("/speditionen");
    assert.equal(response.status, 200);
    const rows = await response.json() as any[];
    assert.deepEqual(rows.filter((row) => row.canCreateShipment).map((row) => row.id), [1, 2]);
    assert.deepEqual(rows[1].allowedLkwArtIds, [2]);
  });
  await t.test("own and granted creation preserve chosen carrier", async () => {
    for (const speditionId of [undefined, 1, 2]) {
      const response = await request("/shipments", { speditionId, lkwArt: "Anlieferung" });
      assert.equal(response.status, 201);
      assert.equal((await response.json() as any).speditionId, speditionId ?? 1);
    }
  });
  await t.test("view, pending, reverse, unknown and revoked grants cannot create", async () => {
    const count = inserted.length;
    for (const speditionId of [3, 4, 5, 999]) {
      assert.equal((await request("/shipments", { speditionId, lkwArt: "Anlieferung" })).status, 403);
    }
    const previous = grants;
    grants = grants.filter((g) => g.grantingSpeditionId !== 2);
    assert.equal((await request("/shipments", { speditionId: 2, lkwArt: "Anlieferung" })).status, 403);
    grants = previous;
    assert.equal(inserted.length, count);
  });
  await t.test("type list and writes enforce actor and target restrictions", async () => {
    assert.deepEqual((await (await request("/lkw-arten")).json() as any[]).map((row) => row.id), [1, 2]);
    const count = inserted.length;
    for (const lkwArt of ["Abholung", "Gesperrt", "Inaktiv", "Unknown", ""]) {
      assert.equal((await request("/shipments", { speditionId: 2, lkwArt })).status, 403);
    }
    assert.equal(inserted.length, count);
    const original = carriers[0].allowed;
    carriers[0].allowed = [];
    assert.deepEqual(await (await request("/lkw-arten")).json(), []);
    assert.equal((await request("/shipments", { speditionId: 2, lkwArt: "Anlieferung" })).status, 403);
    carriers[0].allowed = null;
    assert.equal((await request("/shipments", { lkwArt: "Gesperrt" })).status, 201);
    assert.equal((await request("/shipments", { lkwArt: "Inaktiv" })).status, 403);
    carriers[0].allowed = original;
  });
  await t.test("bulk validates all carriers and types before any insert", async () => {
    const count = inserted.length;
    for (const bad of [{ speditionId: 3, lkwArt: "Anlieferung" }, { speditionId: 2, lkwArt: "Abholung" }]) {
      assert.equal((await request("/shipments/bulk", { shipments: [{ lkwArt: "Abholung" }, bad] })).status, 403);
    }
    assert.equal(inserted.length, count);
    assert.equal((await request("/shipments/bulk", { shipments: [{ lkwArt: "Abholung" }, { speditionId: 2, lkwArt: "Anlieferung" }] })).status, 201);
    assert.deepEqual(inserted.slice(-2).map((row) => row.speditionId), [1, 2]);
  });
  await t.test("daily limits are checked separately for each bulk target", async () => {
    carriers[1].dailyShipmentLimit = 1;
    const count = inserted.length;
    assert.equal((await request("/shipments/bulk", { shipments: [
      { lkwArt: "Abholung" },
      { speditionId: 2, lkwArt: "Anlieferung" },
      { speditionId: 2, lkwArt: "Anlieferung" },
    ] })).status, 429);
    assert.equal(inserted.length, count);
    carriers[1].dailyShipmentLimit = null;
  });
  await t.test("carrier can change only time, plate and subcarrier despite all former locks", async () => {
    for (const state of [
      { gesperrtFuerSpedition: false, wareStatus: "nicht bereit", ataDate: null },
      { gesperrtFuerSpedition: true, wareStatus: "nicht bereit", ataDate: null },
      { gesperrtFuerSpedition: false, wareStatus: "ausgedruckt", ataDate: null },
      { gesperrtFuerSpedition: false, wareStatus: "nicht bereit", ataDate: "2026-11-09" },
      { gesperrtFuerSpedition: true, wareStatus: "ausgedruckt", ataDate: "2026-11-09" },
    ]) {
      Object.assign(existing, state);
      const body = { etaTime: "15:45", kennzeichen: "NEU-123", subSpedition: "Neu" };
      const response = await request("/shipments/71", body, undefined, "PATCH");
      assert.equal(response.status, 200);
      const result = await response.json() as any;
      assert.equal(result.etaDate, existing.etaDate);
      for (const [field, value] of Object.entries(body)) assert.equal(result[field], value);
      assert.equal(result.gesperrtFuerSpedition, state.gesperrtFuerSpedition);
      assert.equal(result.wareStatus, state.wareStatus);
      assert.equal(result.ataDate, state.ataDate);
      assert.equal(result.lkwArt, "Historisch");
      assert.deepEqual(Object.keys(updated.at(-1)!).sort(),
        ["etaTime", "kennzeichen", "subSpedition", "updatedAt", "updatedBy"].sort());
    }
  });
  await t.test("forbidden fields reject the entire request without partial saves", async () => {
    const count = updated.length;
    for (const [field, value] of Object.entries({
      etaDate: "2027-01-01", lkwArt: "Anlieferung", status: "Verladen", wareStatus: "vorbereitet",
      ataDate: null, ataTime: "17:00", relation: "Neu", bemerkungen: "Neu", telefon: "123",
      bezeichnung: "Neu", tor: "Tor 1", speditionId: 1, gesperrtFuerSpedition: false,
    })) {
      assert.equal((await request("/shipments/71", { kennzeichen: "NICHT SPEICHERN", [field]: value }, undefined, "PATCH")).status, 403, field);
    }
    assert.equal(updated.length, count);
  });
  await t.test("own and edit-granted carriers work; read-only, revoked and missing edit rights still deny changes", async () => {
    for (const target of [1, 2]) {
      existing.speditionId = target;
      assert.equal((await request("/shipments/71", { kennzeichen: "OK" }, undefined, "PATCH")).status, 200);
    }
    const count = updated.length;
    for (const target of [3, 4, 5, 999]) {
      existing.speditionId = target;
      assert.equal((await request("/shipments/71", { kennzeichen: "Nein" }, undefined, "PATCH")).status, 403);
    }
    existing.speditionId = 2;
    assert.equal((await request("/shipments/71", { kennzeichen: "Nein" }, "speditions_viewer", "PATCH")).status, 403);
    assert.equal((await request("/shipments/71", { kennzeichen: "Nein" }, undefined, "PATCH", true)).status, 403);
    const original = grants;
    grants = grants.filter(g => g.grantingSpeditionId !== 2);
    assert.equal((await request("/shipments/71", { kennzeichen: "Nein" }, undefined, "PATCH")).status, 403);
    grants = original;
    assert.equal(updated.length, count);
  });
  await t.test("transport fields support clearing and reject malformed values", async () => {
    assert.equal((await request("/shipments/71", { kennzeichen: null, etaTime: null, subSpedition: null }, undefined, "PATCH")).status, 200);
    assert.equal(updated.at(-1)!.subSpedition, null);
    const count = updated.length;
    for (const body of [{ etaTime: "25:00" }, { etaTime: "12:99" }, { kennzeichen: {} }, { subSpedition: 1 }]) {
      assert.equal((await request("/shipments/71", body, undefined, "PATCH")).status, 400);
    }
    assert.equal(updated.length, count);
  });
  await t.test("internal editors retain full field access", async () => {
    const response = await request("/shipments/71", { etaDate: "2027-01-01", lkwArt: "Anlieferung", bemerkungen: "COMET" }, "comet_admin", "PATCH");
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).etaDate, "2027-01-01");
  });
  await t.test("carrier cannot change the date through the weekly reschedule action either", async () => {
    const count = updated.length;
    assert.equal((await request("/shipments/71/reschedule", { newDate: "2027-01-01" }, undefined, "PATCH")).status, 403);
    assert.equal(updated.length, count);
  });
  await t.test("role permissions and missing carrier fail closed; COMET remains unrestricted", async () => {
    assert.equal((await request("/shipments", { lkwArt: "Abholung" }, "speditions_viewer")).status, 403);
    assert.equal((await request("/shipments", { lkwArt: "Abholung" }, undefined, "POST", true)).status, 403);
    assert.equal((await request("/shipments", { speditionId: 3, lkwArt: "Gesperrt" }, "comet_admin")).status, 201);
    assert.equal((await request("/speditionen/1", { allowedLkwArtIds: null }, undefined, "PATCH")).status, 403);
    assert.equal((await request("/speditionen/1", { allowedLkwArtIds: ["1"] }, "comet_admin", "PATCH")).status, 400);
  });
  await t.test("admin can persist all, none, and selected types; omissions preserve restrictions", async () => {
    for (const allowedLkwArtIds of [null, [], [2]]) {
      assert.equal((await request("/speditionen/1", { allowedLkwArtIds }, "comet_admin", "PATCH")).status, 200);
      const rows = await (await request("/speditionen")).json() as any[];
      assert.deepEqual(rows[0].allowedLkwArtIds, allowedLkwArtIds);
    }
    assert.equal((await request("/speditionen/1", { bemerkungen: "unchanged rule" }, "comet_admin", "PATCH")).status, 200);
    assert.deepEqual(carriers[0].allowed, [2]);
    for (const allowedLkwArtIds of [[-1], [1.5], "all", {}]) {
      assert.equal((await request("/speditionen/1", { allowedLkwArtIds }, "comet_admin", "PATCH")).status, 400);
    }
  });
});
