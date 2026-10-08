import fs from "node:fs/promises";
import path from "node:path";
import { atomicJson, operations } from "./common.mjs";
import { diagnosticFor, safeMessage, sanitizeUpdate, phases } from "./update-diagnostics.mjs";

const [status, jobId, phase = "prepare", _message, recoveryFlag] = process.argv.slice(2);
if (!["queued", "running", "done", "failed"].includes(status) || !/^[a-zA-Z0-9_-]+$/.test(jobId || "")) {
  throw new Error("Ungültiger Update-Status.");
}
if (!Object.hasOwn(phases, phase)) throw new Error("Ungültige Update-Phase.");
const file = path.join(operations, "update.json");
let previous;
try { previous = JSON.parse(await fs.readFile(file, "utf8")); } catch { /* first operation */ }
const now = new Date().toISOString();
const same = previous?.jobId === jobId;
const recovery = status === "failed" ? (recoveryFlag === "failed" ? "failed" : "preserved") : null;
const message = safeMessage(status, phase, recovery);
let diagnostic = null;
if (status === "failed") {
  let detected;
  try { detected = JSON.parse(await fs.readFile(path.join(operations, "update-diagnostic.json"), "utf8")); } catch { /* unknown */ }
  diagnostic = diagnosticFor(detected?.jobId === jobId && detected?.phase === phase ? detected.code : null, phase);
}
await atomicJson(file, {
  jobId, status, phase, message, recovery, diagnostic, pid: Number(process.env.COMET_UPDATE_PID) || null, startedAt: same ? sanitizeUpdate(previous).startedAt : now,
  finishedAt: ["done", "failed"].includes(status) ? now : null,
  events: [...(same ? sanitizeUpdate(previous).events : []), { phase, message, at: now }].slice(-20),
});
