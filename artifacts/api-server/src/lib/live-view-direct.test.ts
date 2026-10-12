import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDirectCommand } from "./live-view-direct";
const base = { page: "/shipments", frameId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", target: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
test("Direkte Appaktionen übernehmen keine Selektoren, Scripts oder fremden Parameter", () => {
  for (const kind of ["click", "dblclick", "contextmenu"]) {
    assert.deepEqual(sanitizeDirectCommand({ ...base, kind, script: "evil", selector: "body" }), { ...base, kind });
  }
  const input = sanitizeDirectCommand({ ...base, kind: "input", value: "Test", start: 4 });
  assert.ok("value" in input);
  assert.equal(input.value, "Test");
  const key = sanitizeDirectCommand({ ...base, kind: "key", key: "Escape" });
  assert.ok("key" in key);
  assert.equal(key.key, "Escape");
});
test("Ungültige Eingaben, Ziele, Koordinaten und Tastenkürzel werden verworfen", () => {
  for (const command of [
    { ...base, kind: "eval" }, { ...base, kind: "click", target: "body" },
    { ...base, kind: "click", frameId: "" }, { ...base, kind: "input", value: "x".repeat(5001) },
    { ...base, kind: "input", value: "x", start: -1 },
    { ...base, kind: "key", key: "F12" }, { ...base, kind: "key", key: "Enter", shift: "true" },
    { ...base, kind: "wheel", deltaX: 0, deltaY: Infinity },
    { ...base, kind: "mouse", x: -1, y: 2 },
  ]) assert.throws(() => sanitizeDirectCommand(command));
});
