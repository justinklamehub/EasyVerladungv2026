import test from "node:test";
import assert from "node:assert/strict";
import { startAppUpdates } from "./app-updates";

async function browser(run: (state: ReturnType<typeof mockBrowser>) => Promise<void>) {
  const names = ["document", "window", "navigator", "location", "history", "sessionStorage", "fetch"];
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const originalNow = Date.now;
  const state = mockBrowser();
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: state.globals[name as keyof typeof state.globals] });
  Date.now = () => state.now;
  try { await run(state); } finally {
    names.forEach((name, i) => originals[i] ? Object.defineProperty(globalThis, name, originals[i]!) : Reflect.deleteProperty(globalThis, name));
    Date.now = originalNow;
  }
}
function mockBrowser() {
  const docEvents: Record<string, () => void> = {};
  const winEvents: Record<string, () => void> = {};
  const elements: { children: any[]; onclick?: () => void; textContent: string; remove: () => void }[] = [];
  const stored = new Map<string, string>();
  const state = { now: 2000, latest: "A", failed: false, dialog: false, consent: false, replaced: [] as string[], elements, docEvents, winEvents, stored, globals: {} as any };
  const location = { href: "https://app.test/shipments?status=Offen#row", replace: (url: string) => { state.replaced.push(url); } };
  state.globals = {
    document: {
      visibilityState: "visible", activeElement: null,
      querySelector: () => state.dialog ? {} : null,
      addEventListener: (event: string, handler: () => void) => { docEvents[event] = handler; },
      createElement: () => {
        const el = { children: [] as any[], textContent: "", style: { cssText: "" }, setAttribute: () => {}, append(...children: any[]) { this.children.push(...children); }, remove() {} };
        elements.push(el); return el;
      },
      body: { append: () => {} },
    },
    window: { addEventListener: (event: string, handler: () => void) => { winEvents[event] = handler; }, confirm: () => state.consent },
    navigator: {},
    location,
    history: { state: {}, replaceState: (_state: unknown, _title: string, url: URL) => { location.href = String(url); } },
    sessionStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } },
    fetch: async () => { if (state.failed) throw new Error("offline"); return Response.json({ buildId: state.latest }); },
  };
  return state;
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("cold start automatically reloads a newer release before rendering the app", () => browser(async (s) => {
  s.latest = "B";
  assert.equal(await startAppUpdates("A", "/"), true);
  assert.equal(s.replaced.length, 1);
  assert.match(s.replaced[0], /status=Offen&__comet_build=B#row/);
}));
test("a matching build clears the reload marker without another navigation", () => browser(async (s) => {
  s.globals.location.href = "https://app.test/login?__comet_build=A";
  s.stored.set("comet:build-reload-target", "A");
  assert.equal(await startAppUpdates("A", "/"), false);
  assert.equal(s.replaced.length, 0);
  assert.equal(new URL(s.globals.location.href).searchParams.has("__comet_build"), false);
  assert.equal(s.stored.size, 0);
}));
test("a stale server does not create a reload loop", () => browser(async (s) => {
  s.latest = "B";
  s.globals.location.href = "https://app.test/shipments?status=Offen&__comet_build=B#row";
  s.stored.set("comet:build-reload-target", "B");
  assert.equal(await startAppUpdates("A", "/"), false);
  assert.equal(s.replaced.length, 0);
  assert.ok(s.elements.some((el) => el.textContent.includes("Server liefert")));
}));
test("resume checks automatically refresh an untouched app", () => browser(async (s) => {
  await startAppUpdates("A", "/");
  s.latest = "B"; s.now += 2000;
  s.docEvents.visibilitychange();
  await settle();
  assert.equal(s.replaced.length, 1);
}));
test("resume preserves edited input and requires confirmation before manual reload", () => browser(async (s) => {
  await startAppUpdates("A", "/");
  s.docEvents.input();
  s.latest = "B"; s.now += 2000;
  s.winEvents.online();
  await settle();
  assert.equal(s.replaced.length, 0);
  const button = s.elements.find((el) => el.textContent === "Jetzt aktualisieren")!;
  assert.ok(button);
  button.onclick?.();
  assert.equal(s.replaced.length, 0);
  s.consent = true; button.onclick?.();
  assert.equal(s.replaced.length, 1);
}));
test("open dialogs defer resume reloads even before any input event", () => browser(async (s) => {
  await startAppUpdates("A", "/");
  s.dialog = true; s.latest = "B"; s.now += 2000;
  s.winEvents.pageshow();
  await settle();
  assert.equal(s.replaced.length, 0);
  assert.ok(s.elements.some((el) => el.textContent === "Jetzt aktualisieren"));
}));
test("development bypasses release checks; offline startup keeps the app usable", () => browser(async (s) => {
  s.failed = true;
  assert.equal(await startAppUpdates("development", "/"), false);
  assert.equal(Object.keys(s.docEvents).length, 0);
  assert.equal(await startAppUpdates("A", "/"), false);
  assert.equal(s.replaced.length, 0);
}));
