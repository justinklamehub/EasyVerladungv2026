import { db, notifications } from "@workspace/db";
import { and, gte, eq } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";
import { notify } from "./notify";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function hasMonthlyAbstimmungBeenSent(): Promise<boolean> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, "abstimmung_monthly"),
        gte(notifications.createdAt, startOfMonth)
      )
    )
    .limit(1);

  return existing.length > 0;
}

async function runMonthlyCheck(io: SocketIOServer) {
  const now = new Date();
  if (now.getDate() !== 1) return;

  const alreadySent = await hasMonthlyAbstimmungBeenSent();
  if (alreadySent) return;

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

export function startScheduler(io: SocketIOServer) {
  runMonthlyCheck(io).catch((e) =>
    logger.warn({ err: e }, "Scheduler initial check failed — non-fatal")
  );

  setInterval(() => {
    runMonthlyCheck(io).catch((e) =>
      logger.warn({ err: e }, "Scheduler interval check failed — non-fatal")
    );
  }, CHECK_INTERVAL_MS);

  logger.info("Scheduler started (monthly Abstimmung check)");
}
