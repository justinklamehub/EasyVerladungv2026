import { spawn } from "node:child_process";
import path from "node:path";
import { atomicJson, operations } from "./common.mjs";
import { classifyLine } from "./update-diagnostics.mjs";

const [jobId, phase, command, ...args] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_-]+$/.test(jobId || "") || phase !== "dependencies" || command !== "pnpm") {
  throw new Error("Ungültiger klassifizierter Update-Schritt.");
}
// No log file is read. Inspect a bounded line buffer in memory and retain only an enum.
let code = null;
const inspect = () => {
  let buffer = "", overflow = false;
  return chunk => {
    for (const part of chunk.toString("utf8").split(/(\n)/)) {
      if (part === "\n") {
        if (!overflow) code ||= classifyLine(buffer);
        buffer = ""; overflow = false;
      } else if (!overflow) {
        buffer += part;
        if (buffer.length > 4096) { buffer = ""; overflow = true; }
      }
    }
    return () => { if (!overflow) code ||= classifyLine(buffer); };
  };
};
const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
let flushOut, flushErr;
const out = inspect(), err = inspect();
child.stdout.on("data", chunk => { flushOut = out(chunk); process.stdout.write(chunk); });
child.stderr.on("data", chunk => { flushErr = err(chunk); process.stderr.write(chunk); });
const signal = value => child.kill(value);
process.on("SIGTERM", signal.bind(null, "SIGTERM"));
process.on("SIGINT", signal.bind(null, "SIGINT"));
const exitCode = await new Promise(resolve => {
  child.once("error", () => resolve(1));
  child.once("close", value => resolve(value ?? 1));
});
flushOut?.(); flushErr?.();
await atomicJson(path.join(operations, "update-diagnostic.json"), {
  jobId, phase, code: exitCode === 0 ? null : code,
});
process.exitCode = exitCode;
