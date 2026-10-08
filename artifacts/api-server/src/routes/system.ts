import { Router } from "express";
import { spawn } from "child_process";
import { requireAuth } from "../lib/auth";
import { GetAdminSystemStatusResponse } from "@workspace/api-zod";
import { readSystemStatus } from "../lib/system-status-runtime";

const router = Router();

router.get("/admin/system/status", requireAuth, async (req, res, next) => {
  if (req.session.role !== "comet_admin") {
    res.status(403).json({ error: "Nur Administratoren dürfen den Systemstatus prüfen." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(GetAdminSystemStatusResponse.parse(await readSystemStatus()));
  } catch (error) { next(error); }
});

router.get("/admin/system/restart/stream", requireAuth, (req, res) => {
  if (req.session.role !== "comet_admin") {
    res.status(403).json({ error: "Nur Admins dürfen den Server neu starten." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (type: string, text: string) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify({ text })}\n\n`);
  };

  sendEvent("log", "▶ Starte Update-Skript…\n");

  const proc = spawn("sudo", ["bash", "/opt/comet/app/update.sh"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  proc.stdout.on("data", (chunk: Buffer) => sendEvent("log", chunk.toString()));
  proc.stderr.on("data", (chunk: Buffer) => sendEvent("log", chunk.toString()));

  proc.on("close", (code) => {
    if (code === 0) {
      sendEvent("done", "✓ Skript erfolgreich abgeschlossen.");
    } else {
      sendEvent("error", `✗ Prozess beendet mit Code ${code}.`);
    }
    res.end();
  });

  proc.on("error", (err) => {
    sendEvent("error", `✗ Fehler beim Starten des Prozesses: ${err.message}`);
    res.end();
  });

  req.on("close", () => {
    try { proc.kill(); } catch {}
  });
});

export default router;
