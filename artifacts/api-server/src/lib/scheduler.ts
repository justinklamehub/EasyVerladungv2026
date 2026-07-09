import { db, pool, notifications, shipmentsTable, settingsTable, usersTable, palletReconciliationsTable, speditionenTable, speditionContactsTable } from "@workspace/db";
import { and, gte, eq, lt, notInArray, isNotNull, isNull, count } from "drizzle-orm";
import { sendWeeklyReport } from "./weekly-report";
import type { Server as SocketIOServer } from "socket.io";
import { notify } from "./notify";
import { logger } from "./logger";
import { sendEventEmail } from "./email";
import { getPasswordMaxAgeDays } from "./password-policy";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const ABGESCHLOSSEN = ["Abgefertigt", "Storniert"];

// ── Monatliche Abstimmungs-Erinnerung ────────────────────────────────────────

async function hasMonthlyAbstimmungBeenSent(): Promise<boolean> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.type, "abstimmung_monthly"), gte(notifications.createdAt, startOfMonth)))
    .limit(1);
  return existing.length > 0;
}

async function runMonthlyCheck(io: SocketIOServer) {
  const now = new Date();
  if (now.getDate() !== 1) return;
  if (await hasMonthlyAbstimmungBeenSent()) return;

  const monthName = now.toLocaleString("de-DE", { month: "long", year: "numeric" });
  logger.info("Sending monthly Abstimmung reminder");

  await notify(io, {
    targetRoles: ["comet_admin", "comet_leitstand"],
    title: "Monatliche Abstimmung fällig",
    message: `Die Paletten-Abstimmung für ${monthName} muss durchgeführt werden.`,
    type: "warning",
    linkTo: "/abstimmungen",
  });
}

// ── Offene Verladungen (ETA in Vergangenheit, nicht abgeschlossen) ────────────

async function hasOffeneVerladungenBeenSentToday(): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.type, "offene_verladungen"), gte(notifications.createdAt, startOfDay)))
    .limit(1);
  return existing.length > 0;
}

async function runOffeneVerladungenCheck(io: SocketIOServer) {
  if (await hasOffeneVerladungenBeenSentToday()) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [result] = await db
    .select({ anzahl: count() })
    .from(shipmentsTable)
    .where(
      and(
        isNotNull(shipmentsTable.etaDate),
        lt(shipmentsTable.etaDate, today),
        notInArray(shipmentsTable.status, ABGESCHLOSSEN)
      )
    );

  const anzahl = result?.anzahl ?? 0;
  if (anzahl === 0) return;

  logger.info({ anzahl }, "Offene Verladungen aus der Vergangenheit gefunden");

  await notify(io, {
    targetRoles: ["comet_admin", "comet_leitstand"],
    title: `${anzahl} offene Verladung${anzahl !== 1 ? "en" : ""} aus der Vergangenheit`,
    message: `${anzahl} Verladung${anzahl !== 1 ? "en haben" : " hat"} einen vergangenen Verladetag und ${anzahl !== 1 ? "sind" : "ist"} noch nicht abgefertigt.`,
    type: "warning",
    linkTo: "/shipments",
  });
}

// ── Wöchentlicher Bericht ─────────────────────────────────────────────────────

async function hasWeeklyReportBeenSentThisWeek(): Promise<boolean> {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysSinceMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const result = await pool.query<{ sent_at: Date }>(
    "SELECT sent_at FROM report_weekly_log WHERE sent_at >= $1 LIMIT 1",
    [startOfWeek.toISOString()],
  );
  return result.rows.length > 0;
}

async function ensureReportWeeklyLogTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_weekly_log (
      id SERIAL PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function runWeeklyReportCheck() {
  const rows = await db.select().from(settingsTable);
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));

  if (s.report_weekly_enabled !== "1") return;

  const configuredDay = parseInt(s.report_weekly_day || "1", 10);
  const configuredHour = parseInt((s.report_weekly_time || "07:00").split(":")[0], 10);

  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();

  if (currentDay !== configuredDay) return;
  if (now.getHours() !== configuredHour) return;
  if (await hasWeeklyReportBeenSentThisWeek()) return;

  await sendWeeklyReport();
  await pool.query("INSERT INTO report_weekly_log (sent_at) VALUES (NOW())");
  logger.info("Wöchentlicher Bericht erfolgreich versendet und protokolliert");
}

// ── Passwort-Ablauf-Erinnerung ───────────────────────────────────────────────

async function tryClaimPasswordExpiryReminder(userId: number, daysThreshold: number): Promise<boolean> {
  const result = await pool.query(
    "INSERT INTO password_expiry_reminders (user_id, days_threshold) VALUES ($1, $2) ON CONFLICT (user_id, days_threshold) DO NOTHING RETURNING id",
    [userId, daysThreshold],
  );
  return result.rows.length > 0;
}

async function runPasswordExpiryReminderCheck() {
  const rows = await db.select().from(settingsTable);
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));

  const reminderDays = (s.password_expiry_reminder_days || "7,3,1")
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => Number.isFinite(d) && d > 0);

  if (reminderDays.length === 0) return;

  const maxAgeDays = await getPasswordMaxAgeDays();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const users = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.isActive, true), eq(usersTable.mustChangePassword, false)));

  for (const user of users) {
    if (!user.email) continue;
    const changedAt = new Date(user.passwordChangedAt).getTime();
    const expiresAt = changedAt + maxAgeMs;
    const daysRemaining = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));

    if (daysRemaining <= 0 || daysRemaining > Math.max(...reminderDays)) continue;

    const threshold = reminderDays.find((d) => d === daysRemaining);
    if (threshold === undefined) continue;

    const claimed = await tryClaimPasswordExpiryReminder(user.id, threshold);
    if (!claimed) continue;

    const ablaufdatum = new Date(expiresAt).toLocaleDateString("de-DE");
    logger.info({ userId: user.id, daysRemaining }, "Sending password expiry reminder");

    await sendEventEmail(
      "password_expiry",
      {
        username: user.username,
        email: user.email,
        tage: String(daysRemaining),
        ablaufdatum,
      },
      user.email,
    );
  }
}

// ── Abstimmungs-Erinnerungs-E-Mail ───────────────────────────────────────────

async function ensureReconciliationReminderSentTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reconciliation_reminder_sent (
      reconciliation_id INTEGER NOT NULL PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function runReconciliationReminderCheck() {
  const rows = await db.select().from(settingsTable);
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));

  if (s.email_tpl_reconciliation_reminder_enabled !== "1") return;

  const reminderDays = parseInt(s.reconciliation_reminder_days || "3", 10);
  if (!Number.isFinite(reminderDays) || reminderDays <= 0) return;

  const cutoff = new Date(Date.now() - reminderDays * 24 * 60 * 60 * 1000);

  const openRecs = await db
    .select()
    .from(palletReconciliationsTable)
    .where(
      and(
        eq(palletReconciliationsTable.status, "offen"),
        isNull(palletReconciliationsTable.speditionBalance),
        lt(palletReconciliationsTable.createdAt, cutoff),
      ),
    );

  for (const rec of openRecs) {
    const alreadySent = await pool.query(
      "SELECT 1 FROM reconciliation_reminder_sent WHERE reconciliation_id = $1",
      [rec.id],
    );
    if (alreadySent.rows.length > 0) continue;

    const [sped] = await db.select().from(speditionenTable).where(eq(speditionenTable.id, rec.speditionId)).limit(1);
    const creator = rec.createdBy
      ? (await db.select().from(usersTable).where(eq(usersTable.id, rec.createdBy)).limit(1))[0]
      : null;

    const spedEmails: string[] = [];
    if (sped?.email) spedEmails.push(sped.email);
    const contacts = await db.select().from(speditionContactsTable).where(eq(speditionContactsTable.speditionId, rec.speditionId));
    for (const c of contacts) { if (c.email) spedEmails.push(c.email); }
    if (creator?.email) spedEmails.push(creator.email);

    const tage = Math.floor((Date.now() - new Date(rec.createdAt).getTime()) / (24 * 60 * 60 * 1000));

    const { sendEventEmail } = await import("./email");
    await sendEventEmail(
      "reconciliation_reminder",
      {
        spedition: sped?.name ?? "",
        zeitraum_von: rec.dateFrom ?? "",
        zeitraum_bis: rec.dateTo ?? "",
        tage: String(tage),
        datum: new Date().toLocaleDateString("de-DE"),
      },
      spedEmails.join(", ") || undefined,
    ).catch(() => {});

    await pool.query(
      "INSERT INTO reconciliation_reminder_sent (reconciliation_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [rec.id],
    );
    logger.info({ reconciliationId: rec.id, tage }, "Reconciliation Erinnerungs-E-Mail versendet");
  }
}

// ── Abgelaufene Zeitraum-Limits aufräumen ────────────────────────────────────

async function runExpiredLimitsCleanup() {
  const result = await pool.query(
    "DELETE FROM spedition_shipment_limits WHERE bis < NOW() RETURNING id",
  );
  if (result.rowCount && result.rowCount > 0) {
    logger.info({ count: result.rowCount }, "Abgelaufene Speditions-Limits gelöscht");
  }
}

// ── Scheduler starten ─────────────────────────────────────────────────────────

async function runAllChecks(io: SocketIOServer) {
  // Monatliche Abstimmungs-Erinnerung vorerst deaktiviert
  // await runMonthlyCheck(io).catch((e) =>
  //   logger.warn({ err: e }, "Monthly Abstimmung check failed — non-fatal")
  // );
  await runOffeneVerladungenCheck(io).catch((e) =>
    logger.warn({ err: e }, "Offene Verladungen check failed — non-fatal")
  );
  await runWeeklyReportCheck().catch((e) =>
    logger.warn({ err: e }, "Weekly report check failed — non-fatal")
  );
  await runPasswordExpiryReminderCheck().catch((e) =>
    logger.warn({ err: e }, "Password expiry reminder check failed — non-fatal")
  );
  await runReconciliationReminderCheck().catch((e) =>
    logger.warn({ err: e }, "Reconciliation reminder check failed — non-fatal")
  );
  await runExpiredLimitsCleanup().catch((e) =>
    logger.warn({ err: e }, "Expired limits cleanup failed — non-fatal")
  );
}

export { ensureReportWeeklyLogTable, runPasswordExpiryReminderCheck, ensureReconciliationReminderSentTable };

export function startScheduler(io: SocketIOServer) {
  runAllChecks(io);
  setInterval(() => runAllChecks(io), CHECK_INTERVAL_MS);
  logger.info("Scheduler started");
}
