import { db, lkwArtenTable, speditionenTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export const SPEDITION_ROLES = ["speditions_admin", "speditions_bearbeiter", "speditions_viewer"];

export function isLkwArtAllowed(id: number, restrictions: (number[] | null)[]) {
  return restrictions.every((allowed) => allowed === null || allowed.includes(id));
}

/** A delegation never expands the acting carrier's allowed truck types. */
export async function allowedSpeditionLkwArten(actorId: number | null, targetId?: number | null) {
  if (!actorId) return [];
  const ids = [...new Set([actorId, targetId].filter((id): id is number => !!id))];
  const carriers = await db.select({ id: speditionenTable.id, allowed: speditionenTable.allowedLkwArtIds })
    .from(speditionenTable).where(inArray(speditionenTable.id, ids));
  if (carriers.length !== ids.length) return [];
  const types = await db.select().from(lkwArtenTable);
  return types.filter((type) => type.aktiv && isLkwArtAllowed(type.id, carriers.map((carrier) => carrier.allowed)));
}
