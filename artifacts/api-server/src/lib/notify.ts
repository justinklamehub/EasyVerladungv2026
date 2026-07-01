import { db, notifications, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";
import { sendPushToUsers, isPushEventEnabled } from "../routes/push";

export interface NotifyOptions {
  userId?: number;
  targetRoles?: string[];
  title: string;
  message?: string;
  type?: "info" | "warning" | "success" | "error";
  linkTo?: string;
  /** Wenn gesetzt, wird push_event_settings für dieses Ereignis geprüft (aktiviert + Zielrollen).
   *  Ist der Key nicht gesetzt, wird Push ohne Prüfung an alle notifizierten User gesendet. */
  pushEventKey?: string;
}

export async function notify(io: SocketIOServer, options: NotifyOptions) {
  const { userId, targetRoles, title, message, type = "info", linkTo, pushEventKey } = options;
  const userIds: number[] = [];

  if (userId) {
    userIds.push(userId);
  } else if (targetRoles && targetRoles.length > 0) {
    const matchingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, targetRoles));
    userIds.push(...matchingUsers.map((u) => u.id));
  }

  if (userIds.length === 0) return;

  const created = await db
    .insert(notifications)
    .values(
      userIds.map((uid) => ({ userId: uid, title, message: message ?? null, type, linkTo: linkTo ?? null }))
    )
    .returning();

  for (const notif of created) {
    io.to(`user:${notif.userId}`).emit("notification.new", notif);
  }

  // Web Push — non-blocking, best-effort
  ;(async () => {
    try {
      let pushUserIds = [...userIds];

      if (pushEventKey) {
        const { enabled, targetRoles: eventRoles } = await isPushEventEnabled(pushEventKey);
        if (!enabled) return;

        // Wenn Ereignis eigene Zielrollen hat, Push unabhängig von Socket.IO-Empfängern berechnen
        if (eventRoles.length > 0) {
          const users = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(inArray(usersTable.role, eventRoles));
          pushUserIds = users.map((u) => u.id);
        }
      }

      if (pushUserIds.length > 0) {
        await sendPushToUsers(pushUserIds, { title, message, linkTo, tag: `comet-${type}` });
      }
    } catch (err: any) {
      console.warn("Web Push Fehler:", err?.message ?? err);
    }
  })();

  return created;
}
