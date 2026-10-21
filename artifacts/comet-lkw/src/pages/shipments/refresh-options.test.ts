import test from "node:test";
import assert from "node:assert/strict";
import { shipmentRefreshOptions } from "./refresh-options";

test("Monitor gleicht ohne Eingaben oder Socket-Meldungen ab, auch ohne Fokus; Fokus und Netzrückkehr holen Daten nach", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  // QueryObserver normally disables browser intervals in Node.
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  const { QueryClient, QueryObserver, focusManager, onlineManager } = await import("@tanstack/react-query");
  focusManager.setEventListener(() => () => {});
  onlineManager.setEventListener(() => () => {});
  focusManager.setFocused(false);
  onlineManager.setOnline(true);
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  client.mount();
  let calls = 0;
  const key = ["/api/shipments", { dateFrom: "2026-10-21", status: "Angemeldet" }];
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => [{ id: 320, revision: ++calls }],
    ...shipmentRefreshOptions,
  });
  const unsubscribe = observer.subscribe(() => {});
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  try {
    await settle();
    assert.equal(calls, 1);
    t.mock.timers.tick(29_999);
    await settle();
    assert.equal(calls, 1);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(calls, 2, "Hintergrundabgleich braucht weder Fokus noch Eingabe noch Socket");
    assert.deepEqual(client.getQueryData(key), [{ id: 320, revision: 2 }]);
    t.mock.timers.tick(30_000);
    await settle();
    assert.equal(calls, 3, "Abgleich wiederholt sich während längerer Inaktivität");
    focusManager.setFocused(true);
    await settle();
    assert.equal(calls, 4, "Die Übersicht überschreibt das global deaktivierte Fokus-Refetch");
    onlineManager.setOnline(false);
    t.mock.timers.tick(30_000);
    await settle();
    assert.equal(calls, 4, "Offline werden keine Anfragen erzwungen");
    assert.deepEqual(client.getQueryData(key), [{ id: 320, revision: 4 }], "Vorhandene Daten bleiben erhalten");
    onlineManager.setOnline(true);
    await settle();
    assert.equal(calls, 5, "Netzrückkehr lädt ohne Interaktion nach");
    unsubscribe();
    t.mock.timers.tick(30_000);
    await settle();
    assert.equal(calls, 5, "Nach Verlassen der Ansicht stoppt der zusätzliche Abgleich");
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
    t.mock.timers.reset();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
