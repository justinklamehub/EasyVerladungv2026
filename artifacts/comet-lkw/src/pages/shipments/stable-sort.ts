/** Keep equal sort values in a fixed order even when a DB update moves a row. */
export function stableShipmentComparison(comparison: number, aId: number, bId: number, direction: "asc" | "desc"): number {
  return (direction === "asc" ? comparison : -comparison) || aId - bId;
}
