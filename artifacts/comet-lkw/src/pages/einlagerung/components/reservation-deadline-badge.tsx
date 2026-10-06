import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { ReservationDeadline } from "./reservation-deadlines";

export function ReservationDeadlineBadge({ deadline, scale = 1 }: { deadline: ReservationDeadline; scale?: number }) {
  if (deadline.status !== "overdue" && deadline.status !== "unknown") return null;
  return <span title={deadline.detail} data-testid={`reservation-${deadline.status}`}
    className={`mt-1 flex items-center gap-1 rounded border px-1 py-0.5 font-bold ${deadline.status === "overdue"
      ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}
    style={{ fontSize: 9 * scale, lineHeight: 1.3 }}>
    <AlertTriangle aria-hidden="true" className="shrink-0" style={{ width: 11 * scale, height: 11 * scale }} />
    <span>{deadline.label}<span className="sr-only">: {deadline.detail}</span></span>
  </span>;
}
