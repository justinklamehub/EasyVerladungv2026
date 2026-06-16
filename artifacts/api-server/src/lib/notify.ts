import { db, notifications, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";

export interface NotifyOptions {
  userId?: number;
  targetRoles?: string[];
  title: string;
  message?: string;
  type?: "info" | "warning" | "success" | "error";
  linkTo?: string;
}

export async function notify(io: SocketIOServer, options: NotifyOptions) {
  const { userId, targetRoles, title, message, type = "info", linkTo } = options;
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
    .values(userIds.map((uid) => ({ userId: uid, title, message: message ?? null, type, linkTo: linkTo ?? null })))
    .returning();

  for (const notif of created) {
    io.to(`user:${notif.userId}`).emit("notification.new", notif);
  }

  return created;
}
