import assert from "node:assert/strict";
import { test } from "node:test";
import { describeUpdateStartError } from "./update-start-error";

test("origin and permission rejections are distinguished from lost acknowledgements", () => {
  const origin = describeUpdateStartError({ status: 403, data: { error: "Update nur aus der konfigurierten App-Herkunft starten." } });
  assert.equal(origin.kind, "rejected");
  assert.match(origin.message, /COMET_PUBLIC_URL/);
  const rights = describeUpdateStartError({ status: 403, data: { error: "System-Anzeige- und Update-Recht erforderlich." } });
  assert.equal(rights.kind, "rejected");
  assert.match(rights.message, /Rechte/);
});

test("lock conflicts explain why a historical done status does not unblock the lock", () => {
  const result = describeUpdateStartError({ status: 409 });
  assert.equal(result.kind, "rejected");
  assert.match(result.message, /Sperre/);
  assert.match(result.message, /nicht löschen/);
});

test("known configuration errors are safely shown", () => {
  const result = describeUpdateStartError({ status: 503, data: { error: "Für den sicheren Updater wird Node.js 22 oder neuer benötigt." } });
  assert.equal(result.kind, "rejected");
  assert.match(result.message, /Node.js 22/);
  assert.equal(describeUpdateStartError({ status: 401 }).kind, "rejected");
});

test("untrusted messages and network or gateway failures never imply failure or leak bodies", () => {
  for (const error of [
    new TypeError("secret-fixture"),
    { status: 503, data: { error: "secret-fixture" } },
    { status: 403, data: { error: "Update nur aus der konfigurierten App-Herkunft starten. secret-fixture" } },
    { status: 502, data: "secret-fixture" },
    { status: 500, message: "secret-fixture" },
    null,
  ]) {
    const result = describeUpdateStartError(error);
    assert.equal(result.kind, "unknown");
    assert.match(result.message, /alter abgeschlossener Auftrag/);
    assert.doesNotMatch(result.message, /secret-fixture/);
  }
});
