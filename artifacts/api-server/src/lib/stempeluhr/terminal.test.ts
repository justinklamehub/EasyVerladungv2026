import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { PoolClient } from "@workspace/db";
import { UpdateClockSettingsBody } from "@workspace/api-zod";
import { DEFAULT_SETTINGS } from "./calculation";
import { activeTerminal, terminalCookieLifetime, terminalResult, renewUnlimitedCookie, TERMINAL_COOKIE } from "./terminal";

test("unlimited and locked terminal responses remain distinct", () => {
  assert.deepEqual(terminalResult({ id: 1, label: "Test", expires_at: null }), { unlocked: true, id: 1, label: "Test", expiresAt: null });
  assert.deepEqual(terminalResult(), { unlocked: false, id: null, label: null, expiresAt: null });
  assert.equal(terminalResult({ expires_at: new Date("2030-01-01T12:00:00Z") }).expiresAt, "2030-01-01T12:00:00.000Z");
});
test("settings accept null as unlimited and still reject out-of-range durations", () => {
  const input = { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  assert.equal(UpdateClockSettingsBody.parse({ ...input, terminalHours: null }).terminalHours, null);
  assert.equal(UpdateClockSettingsBody.parse(input).terminalHours, 12);
  for (const terminalHours of [0, -1, 169, "unlimited"]) assert.throws(() => UpdateClockSettingsBody.parse({ ...input, terminalHours }));
});
test("finite browser cookies retain their exact expiry; unlimited cookies are persistent", () => {
  const expiry = new Date("2030-01-01T12:00:00Z");
  assert.equal((terminalCookieLifetime(expiry) as { expires: Date }).expires.getTime(), expiry.getTime());
  assert.equal((terminalCookieLifetime(null) as { maxAge: number }).maxAge, 400 * 24 * 60 * 60 * 1000);
});
test("only authorized unlimited terminals renew a protected device cookie", () => {
  const calls: any[] = [];
  const req = { secure: false, get: (name: string) => name === "cookie" ? `${TERMINAL_COOKIE}=${"a".repeat(64)}` : undefined } as Request;
  const res = { cookie: (...args: any[]) => calls.push(args) } as unknown as Response;
  renewUnlimitedCookie(req, res);
  renewUnlimitedCookie(req, res, { expires_at: new Date() });
  assert.equal(calls.length, 0);
  renewUnlimitedCookie(req, res, { expires_at: null });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], TERMINAL_COOKIE);
  assert.equal(calls[0][2].httpOnly, true);
  assert.equal(calls[0][2].sameSite, "strict");
});
test("missing device credentials and inactive users remain blocked with unlimited expiry", async () => {
  const noCookie = { get: () => undefined } as unknown as Request;
  const mustNotQuery = { query: () => { throw new Error("Anonymous request must not query"); } } as unknown as PoolClient;
  assert.equal(await activeTerminal(mustNotQuery, noCookie), undefined);
  const req = { get: () => `${TERMINAL_COOKIE}=${"a".repeat(64)}` } as unknown as Request;
  const inactive = { query: async () => ({ rows: [{ is_active: false, role: "comet_admin", expires_at: null }] }) } as unknown as PoolClient;
  assert.equal(await activeTerminal(inactive, req), undefined);
});
