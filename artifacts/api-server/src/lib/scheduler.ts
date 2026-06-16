import { db, notifications, shipmentsTable } from "@workspace/db";
import { and, gte, eq, lt, notInArray, isNotNull, count } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";
import { notify } from "./notify";
import { logger } from "./logger";

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

// ── Scheduler starten ─────────────────────────────────────────────────────────

async function runAllChecks(io: SocketIOServer) {
  await runMonthlyCheck(io).catch((e) =>
    logger.warn({ err: e }, "Monthly Abstimmung check failed — non-fatal")
  );
  await runOffeneVerladungenCheck(io).catch((e) =>
    logger.warn({ err: e }, "Offene Verladungen check failed — non-fatal")
  );
}

export function startScheduler(io: SocketIOServer) {
  runAllChecks(io);
  setInterval(() => runAllChecks(io), CHECK_INTERVAL_MS);
  logger.info("Scheduler started");
}
