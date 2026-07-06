import { db, pool } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_DEFAULT_MAX_AGE_DAYS = 90; // Standard: 90 Tage (~3 Monate)
export const PASSWORD_MAX_AGE_MS = 1000 * 60 * 60 * 24 * PASSWORD_DEFAULT_MAX_AGE_DAYS;
export const PASSWORD_DEFAULT_REMINDER_DAYS = [7, 3, 1];

/**
 * Standard-Passwortrichtlinie: mindestens 8 Zeichen, je ein Klein- und
 * Großbuchstabe sowie eine Ziffer. Gibt bei Verstoß eine deutschsprachige
 * Fehlermeldung zurück, sonst null.
 */
export function validatePasswordPolicy(password: string | undefined | null): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`;
  }
  if (!/[a-z]/.test(password)) {
    return "Das Passwort muss mindestens einen Kleinbuchstaben enthalten";
  }
  if (!/[A-Z]/.test(password)) {
    return "Das Passwort muss mindestens einen Großbuchstaben enthalten";
  }
  if (!/[0-9]/.test(password)) {
    return "Das Passwort muss mindestens eine Zahl enthalten";
  }
  return null;
}

/**
 * Liest die konfigurierte Passwort-Gültigkeitsdauer (in Tagen) aus den
 * Einstellungen (Schlüssel "password_expiry_days"). Fällt auf den
 * Standardwert (90 Tage) zurück, falls nicht gesetzt oder ungültig.
 */
export async function getPasswordMaxAgeDays(): Promise<number> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "password_expiry_days"))
    .limit(1);
  const days = parseInt(row?.value || "", 10);
  return Number.isFinite(days) && days > 0 ? days : PASSWORD_DEFAULT_MAX_AGE_DAYS;
}

export async function getPasswordMaxAgeMs(): Promise<number> {
  const days = await getPasswordMaxAgeDays();
  return days * 24 * 60 * 60 * 1000;
}

export function isPasswordExpired(passwordChangedAt: Date, maxAgeMs: number = PASSWORD_MAX_AGE_MS): boolean {
  return Date.now() - new Date(passwordChangedAt).getTime() > maxAgeMs;
}

export async function computePasswordChangeRequired(user: {
  mustChangePassword: boolean;
  passwordChangedAt: Date;
}): Promise<boolean> {
  if (user.mustChangePassword) return true;
  const maxAgeMs = await getPasswordMaxAgeMs();
  return isPasswordExpired(user.passwordChangedAt, maxAgeMs);
}

/**
 * Setzt den Erinnerungs-Verlauf eines Benutzers zurück, sobald sich sein
 * Passwort ändert (egal ob durch ihn selbst oder einen Admin), damit der
 * nächste Ablaufzyklus wieder von vorne beginnt.
 */
export async function resetPasswordExpiryReminders(userId: number): Promise<void> {
  try {
    await pool.query("DELETE FROM password_expiry_reminders WHERE user_id = $1", [userId]);
  } catch {
    // Tabelle evtl. noch nicht angelegt — nicht kritisch, wird beim nächsten Start erstellt
  }
}

export async function ensurePasswordExpiryRemindersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_expiry_reminders (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL,
      days_threshold INTEGER NOT NULL,
      sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, days_threshold)
    )
  `);
}
