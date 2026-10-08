import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { app, assertUnprivileged, run } from "./common.mjs";

assertUnprivileged();
const job = process.argv[2];
try {
  // Dotenv is data, not a shell script. New file values must replace stale PM2 env.
  const configured = parseEnv(await fs.readFile(path.join(app, "artifacts/api-server/.env"), "utf8"));
  const env = { ...process.env, ...configured, COMET_APP_DIR: app, COMET_ENV_LOADED: "1" };
  const stdio = ["inherit", "inherit", "inherit"];
  if (process.env.COMET_UPDATE_LOCK_HELD === "1") {
    stdio.push("ignore", "ignore", "ignore", "ignore", "ignore", "ignore", 9);
  }
  const child = spawn("bash", [path.join(app, "update.sh"), job], { env, stdio });
  child.once("error", () => { process.exitCode = 1; });
  child.once("exit", code => { process.exitCode = code ?? 1; });
} catch {
  await run("node", [path.join(app, "tools/operations/update-state.mjs"), "failed", job, "prepare",
    "Server-Konfiguration konnte nicht geladen werden. Laufende Dateien unverändert."]).catch(() => {});
  process.exitCode = 1;
}
