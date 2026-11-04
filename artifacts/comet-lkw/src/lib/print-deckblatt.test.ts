import assert from "node:assert/strict";
import { test } from "node:test";
import QRCode from "qrcode";
import { printDeckblatt } from "./print-deckblatt";

test("deckblatt opens immediately and keeps the clicked shipment snapshot while QR generation waits", async (t) => {
  let html = "";
  let resolveQr!: (value: string) => void;
  const popup = { closed: false, close() {}, document: { title: "", write(value: string) { html = value; }, close() {} } };
  const open = t.mock.fn(() => popup);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  t.mock.method(QRCode, "toDataURL", (id: string) => {
    assert.equal(id, "41");
    assert.equal(open.mock.callCount(), 1, "popup opens before async QR work");
    return new Promise<string>((resolve) => { resolveQr = resolve; });
  });
  const shipment = { shipmentId: 41, kennzeichen: "TEST-41", bezeichnung: "Verladung 41", username: "Test" };
  const pending = printDeckblatt(shipment);
  assert.equal(open.mock.callCount(), 1);
  shipment.shipmentId = 42;
  shipment.kennzeichen = "OTHER-42";
  resolveQr("data:image/png;base64,QR41");
  assert.equal(await pending, true);
  assert.match(html, /TEST-41/);
  assert.doesNotMatch(html, /OTHER-42/);
  assert.match(html, /data:image\/png;base64,QR41/);
});

test("blocked popup does not generate a QR or report printing success", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalAlert = Object.getOwnPropertyDescriptor(globalThis, "alert");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => null } });
  Object.defineProperty(globalThis, "alert", { configurable: true, value: () => {} });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalAlert) Object.defineProperty(globalThis, "alert", originalAlert); else Reflect.deleteProperty(globalThis, "alert");
  });
  const qr = t.mock.method(QRCode, "toDataURL", () => { throw new Error("must not run"); });
  assert.equal(await printDeckblatt({ shipmentId: 42, username: "Test" }), false);
  assert.equal(qr.mock.callCount(), 0);
});

test("authorization failure closes the reserved popup without rendering a cover sheet", async (t) => {
  const write = t.mock.fn();
  const close = t.mock.fn();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    open: () => ({ closed: false, close, document: { title: "", write, close() {} } }),
  } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  });
  await assert.rejects(printDeckblatt({ shipmentId: 71, username: "Test" }, async () => { throw new Error("Keine Berechtigung"); }), /Keine Berechtigung/);
  assert.equal(close.mock.callCount(), 1);
  assert.equal(write.mock.callCount(), 0);
});
