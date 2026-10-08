import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("worker bypasses HTML/version caches without intercepting assets, APIs or writes", () => {
  const handlers: Record<string, (event: any) => void> = {};
  const requests: any[] = [];
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    URL,
    self: { location: { origin: "https://app.test" }, addEventListener: (name: string, fn: any) => { handlers[name] = fn; } },
    fetch: (request: any, options: any) => { requests.push({ request, options }); return Promise.resolve({}); },
  });
  for (const [path, mode, method, intercepted] of [
    ["/dashboard", "navigate", "GET", true],
    ["/build-info.json?_=123", "cors", "GET", true],
    ["/assets/main-hash.js", "cors", "GET", false],
    ["/api/auth/me", "cors", "GET", false],
    ["/api/shipments", "cors", "POST", false],
    ["https://other.test/", "navigate", "GET", false],
  ] as const) {
    let handled = false;
    handlers.fetch({ request: { url: new URL(path, "https://app.test").href, mode, method }, respondWith: () => { handled = true; } });
    assert.equal(handled, intercepted, path);
  }
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.options.cache === "no-store"));
  assert.ok(handlers.push);
  assert.ok(handlers.notificationclick);
});
