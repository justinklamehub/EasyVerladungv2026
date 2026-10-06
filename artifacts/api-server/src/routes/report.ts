import { Router } from "express";
import { requireAuth, requireRoles } from "../lib/auth";
import { sendWeeklyReport } from "../lib/weekly-report";
import { previewDeliveryReport, runDeliveryReportCheck } from "../lib/delivery-report";
import { PreviewDeliveryReportResponse, SendDeliveryReportResponse } from "@workspace/api-zod";

const router = Router();

router.get("/report/delivery/preview", requireAuth, requireRoles("comet_admin"), async (_req, res): Promise<void> => {
  res.json(PreviewDeliveryReportResponse.parse(await previewDeliveryReport()));
});
router.post("/report/delivery/send", requireAuth, requireRoles("comet_admin"), async (_req, res): Promise<void> => {
  try {
    res.json(SendDeliveryReportResponse.parse(await runDeliveryReportCheck(true)));
  } catch {
    res.status(500).json({ error: "Liefertermin-Mail konnte nicht gesendet werden. Empfänger und Mailserver prüfen; Details siehe Postausgang." });
  }
});

router.post("/report/weekly/send", requireAuth, requireRoles("comet_admin"), async (_req, res) => {
  try {
    await sendWeeklyReport();
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Fehler beim Senden: ${msg}` });
  }
});

export default router;
