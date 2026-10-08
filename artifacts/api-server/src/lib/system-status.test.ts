import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkFrontend, checkLocalStorage, createSystemStatusReader } from "./system-status";

test("Frontend: fehlender Build, Quelldatei und fehlendes Asset werden erkannt", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comet-status-"));
  try {
    assert.equal((await checkFrontend(dir)).status, "error");
    await fs.writeFile(path.join(dir, "index.html"), '<div id="root"></div><script src="/src/main.tsx"></script>');
    assert.equal((await checkFrontend(dir)).status, "error");
    await fs.writeFile(path.join(dir, "index.html"), '<div id="root"></div><script src="/assets/app.js"></script>');
    assert.equal((await checkFrontend(dir)).status, "error");
    await fs.mkdir(path.join(dir, "assets"));
    await fs.writeFile(path.join(dir, "assets/app.js"), "console.log('ok')");
    const before = await fs.readFile(path.join(dir, "index.html"), "utf8");
    assert.equal((await checkFrontend(dir)).status, "ok");
    assert.equal(await fs.readFile(path.join(dir, "index.html"), "utf8"), before);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test("Lokaler Speicher: Prüfen erzeugt keinen Uploadordner und verändert keine Bilder", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comet-storage-status-"));
  try {
    assert.equal((await checkLocalStorage(dir)).status, "warning");
    assert.deepEqual(await fs.readdir(dir), []);
    await fs.mkdir(path.join(dir, "uploads"));
    await fs.writeFile(path.join(dir, "uploads/image.jpg"), "fixture");
    assert.equal((await checkLocalStorage(dir)).status, "ok");
    assert.equal(await fs.readFile(path.join(dir, "uploads/image.jpg"), "utf8"), "fixture");
    assert.equal((await checkLocalStorage(path.join(dir, "missing"))).status, "error");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test("Abhängigkeiten: Fehler werden sichtbar und Details enthalten keine Ausnahme-Zugangsdaten", async () => {
  const read = createSystemStatusReader({
    frontendDirectory: "/missing-fixture", environment: "production",
    database: async () => { throw new Error("postgres://user:secret@host"); },
    storage: async () => ({ status: "warning", message: "Nicht geprüft", details: [] }),
  });
  const report = await read();
  assert.equal(report.overall, "error");
  assert.equal(report.checks.length, 4);
  assert.equal(report.checks.find((c) => c.id === "database")!.status, "error");
  assert.ok(!JSON.stringify(report).includes("secret"));
});
test("Timeout und parallele Aufrufe starten keine Flut hängender Abfragen", async () => {
  let databaseCalls = 0;
  const read = createSystemStatusReader({
    frontendDirectory: "/missing-fixture", environment: "development", timeoutMs: 15, cacheMs: 0,
    database: () => { databaseCalls++; return new Promise(() => {}); },
    storage: async () => ({ status: "ok", message: "Erreichbar", details: [] }),
  });
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(databaseCalls, 1);
  assert.equal(a, b);
  assert.match(a.checks.find((c) => c.id === "database")!.message, /rechtzeitig/);
  await read();
  assert.equal(databaseCalls, 1);
});
