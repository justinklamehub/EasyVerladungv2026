import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { GetAdminSystemStatusResponse, StartAdminSystemUpdateBody } from "@workspace/api-zod";
import { readSystemStatus } from "../lib/system-status-runtime";
import { readSystemOperations, startSystemUpdate } from "../lib/system-operations";
import { can } from "../lib/permissions";

const router = Router();

router.get("/admin/system/operations", requireAuth, async (req, res, next) => {
  try {
    if (!(await can(req.session.role!, "system.view"))) { res.status(403).json({ error: "Kein Recht zum Anzeigen des Systemstatus." }); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json(await readSystemOperations());
  } catch (error) { next(error); }
});

router.post("/admin/system/update", requireAuth, async (req, res, next) => {
  try {
    if (!(await can(req.session.role!, "system.view")) || !(await can(req.session.role!, "system.update"))) {
      res.status(403).json({ error: "System-Anzeige- und Update-Recht erforderlich." }); return;
    }
  } catch (error) { next(error); return; }
  let origin;
  try { origin = new URL(process.env.COMET_PUBLIC_URL || "").origin; } catch { /* unconfigured updater */ }
  if (!origin || req.get("origin") !== origin) {
    res.status(403).json({ error: "Update nur aus der konfigurierten App-Herkunft starten." }); return;
  }
  const body = StartAdminSystemUpdateBody.safeParse(req.body);
  if (!body.success || body.data.confirm !== true) {
    res.status(400).json({ error: "Das Update muss ausdrücklich bestätigt werden." }); return;
  }
  try {
    const result = await startSystemUpdate();
    res.status(result.status).json("jobId" in result ? { jobId: result.jobId } : { error: result.error });
  } catch (error) { next(error); }
});

router.get("/admin/system/status", requireAuth, async (req, res, next) => {
  try {
    if (!(await can(req.session.role!, "system.view"))) {
      res.status(403).json({ error: "Kein Recht zum Anzeigen des Systemstatus." }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(GetAdminSystemStatusResponse.parse(await readSystemStatus()));
  } catch (error) { next(error); }
});

router.get("/admin/system/restart/stream", requireAuth, async (req, res, next) => {
  try {
    if (!(await can(req.session.role!, "system.view")) || !(await can(req.session.role!, "system.update"))) {
      res.status(403).json({ error: "System-Anzeige- und Update-Recht erforderlich." }); return;
    }
  res.status(410).json({ error: "Updates werden nicht mehr durch GET gestartet. Seite neu laden und den bestätigten Update-Auftrag verwenden." });
  } catch (error) { next(error); }
});

export default router;
