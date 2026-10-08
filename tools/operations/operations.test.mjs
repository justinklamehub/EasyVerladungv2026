import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { root, run, requireDb, postgresBinaries } from "./common.mjs";
import { validateFrontend } from "./validate-frontend.mjs";

async function write(file, content, executable = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, { mode: executable ? 0o755 : 0o600 });
}
test("Frontendprüfung lehnt fehlende und leere Assets ab", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comet-assets-"));
  try {
    await write(path.join(dir, "index.html"), '<div id="root"></div><script src="/assets/app.js"></script>');
    await assert.rejects(validateFrontend(dir));
    await write(path.join(dir, "assets/app.js"), "");
    await assert.rejects(validateFrontend(dir));
    await write(path.join(dir, "assets/app.js"), "console.log('ready')");
    await validateFrontend(dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("Verifikationsfehler entfernt einen alten grünen Nachweis", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comet-proof-invalidate-"));
  try {
    await write(path.join(dir, ".comet-operations/backup.json"), JSON.stringify({ id: "fixture", verifiedAt: "old" }));
    await write(path.join(dir, "snapshot/manifest.json"), JSON.stringify({
      format: "comet-backup-v1", id: "fixture", database: { relative: "database.dump", sha256: "wrong" }, images: [],
    }));
    await write(path.join(dir, "snapshot/database.dump"), "corrupt");
    await assert.rejects(run("node", [path.join(root, "tools/operations/verify-backup.mjs"), path.join(dir, "snapshot")],
      { env: { ...process.env, COMET_APP_DIR: dir } }));
    const summary = JSON.parse(await fs.readFile(path.join(dir, ".comet-operations/backup.json")));
    assert.equal(summary.verifiedAt, null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

async function updateFixture(mode) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "comet-update-test-"));
  const app = path.join(base, "app");
  const bin = path.join(base, "bin");
  const template = path.join(base, "template");
  await fs.mkdir(template);
  await write(path.join(app, "update.sh"), await fs.readFile(path.join(root, "update.sh")));
  for (const file of ["common.mjs", "run-update.mjs", "update-state.mjs", "update-command.mjs", "update-diagnostics.mjs", "validate-frontend.mjs", "swap.py"]) {
    await write(path.join(app, "tools/operations", file), await fs.readFile(path.join(root, "tools/operations", file)));
  }
  await write(path.join(app, "tools/operations/backup.mjs"), 'if(process.env.TEST_MODE==="backup-fail")process.exit(1);');
  await write(path.join(app, "tools/operations/verify-backup.mjs"), 'if(process.argv[2]!=="--check-tools"&&process.env.TEST_MODE==="restore-fail")process.exit(1);');
  await write(path.join(app, "tools/operations/check-public-assets.mjs"), 'if(process.env.TEST_MODE==="delivery-fail")process.exit(1);');
  const oldHtml = '<div id="root"></div><script src="/assets/old.js"></script>';
  await write(path.join(app, "artifacts/api-server/.env"), "PORT=3333\nCOMET_PUBLIC_URL=http://fixture.invalid/\n");
  await write(path.join(app, "artifacts/api-server/dist/index.mjs"), 'export const version="old";');
  await write(path.join(app, "artifacts/comet-lkw/dist/public/index.html"), oldHtml);
  await write(path.join(app, "artifacts/comet-lkw/dist/public/assets/old.js"), "old chunk");
  const header = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';import{execFileSync}from'node:child_process';const a=process.argv.slice(2),app=process.env.COMET_APP_DIR,mode=process.env.TEST_MODE;\n`;
  await write(path.join(bin, "git"), header + `
    if(a[0]==="fetch"&&mode==="fetch-fail")process.exit(1);
    if(a[0]==="rev-parse")console.log("0123456789012345678901234567890123456789");
    if(a[0]==="archive")process.stdout.write(execFileSync("tar",["-cf","-","-C",process.env.TEST_TEMPLATE,"."]));
  `, true);
  await write(path.join(bin, "pnpm"), header + `
    const dir=a[a.indexOf("--dir")+1];
    const codes={"ignored-builds":"ERR_PNPM_IGNORED_BUILDS","outdated-lockfile":"ERR_PNPM_OUTDATED_LOCKFILE",
      "incompatible-lockfile":"ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE"};
    if(!a.includes("build")){
      if(codes[mode]){
        process.stderr.write("\\x1b[31m"+codes[mode]+"\\x1b[0m secret-token-fixture postgresql://user:password@db/private\\n");
        process.exit(1);
      }
      if(mode==="unknown-install"){console.error("DATABASE_URL=secret-token-fixture");process.exit(1);}
      process.exit(0);
    }
    const backend=a.includes("@workspace/api-server");
    if(!backend&&mode==="frontend-fail")process.exit(1);
    const out=path.join(dir,"artifacts",backend?"api-server/dist":"comet-lkw/dist/public");
    fs.mkdirSync(path.join(out,"assets"),{recursive:true});
    if(backend)fs.writeFileSync(path.join(out,"index.mjs"),'export const version="new";');
    else {fs.writeFileSync(path.join(out,"index.html"),'<div id="root"></div><script src="/assets/new.js"></script>');
      fs.writeFileSync(path.join(out,"assets/new.js"),'console.log("new")');}
  `, true);
  await write(path.join(bin, "pm2"), header + 'fs.appendFileSync(path.join(app,"pm2-calls"),a.join(" ")+"\\n");', true);
  await write(path.join(bin, "curl"), header + `
    if(a.includes("-o"))fs.copyFileSync(path.join(app,"artifacts/comet-lkw/dist/public/index.html"),a[a.indexOf("-o")+1]);
    else if(mode==="health-fail"&&fs.readFileSync(path.join(app,"artifacts/api-server/dist/index.mjs"),"utf8").includes('"new"'))process.exit(1);
  `, true);
  await write(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n", true);
  const result = spawnSync("bash", [path.join(app, "update.sh"), "fixture-job"], {
    env: { ...process.env, COMET_APP_DIR: app, COMET_ENV_LOADED: "0", COMET_UPDATE_LOCK_HELD: "0",
      TEST_MODE: mode, TEST_TEMPLATE: template, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8", timeout: 30000,
  });
  return { base, app, result, oldHtml };
}
for (const mode of ["ignored-builds", "outdated-lockfile", "incompatible-lockfile", "unknown-install", "fetch-fail", "frontend-fail", "backup-fail", "restore-fail", "health-fail", "delivery-fail", "success"]) {
  test(`Update isoliert: ${mode}`, async () => {
    const fixture = await updateFixture(mode);
    try {
      const { app, result, oldHtml } = fixture;
      const state = JSON.parse(await fs.readFile(path.join(app, ".comet-operations/update.json"), "utf8"));
      assert.equal(result.status, mode === "success" ? 0 : 1, `${result.stdout}\n${result.stderr}`);
      assert.equal(state.status, mode === "success" ? "done" : "failed");
      const codes = { "ignored-builds": "ERR_PNPM_IGNORED_BUILDS", "outdated-lockfile": "ERR_PNPM_OUTDATED_LOCKFILE",
        "incompatible-lockfile": "ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE" };
      assert.equal(state.diagnostic?.code ?? null, mode === "success" ? null : codes[mode] ?? "UNKNOWN");
      if (codes[mode] || mode === "unknown-install") assert.equal(state.phase, "dependencies");
      assert.ok(!JSON.stringify(state).includes("secret-token-fixture"));
      assert.ok(!JSON.stringify(state).includes("postgresql://"));
      const html = await fs.readFile(path.join(app, "artifacts/comet-lkw/dist/public/index.html"), "utf8");
      const backend = await fs.readFile(path.join(app, "artifacts/api-server/dist/index.mjs"), "utf8");
      if (mode === "success") {
        assert.ok(html.includes("new.js")); assert.ok(backend.includes('"new"'));
        assert.equal(await fs.readFile(path.join(app, "artifacts/comet-lkw/dist/public/assets/old.js"), "utf8"), "old chunk");
      } else { assert.equal(html, oldHtml); assert.ok(backend.includes('"old"')); }
      let calls = "";
      try { calls = await fs.readFile(path.join(app, "pm2-calls"), "utf8"); } catch {}
      if (["ignored-builds", "outdated-lockfile", "incompatible-lockfile", "unknown-install", "fetch-fail", "frontend-fail", "backup-fail", "restore-fail"].includes(mode)) assert.ok(!calls.includes("restart"));
      assert.ok(!calls.includes("stop") && !calls.includes("delete"));
    } finally { await fs.rm(fixture.base, { recursive: true, force: true }); }
  });
}

test("Hintergrundauftrag überlebt API-Aufrufer; paralleler Start erhält 409", async () => {
  const fixture = await updateFixture("success");
  try {
    const harness = path.join(fixture.base, "launcher.mts");
    await write(harness, `import {startSystemUpdate} from ${JSON.stringify(path.join(root, "artifacts/api-server/src/lib/system-operations.ts"))};
      const accepted=await startSystemUpdate(); const duplicate=await startSystemUpdate();
      console.log(JSON.stringify({accepted,duplicate}));`);
    const result = spawnSync(process.execPath, ["--import", path.join(root, "artifacts/api-server/node_modules/tsx/dist/loader.mjs"), harness], {
      env: { ...process.env, COMET_APP_DIR: fixture.app, NODE_ENV: "production", COMET_PUBLIC_URL: "http://fixture.invalid/",
        TEST_MODE: "success", TEST_TEMPLATE: path.join(fixture.base, "template"),
        PATH: `${path.join(fixture.base, "bin")}:${process.env.PATH}` },
      encoding: "utf8", timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.accepted.status, 202);
    assert.equal(report.duplicate.status, 409);
    // The API harness has exited; the orphaned worker must still finish.
    let done = false;
    for (let n = 0; n < 150; n++) {
      const state = JSON.parse(await fs.readFile(path.join(fixture.app, ".comet-operations/update.json")));
      if (state.jobId === report.accepted.jobId && state.status === "done") { done = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(done, "Background worker did not finish after caller exit");
  } finally { await fs.rm(fixture.base, { recursive: true, force: true }); }
});

test("Echte lokale Sicherung/Prüfrestore; beschädigtes Bild wird zurückgewiesen", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "comet-local-backup-test-"));
  const binaries = await postgresBinaries();
  const env = { PATH: process.env.PATH, HOME: base, LANG: "C.UTF-8" };
  let server, client;
  try {
    await run(path.join(binaries, "initdb"), ["-D", path.join(base, "pg"), "-A", "trust", "--no-locale", "--encoding=UTF8"], { env });
    server = spawn(path.join(binaries, "postgres"), ["-D", path.join(base, "pg"), "-k", base, "-c", "listen_addresses="], { env, stdio: "ignore" });
    const { Client } = requireDb("pg");
    for (let n = 0; n < 100; n++) {
      client = new Client({ host: base, user: os.userInfo().username, database: "postgres", ssl: false });
      try { await client.connect(); break; }
      catch { await client.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    const pictures = path.join(base, "source-images");
    await write(path.join(pictures, "uploads/photo.jpg"), "known image bytes");
    await client.query("CREATE TABLE settings (key text PRIMARY KEY,value text); CREATE TABLE sample (id int PRIMARY KEY); INSERT INTO sample VALUES (7)");
    await client.query("INSERT INTO settings VALUES ('storage_backend','local'),('storage_local_path',$1)", [pictures]);
    const source = `postgresql://${os.userInfo().username}@localhost/postgres?host=${encodeURIComponent(base)}`;
    const programEnv = { ...process.env, DATABASE_URL: source, COMET_APP_DIR: base };
    const folder = path.join(base, "snapshot");
    await run("node", [path.join(root, "tools/operations/backup.mjs"), folder], { env: programEnv });
    await run("node", [path.join(root, "tools/operations/verify-backup.mjs"), folder], { env: programEnv });
    const proof = JSON.parse(await fs.readFile(path.join(folder, "verification.json")));
    assert.equal(proof.tableCount, 2); assert.equal(proof.imageCount, 1);
    assert.equal((await client.query("SELECT id FROM sample")).rows[0].id, 7);
    const manifest = JSON.parse(await fs.readFile(path.join(folder, "manifest.json")));
    await fs.writeFile(path.join(folder, manifest.images[0].relative), "corrupt");
    await assert.rejects(run("node", [path.join(root, "tools/operations/verify-backup.mjs"), folder], { env: programEnv }));
    assert.equal((await client.query("SELECT id FROM sample")).rows[0].id, 7);
    const alias = path.join(base, "image-alias");
    await fs.symlink(pictures, alias);
    await client.query("UPDATE settings SET value=$1 WHERE key='storage_local_path'", [alias]);
    await assert.rejects(run("node", [path.join(root, "tools/operations/backup.mjs"), path.join(pictures, "forbidden")], { env: programEnv }));
    await assert.rejects(fs.stat(path.join(pictures, "forbidden")));
  } finally {
    await client?.end().catch(() => {});
    if (server) { const stopped = once(server, "exit"); server.kill("SIGTERM"); await stopped; }
    await fs.rm(base, { recursive: true, force: true });
  }
});
