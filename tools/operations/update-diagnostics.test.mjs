import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { root } from "./common.mjs";
import { classifyLine, diagnosticFor, sanitizeUpdate } from "./update-diagnostics.mjs";

const secret = "secret-token-fixture postgresql://user:password@db/private DATABASE_URL=private";
const timestamp = "2026-10-08T12:00:00.000Z";
test("Nur bekannte pnpm-Marker werden klassifiziert; kein Freitext wird übernommen", () => {
  assert.equal(classifyLine(`\u2009ERR_PNPM_IGNORED_BUILDS ${secret}`), "ERR_PNPM_IGNORED_BUILDS");
  assert.equal(classifyLine(`\x1b[31mERR_PNPM_OUTDATED_LOCKFILE\x1b[0m ${secret}`), "ERR_PNPM_OUTDATED_LOCKFILE");
  for (const line of ["https://secret/ERR_PNPM_IGNORED_BUILDS", "token=ERR_PNPM_IGNORED_BUILDS",
    "ERR_PNPM_IGNORED_BUILDS_EXTRA private", "ERR_PNPM_UNRECOGNIZED private"]) assert.equal(classifyLine(line), null);
  assert.equal(diagnosticFor("ERR_PNPM_IGNORED_BUILDS", "backend").code, "UNKNOWN");
});
test("Öffentliche Projektion entfernt Geheimnisse auch aus alten oder manipulierten Statusdateien", () => {
  const stored = { jobId: "update-123-abcd1234", status: "failed", phase: "dependencies", message: secret,
    startedAt: timestamp, finishedAt: timestamp, rawLog: secret, env: { secret },
    diagnostic: { code: "ERR_PNPM_IGNORED_BUILDS", cause: secret, nextSteps: [secret], log: secret },
    events: [{ phase: "dependencies", message: secret, at: timestamp },
      { phase: secret, message: secret, at: timestamp }] };
  const safe = sanitizeUpdate(stored);
  assert.equal(safe.diagnostic.code, "ERR_PNPM_IGNORED_BUILDS");
  assert.equal(safe.events.length, 1);
  assert.ok(!JSON.stringify(safe).includes("secret-token-fixture"));
  assert.ok(!JSON.stringify(safe).includes("postgresql://"));
  assert.equal(sanitizeUpdate({ ...stored, diagnostic: { code: secret } }).diagnostic.code, "UNKNOWN");
  for (const status of ["done", "running", "queued", "unknown", "idle"]) {
    const clean = sanitizeUpdate({ ...stored, status });
    assert.equal(clean.diagnostic, null);
    assert.ok(!JSON.stringify(clean).includes("secret-token-fixture"));
  }
  assert.equal(sanitizeUpdate({ ...stored, recovery: "failed" }).recovery, "failed");
  assert.ok(sanitizeUpdate({ ...stored, recovery: "failed" }).message.includes("automatische Rückkehr fehlgeschlagen"));
});
test("Statusschreiber speichert nur Katalogtexte, übernimmt keine fremden Ereignisse und löscht alte Fehler bei Erfolg", async () => {
  const app = await fs.mkdtemp(path.join(os.tmpdir(), "comet-safe-status-"));
  const ops = path.join(app, ".comet-operations");
  const env = { ...process.env, COMET_APP_DIR: app };
  const state = (...args) => {
    const result = spawnSync(process.execPath, [path.join(root, "tools/operations/update-state.mjs"), ...args], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    await fs.mkdir(ops);
    await fs.writeFile(path.join(ops, "update.json"), JSON.stringify({ jobId: "update-fixture",
      startedAt: timestamp, events: [{ phase: "dependencies", message: secret, at: timestamp }] }));
    await fs.writeFile(path.join(ops, "update-diagnostic.json"), JSON.stringify({
      jobId: "different-job", phase: "dependencies", code: "ERR_PNPM_IGNORED_BUILDS", raw: secret }));
    state("failed", "update-fixture", "dependencies", secret, "failed");
    let stored = JSON.parse(await fs.readFile(path.join(ops, "update.json")));
    assert.equal(stored.diagnostic.code, "UNKNOWN"); // stale job never reused
    assert.equal(stored.recovery, "failed");
    assert.ok(!JSON.stringify(stored).includes("secret-token-fixture"));
    state("done", "update-fixture", "complete", secret);
    stored = JSON.parse(await fs.readFile(path.join(ops, "update.json")));
    assert.equal(stored.diagnostic, null);
    assert.equal(stored.recovery, null);
    assert.ok(!JSON.stringify(stored).includes("secret-token-fixture"));
  } finally { await fs.rm(app, { recursive: true, force: true }); }
});

test("API liefert ausschließlich sichere Felder; verlorener Prozess bleibt unbekannt", async () => {
  const app = await fs.mkdtemp(path.join(os.tmpdir(), "comet-safe-api-"));
  try {
    await fs.mkdir(path.join(app, ".comet-operations"));
    const file = path.join(app, ".comet-operations/update.json");
    const harness = path.join(app, "reader.mts");
    await fs.writeFile(harness, `import { readSystemOperations } from ${JSON.stringify(path.join(root, "artifacts/api-server/src/lib/system-operations.ts"))};
      console.log(JSON.stringify(await readSystemOperations()));`);
    const read = () => {
      const result = spawnSync(process.execPath, ["--import", path.join(root, "artifacts/api-server/node_modules/tsx/dist/loader.mjs"), harness],
        { env: { ...process.env, COMET_APP_DIR: app }, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!result.stdout.includes("secret-token-fixture"));
      return JSON.parse(result.stdout).update;
    };
    await fs.writeFile(file, JSON.stringify({ jobId: "update-fixture", status: "failed", phase: "dependencies", message: secret,
      startedAt: timestamp, finishedAt: timestamp, diagnostic: { code: "ERR_PNPM_OUTDATED_LOCKFILE", cause: secret, nextSteps: [secret] },
      events: [{ phase: "dependencies", at: timestamp, message: secret }], rawLog: secret }));
    assert.equal(read().diagnostic.code, "ERR_PNPM_OUTDATED_LOCKFILE");
    await fs.writeFile(file, JSON.stringify({ jobId: "update-fixture", status: "running", phase: "backend", message: secret,
      startedAt: timestamp, finishedAt: null, pid: 2147483647, events: [] }));
    assert.equal(read().status, "unknown");
    await fs.writeFile(file, "invalid-json");
    assert.equal(read().status, "unknown");
  } finally { await fs.rm(app, { recursive: true, force: true }); }
});

test("Klassifizierter Hintergrundschritt begrenzt Zeilen, erkennt geteilte Marker und ignoriert Erfolgsausgaben", async () => {
  const app = await fs.mkdtemp(path.join(os.tmpdir(), "comet-safe-command-"));
  try {
    await fs.mkdir(path.join(app, "bin"));
    const pnpm = path.join(app, "bin/pnpm");
    const run = async (source, expectedExit, expectedCode) => {
      await fs.writeFile(pnpm, `#!${process.execPath}\n${source}`, { mode: 0o700 });
      const result = spawnSync(process.execPath, [path.join(root, "tools/operations/update-command.mjs"),
        "update-fixture", "dependencies", "pnpm", "install", "--frozen-lockfile"], {
        env: { ...process.env, COMET_APP_DIR: app, PATH: `${path.join(app, "bin")}:${process.env.PATH}` },
        encoding: "utf8",
      });
      assert.equal(result.status, expectedExit, result.stderr);
      const file = await fs.readFile(path.join(app, ".comet-operations/update-diagnostic.json"), "utf8");
      assert.equal(JSON.parse(file).code, expectedCode);
      assert.ok(!file.includes("secret-token-fixture"));
      assert.deepEqual(Object.keys(JSON.parse(file)).sort(), ["code", "jobId", "phase"]);
    };
    await run(`process.stderr.write("ERR_PNPM_"); setTimeout(() => {
      process.stderr.write("IGNORED_BUILDS ${secret}"); process.exitCode=1; }, 20);`, 1, "ERR_PNPM_IGNORED_BUILDS");
    await run(`process.stderr.write("x".repeat(100000)+" ERR_PNPM_IGNORED_BUILDS ${secret}\\n");process.exitCode=1;`, 1, null);
    await run(`process.stderr.write("ERR_PNPM_IGNORED_BUILDS ${secret}\\n");`, 0, null);
  } finally { await fs.rm(app, { recursive: true, force: true }); }
});
