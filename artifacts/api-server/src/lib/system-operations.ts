import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GetAdminSystemOperationsResponse } from "@workspace/api-zod";

// Bundled runtime lives at artifacts/api-server/dist/index.mjs.
const app = path.resolve(process.env.COMET_APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const directory = path.join(app, ".comet-operations");
const script = path.join(app, "update.sh");
const idle = { jobId: null, status: "idle", phase: "", message: "Noch kein Update ausgeführt.",
  startedAt: null, finishedAt: null, events: [] };

async function readJson(file: string) {
  try { return JSON.parse(await fs.readFile(path.join(directory, file), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function readSystemOperations() {
  let reason: string | null = null;
  if (process.env.NODE_ENV !== "production") reason = "Server-Updates sind nur für selbstgehostete Produktionsinstanzen eingerichtet.";
  try {
    const text = await fs.readFile(script, "utf8");
    if (!text.includes("# COMET_SAFE_UPDATE_V1")) reason = "Der sichere Updater ist auf diesem Server noch nicht installiert.";
    await fs.access(path.join(app, "tools/operations/run-update.mjs"), fs.constants.R_OK);
  } catch { reason = "Der sichere Updater ist auf diesem Server nicht installiert."; }
  try {
    const publicUrl = new URL(process.env.COMET_PUBLIC_URL || "");
    if (!["https:", "http:"].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password) throw new Error();
  } catch { reason ??= "COMET_PUBLIC_URL für die öffentliche Auslieferungsprüfung ist noch nicht konfiguriert."; }
  if (process.getuid?.() === 0) reason = "Die API muss als unprivilegierter App-Benutzer laufen.";
  if (Number(process.versions.node.split(".")[0]) < 22) reason = "Für den sicheren Updater wird Node.js 22 oder neuer benötigt.";
  let update = GetAdminSystemOperationsResponse.shape.update.parse(idle);
  let backup: ReturnType<typeof GetAdminSystemOperationsResponse.parse>["backup"] = null;
  try {
    const stored = await readJson("update.json");
    if (stored) {
      update = GetAdminSystemOperationsResponse.shape.update.parse(stored);
      if (["running", "queued"].includes(update.status) && stored.pid) {
        try { process.kill(Number(stored.pid), 0); }
        catch {
          update.status = "unknown";
          update.message = "Der Update-Prozess ist nicht mehr erreichbar. Abschluss und laufende Version manuell prüfen.";
        }
      }
      if (update.status === "queued" && !stored.pid && update.startedAt &&
          Date.now() - update.startedAt.getTime() > 30_000) {
        update.status = "unknown";
        update.message = "Der Start des Update-Prozesses wurde nicht bestätigt. Serverstatus und Protokoll prüfen.";
      }
    }
  } catch {
    update = GetAdminSystemOperationsResponse.shape.update.parse({ ...idle, status: "unknown", message: "Gespeicherter Update-Status ist nicht zuverlässig lesbar." });
    reason ??= "Update-Status zuerst auf dem Server prüfen.";
  }
  try { const stored = await readJson("backup.json"); if (stored) backup = GetAdminSystemOperationsResponse.shape.backup.parse(stored); }
  catch { /* No trustworthy backup proof is preferable to a false success. */ }
  return GetAdminSystemOperationsResponse.parse({ available: reason === null, reason, update, backup });
}

export async function startSystemUpdate() {
  const report = await readSystemOperations();
  if (!report.available) return { status: 503, error: report.reason };
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const id = `update-${Date.now()}-${randomUUID().slice(0, 8)}`;
  // The launcher exits immediately; the orphaned worker keeps the inherited flock.
  // It is not a child of the API when PM2 restarts it, and no browser disconnect kills it.
  const code = await new Promise<number>((resolve, reject) => {
    const launcher = spawn("bash", ["-c",
      'exec 9>"$2/update.lock"; flock -n 9 || exit 73; node "$3" queued "$4" || exit 1; nohup bash "$1" "$4" </dev/null >>"$2/update.log" 2>&1 &',
      "_", script, directory, path.join(app, "tools/operations/update-state.mjs"), id], {
      cwd: app, detached: true, stdio: "ignore",
      env: { ...process.env, COMET_APP_DIR: app, COMET_UPDATE_LOCK_HELD: "1", COMET_ENV_LOADED: "0",
        COMET_UPDATE_PID: "", COMET_STORAGE_CWD: process.cwd() },
    });
    launcher.once("error", reject);
    launcher.once("exit", value => resolve(value ?? 1));
  });
  if (code === 73) return { status: 409, error: "Ein Update läuft bereits." };
  if (code !== 0) return { status: 503, error: "Update-Auftrag konnte nicht sicher gestartet werden." };
  return { status: 202, jobId: id };
}
