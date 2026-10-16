import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  createMaintenanceGate,
  isMaintenanceExempt,
  parseMaintenanceSettings,
  validateMaintenanceSettings,
} from "./maintenance-mode";

const route = (method: string, path: string) => ({ method, path }) as Request;

test("maintenance defaults off and configured state survives serialization", () => {
  assert.deepEqual(parseMaintenanceSettings(undefined), { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE });
  assert.deepEqual(parseMaintenanceSettings(JSON.stringify({ enabled: true, message: "Geplante Wartung" })), { enabled: true, message: "Geplante Wartung" });
  assert.deepEqual(validateMaintenanceSettings(JSON.stringify({ enabled: false, message: "Hinweis" })).config, { enabled: false, message: "Hinweis" });
});

test("malformed settings fail closed and invalid edits are rejected", () => {
  assert.equal(parseMaintenanceSettings("{broken").enabled, true);
  for (const value of [null, "", "{}", '{"enabled":"true","message":"x"}', JSON.stringify({ enabled: true, message: " " }), JSON.stringify({ enabled: false, message: "x".repeat(1001) })]) {
    assert.ok(validateMaintenanceSettings(value).error);
  }
});

test("admins retain access while ordinary app APIs are blocked", () => {
  assert.equal(isMaintenanceExempt(route("GET", "/shipments")), false);
  assert.equal(isMaintenanceExempt(route("GET", "/settings")), false);
  assert.equal(isMaintenanceExempt(route("POST", "/shipments")), false);
  assert.equal(isMaintenanceExempt(route("GET", "/maintenance/status")), true);
});

test("login, logout, password recovery and health remain available", () => {
  for (const [method, path] of [
    ["GET", "/healthz"], ["GET", "/settings/public"], ["POST", "/auth/login"],
    ["POST", "/auth/logout"], ["GET", "/auth/me"], ["POST", "/auth/forgot-password"],
    ["POST", "/auth/reset-password"], ["POST", "/auth/change-password"],
  ]) assert.equal(isMaintenanceExempt(route(method, path)), true, `${method} ${path}`);
});

test("public scanning and pre-authorized time-clock terminal operations remain usable", () => {
  for (const [method, path] of [
    ["GET", "/scanner/find-shipment"], ["PATCH", "/scanner/shipment/123"],
    ["GET", "/lkw-arten"], ["POST", "/scanner/gefahrgut"],
    ["POST", "/scanner/wareneingang"], ["POST", "/scanner/fotos"],
    ["GET", "/einlagerung/scanner/state"], ["POST", "/einlagerung/scanner/records/regel"],
    ["PUT", "/einlagerung/scanner/records/regel/123"], ["GET", "/einlagerung/scanner/search"],
    ["POST", "/einlagerung/scanner/shelves/2/status"], ["POST", "/storage/uploads/request-url"],
    ["PUT", "/storage/local-uploads/test-object"], ["GET", "/stempeluhr/terminal/status"],
    ["POST", "/stempeluhr/terminal/stamp"], ["POST", "/stempeluhr/terminal/lock"],
  ]) assert.equal(isMaintenanceExempt(route(method, path)), true, `${method} ${path}`);
});

test("preflight requests are not blocked and administrative mutations are not scanner exemptions", () => {
  assert.equal(isMaintenanceExempt(route("OPTIONS", "/shipments")), true);
  assert.equal(isMaintenanceExempt(route("PUT", "/einlagerung/settings")), false);
  assert.equal(isMaintenanceExempt(route("PUT", "/einlagerung/scanner/settings")), false);
  assert.equal(isMaintenanceExempt(route("PATCH", "/settings/123")), false);
  assert.equal(isMaintenanceExempt(route("POST", "/lkw-arten")), false);
  assert.equal(isMaintenanceExempt(route("POST", "/stempeluhr/employees")), false);
  assert.equal(isMaintenanceExempt(route("GET", "/storage/objects/private")), false);
});

test("the API gate blocks normal users, preserves administrators, and fails closed", async () => {
  const makeResponse = () => {
    const state: { status?: number; body?: unknown; continued: boolean } = { continued: false };
    const res = {
      status(code: number) { state.status = code; return this; },
      json(body: unknown) { state.body = body; return this; },
    };
    return { state, res };
  };
  const blocked = createMaintenanceGate(async () => ({ enabled: true, message: "Wartungsfenster" }));
  const normalReq = { ...route("GET", "/shipments"), session: { role: "comet_lager" }, log: { error() {} } } as unknown as Request;
  const normal = makeResponse();
  await blocked(normalReq, normal.res as any, () => { normal.state.continued = true; });
  assert.equal(normal.state.status, 503);
  assert.deepEqual(normal.state.body, { error: "Wartungsfenster", maintenance: true, message: "Wartungsfenster" });

  let readCount = 0;
  const adminReq = { ...route("GET", "/shipments"), session: { role: "comet_admin" }, log: { error() {} } } as unknown as Request;
  const admin = makeResponse();
  await createMaintenanceGate(async () => { readCount++; return { enabled: true, message: "Wartung" }; })(
    adminReq, admin.res as any, () => { admin.state.continued = true; },
  );
  assert.equal(admin.state.continued, true);
  assert.equal(readCount, 0);

  const unavailable = makeResponse();
  await createMaintenanceGate(async () => { throw new Error("DB unavailable"); })(
    normalReq, unavailable.res as any, () => { unavailable.state.continued = true; },
  );
  assert.equal(unavailable.state.status, 503);
  assert.equal((unavailable.state.body as any).maintenance, true);
});
