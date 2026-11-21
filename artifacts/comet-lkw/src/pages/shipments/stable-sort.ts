/** Keep equal sort values in a fixed order even when a DB update moves a row. */
export function stableShipmentComparison(comparison: number, aId: number, bId: number, direction: "asc" | "desc"): number {
  return (direction === "asc" ? comparison : -comparison) || aId - bId;
}

/** Midnight ETAs stay last, ahead of all other sort rules and independent of direction. */
export function midnightEtaComparison(a: { etaTime?: string | null }, b: { etaTime?: string | null }): number {
  const isMidnight = (value?: string | null) => /^00:00(?::00(?:\.0+)?)?$/.test(value ?? "");
  return Number(isMidnight(a.etaTime)) - Number(isMidnight(b.etaTime));
}
