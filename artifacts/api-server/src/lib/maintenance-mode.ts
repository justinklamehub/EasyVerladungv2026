import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, RequestHandler, Response } from "express";

export const MAINTENANCE_SETTING_KEY = "maintenance_mode";
export const DEFAULT_MAINTENANCE_MESSAGE =
  "Wir führen gerade Wartungsarbeiten durch. Bitte versuchen Sie es später erneut.";
export type MaintenanceStatus = { enabled: boolean; message: string };

const SAFE_FALLBACK: MaintenanceStatus = {
  enabled: true,
  message: "Der Wartungsstatus ist gerade nicht verfügbar. Der Zugriff ist vorsichtshalber eingeschränkt.",
};
const CACHE_MS = 1_000;
let cached: { value: MaintenanceStatus; expiresAt: number } | null = null;
let pending: Promise<MaintenanceStatus> | null = null;

export function parseMaintenanceSettings(value?: string): MaintenanceStatus {
  if (value == null || value === "") return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE };
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const config = parsed as Record<string, unknown>;
      if (typeof config.enabled === "boolean" && typeof config.message === "string" &&
        config.message.trim().length > 0 && config.message.length <= 1000) {
        return { enabled: config.enabled, message: config.message };
      }
    }
  } catch { /* Fail closed below: malformed maintenance config must not open the app. */ }
  return SAFE_FALLBACK;
}

export function validateMaintenanceSettings(value: unknown): { config?: MaintenanceStatus; error?: string } {
  if (typeof value !== "string") return { error: "Ungültige Wartungseinstellung." };
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return { error: "Die Wartungseinstellung ist kein gültiges JSON." }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "Ungültige Wartungseinstellung." };
  const config = parsed as Record<string, unknown>;
  if (typeof config.enabled !== "boolean" || typeof config.message !== "string" ||
    !config.message.trim() || config.message.length > 1000) {
    return { error: "Bitte Wartungsstatus angeben und einen Hinweistext mit höchstens 1.000 Zeichen hinterlegen." };
  }
  return { config: { enabled: config.enabled, message: config.message.trim() } };
}

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!pending) {
    pending = (async () => {
      const [row] = await db.select({ value: settingsTable.value })
        .from(settingsTable).where(eq(settingsTable.key, MAINTENANCE_SETTING_KEY)).limit(1);
      const value = parseMaintenanceSettings(row?.value);
      cached = { value, expiresAt: Date.now() + CACHE_MS };
      return value;
    })().finally(() => { pending = null; });
  }
  return pending;
}

export function invalidateMaintenanceStatus() {
  cached = null;
}

const PUBLIC_APP_PATHS = new Set([
  "/login", "/forgot-password", "/reset-password", "/passwort-aendern",
  "/impressum", "/datenschutz",
]);
const SAFE_AUTH_ENDPOINTS = new Set([
  "POST /auth/login", "POST /auth/logout", "GET /auth/me",
  "POST /auth/forgot-password", "POST /auth/reset-password", "POST /auth/change-password",
]);
const PUBLIC_SCANNER_ENDPOINTS = new Set([
  "GET /scanner/find-shipment",
  "POST /scanner/gefahrgut", "POST /scanner/wareneingang", "POST /scanner/fotos",
  "GET /lkw-arten",
  "POST /storage/uploads/request-url",
  "GET /stempeluhr/terminal/status", "POST /stempeluhr/terminal/stamp",
  "POST /stempeluhr/terminal/lock",
]);

export function isMaintenanceExempt(req: Pick<Request, "method" | "path">) {
  if (req.method === "OPTIONS") return true;
  const route = `${req.method} ${req.path}`;
  if (PUBLIC_APP_PATHS.has(req.path) ||
    req.path === "/healthz" ||
    (req.method === "GET" && (req.path === "/settings/public" || req.path === "/maintenance/status")) ||
    SAFE_AUTH_ENDPOINTS.has(route) ||
    PUBLIC_SCANNER_ENDPOINTS.has(route) ||
    (req.method === "PATCH" && /^\/scanner\/shipment\/\d+$/.test(req.path)) ||
    (req.method === "PUT" && /^\/storage\/local-uploads\/[^/]+$/.test(req.path)) ||
    (req.method === "GET" && /^\/einlagerung\/scanner\/(state|search)$/.test(req.path)) ||
    (/^(POST|PUT)$/.test(req.method) && /^\/einlagerung\/scanner\/records\/[^/]+(?:\/[^/]+)?$/.test(req.path)) ||
    (req.method === "POST" && /^\/einlagerung\/scanner\/shelves\/[^/]+\/status$/.test(req.path))) return true;
  return false;
}

export function createMaintenanceGate(readStatus: () => Promise<MaintenanceStatus>): RequestHandler {
  return async (req, res, next) => {
    if (isMaintenanceExempt(req) || req.session?.role === "comet_admin") {
      next();
      return;
    }
    try {
      const maintenance = await readStatus();
      if (!maintenance.enabled) {
        next();
        return;
      }
      sendMaintenanceResponse(res, maintenance);
    } catch (err) {
      req.log.error({ err }, "Could not read maintenance mode");
      sendMaintenanceResponse(res, SAFE_FALLBACK, 503);
    }
  };
}

export const maintenanceGate = createMaintenanceGate(getMaintenanceStatus);

export function sendMaintenanceResponse(res: Response, status: MaintenanceStatus, httpStatus = 503) {
  res.status(httpStatus).json({
    error: status.message,
    maintenance: true,
    message: status.message,
  });
}

export function disconnectNonAdminSockets(io: any) {
  if (!io?.sockets?.sockets) return;
  for (const socket of io.sockets.sockets.values()) {
    const role = (socket.request as any)?.session?.role;
    if (role === "comet_admin") continue;
    socket.disconnect(true);
  }
}
