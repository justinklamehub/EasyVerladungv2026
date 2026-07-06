export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90; // 90 Tage (~3 Monate)

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

export function isPasswordExpired(passwordChangedAt: Date): boolean {
  return Date.now() - new Date(passwordChangedAt).getTime() > PASSWORD_MAX_AGE_MS;
}

export function computePasswordChangeRequired(user: { mustChangePassword: boolean; passwordChangedAt: Date }): boolean {
  return user.mustChangePassword || isPasswordExpired(user.passwordChangedAt);
}
