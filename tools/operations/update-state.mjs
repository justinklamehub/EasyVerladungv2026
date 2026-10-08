import fs from "node:fs/promises";
import path from "node:path";
import { atomicJson, operations } from "./common.mjs";

const [status, jobId, phase = "prepare", message = "Update wird vorbereitet."] = process.argv.slice(2);
if (!["queued", "running", "done", "failed"].includes(status) || !/^[a-zA-Z0-9_-]+$/.test(jobId || "")) {
  throw new Error("Ungültiger Update-Status.");
}
const file = path.join(operations, "update.json");
let previous;
try { previous = JSON.parse(await fs.readFile(file, "utf8")); } catch { /* first operation */ }
const now = new Date().toISOString();
const same = previous?.jobId === jobId;
await atomicJson(file, {
  jobId, status, phase, message, pid: Number(process.env.COMET_UPDATE_PID) || null, startedAt: same ? previous.startedAt : now,
  finishedAt: ["done", "failed"].includes(status) ? now : null,
  events: [...(same ? previous.events ?? [] : []), { phase, message, at: now }].slice(-20),
});
