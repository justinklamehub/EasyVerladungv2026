import { db, speditionPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getSpeditionAccess(sessionSpeditionId: number | null) {
  if (!sessionSpeditionId) return { readIds: [], writeIds: [] };
  const permissions = await db.select().from(speditionPermissionsTable)
    .where(eq(speditionPermissionsTable.receivingSpeditionId, sessionSpeditionId));
  const active = permissions.filter((p) => p.permissionLevel === "view" || p.permissionLevel === "edit");
  return {
    readIds: [sessionSpeditionId, ...active.map((p) => p.grantingSpeditionId)],
    writeIds: [sessionSpeditionId, ...active.filter((p) => p.permissionLevel === "edit").map((p) => p.grantingSpeditionId)],
  };
}
