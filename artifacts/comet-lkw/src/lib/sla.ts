export interface SlaThresholds {
  angekommen_warn_min: number;
  angekommen_danger_min: number;
  inverladung_warn_min: number;
  inverladung_danger_min: number;
  eta_warn_min: number;
  eta_danger_min: number;
}

export const SLA_DEFAULTS: SlaThresholds = {
  angekommen_warn_min: 60,
  angekommen_danger_min: 90,
  inverladung_warn_min: 120,
  inverladung_danger_min: 180,
  eta_warn_min: 30,
  eta_danger_min: 60,
};

export function slaWarning(
  shipment: {
    status?: string | null;
    statusChangedAt?: string | null;
    etaDate?: string | null;
    etaTime?: string | null;
  },
  t: SlaThresholds = SLA_DEFAULTS,
): { level: "warn" | "danger"; label: string } | null {
  if (!shipment) return null;
  const now = Date.now();
  const status = shipment.status ?? "";
  const statusChangedAt = shipment.statusChangedAt ?? null;
  const etaDate = shipment.etaDate ?? null;
  const etaTime = shipment.etaTime ?? null;

  const warnMin   = status === "Angekommen" ? t.angekommen_warn_min   : t.inverladung_warn_min;
  const dangerMin = status === "Angekommen" ? t.angekommen_danger_min : t.inverladung_danger_min;

  if ((status === "Angekommen" || status === "in Verladung") && statusChangedAt) {
    const minIn = (now - new Date(statusChangedAt).getTime()) / 60_000;
    if (minIn >= dangerMin) {
      const h = Math.floor(minIn / 60);
      const m = Math.round(minIn % 60);
      return { level: "danger", label: `${h > 0 ? h + " Std. " : ""}${m} Min. überfällig` };
    }
    if (minIn >= warnMin) {
      const h = Math.floor(minIn / 60);
      const m = Math.round(minIn % 60);
      return { level: "warn", label: `${h > 0 ? h + " Std. " : ""}${m} Min. in Status` };
    }
  }

  if ((status === "Angemeldet" || status === "Erwartet") && etaDate) {
    const etaStr = `${etaDate}T${etaTime ? etaTime + ":00" : "00:00:00"}`;
    const minsLate = (now - new Date(etaStr).getTime()) / 60_000;
    if (minsLate >= t.eta_danger_min) return { level: "danger", label: `${Math.round(minsLate)} Min. nach ETA` };
    if (minsLate >= t.eta_warn_min)   return { level: "warn",   label: `${Math.round(minsLate)} Min. nach ETA` };
  }

  return null;
}
