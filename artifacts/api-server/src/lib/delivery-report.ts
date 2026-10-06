import { db, pool, settingsTable, emailLogTable } from "@workspace/db";
import { createEmailTransport } from "./email";
import { aggregateStock, getSettings, read, records } from "./einlagerung/model";
import { buildDeliveryReport, deliverReportRecipients, reportDate, reportIsDue, reportRecipients } from "./delivery-report-content";
import { logger } from "./logger";
import { deliveryMailDays } from "@workspace/api-zod/delivery-mail";

async function appSettings() {
  return Object.fromEntries((await db.select().from(settingsTable)).map((s) => [s.key, s.value ?? ""]));
}
export async function previewDeliveryReport(now = new Date(), app?: Record<string, string>) {
  const settings = app ?? await appSettings();
  return read(async (client) => {
    const warehouse = await getSettings(client);
    const { rows } = await client.query("SELECT * FROM einlagerung_datasets WHERE type='auftraege' ORDER BY id DESC LIMIT 1");
    const snapshot = rows[0];
    const orders = aggregateStock(snapshot?.rows || [], "auftraege", await records(client));
    return buildDeliveryReport({ orders, thresholds: warehouse.deadlineThresholds,
      now, appName: settings.app_name || "COMET", importedAt: snapshot && new Date(snapshot.imported_at),
      filename: snapshot?.filename, staleHours: warehouse.staleHours, warningDays: deliveryMailDays(settings.report_delivery_days),
      subjectTemplate: settings.email_tpl_delivery_report_subject, bodyTemplate: settings.email_tpl_delivery_report_body });
  });
}
const skipped = (message: string) => ({ ok: true, sent: false, message });

export async function runDeliveryReportCheck(manual = false, now = new Date()) {
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(736292) AS locked");
    locked = lock.rows[0].locked;
    if (!locked) return skipped("Die Lieferterminprüfung läuft bereits.");
    const s = await appSettings();
    if (!manual && !reportIsDue(s, now)) return skipped("Automatik deaktiviert oder Prüfzeit noch nicht erreicht.");
    const put = async (key: string, value: string) => {
      await client.query("INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()", [key, value]);
    };
    const check = async (message: string) => put("report_delivery_last_check", JSON.stringify({ at: now.toISOString(), message }));
    let progress: { date: string; delivered: string[] } = { date: reportDate(now), delivered: [] };
    try {
      const previous = JSON.parse(s.report_delivery_sent || "{}");
      if (previous.date === progress.date && Array.isArray(previous.delivered)) progress = previous;
    } catch { /* A malformed internal progress value must not crash the scheduler. */ }
    const recipients = reportRecipients(s.report_delivery_email || "");
    if (recipients.every((to) => progress.delivered.includes(to))) return skipped("Die Übersicht wurde heute bereits an alle Empfänger gesendet.");
    const lastAttempt = Date.parse(s.report_delivery_last_attempt || "");
    if (!manual && now.getTime() - lastAttempt < 15 * 60_000) return skipped("Versand wird nach einer kurzen Wartezeit erneut versucht.");
    const report = await previewDeliveryReport(now, s);
    if (!report.dueCount) {
      const message = `Keine Liefertermine innerhalb von ${report.warningDays} Tagen oder überfällig – keine Mail versendet.`;
      // New imports and changed thresholds are picked up on the next minute.
      await check(message);
      return skipped(message);
    }
    await put("report_delivery_last_attempt", now.toISOString());
    const transport = createEmailTransport(s);
    const from = s.email_from || process.env.SMTP_FROM || "noreply@comet-seasonal.de";
    try {
      await deliverReportRecipients(report, recipients, progress.delivered, from, (message) => transport.sendMail(message), async (to) => {
        progress.delivered.push(to);
        await put("report_delivery_sent", JSON.stringify(progress));
        await db.insert(emailLogTable).values({ event: "delivery_report", toAddresses: to, subject: report.subject,
          bodyHtml: report.html, bodyText: report.text, status: "sent" });
      });
      const message = `Lieferterminübersicht versendet (${report.dueCount} Auftragsgruppen innerhalb der Mail-Frist oder überfällig).`;
      await check(message);
      return { ok: true, sent: true, message };
    } catch (error) {
      await db.insert(emailLogTable).values({ event: "delivery_report", toAddresses: recipients.filter((to) => !progress.delivered.includes(to)).join(", "),
        subject: report.subject, bodyHtml: report.html, bodyText: report.text, status: "failed", errorMessage: "Liefertermin-Mail konnte nicht zugestellt werden." });
      await check("Versand fehlgeschlagen; automatische Wiederholung nach 15 Minuten.");
      logger.warn({ err: error }, "Liefertermin-Mail fehlgeschlagen");
      throw error;
    }
  } finally {
    try { if (locked) await client.query("SELECT pg_advisory_unlock(736292)"); }
    finally { client.release(); }
  }
}
