// The arithmetic of a reset link, and the strength meter shown beside a password box.
//
// Like every file in `domain/`, this imports nothing but Node built-ins, so the
// tests can run it straight from the TypeScript source. The rules that ACCEPT or
// REFUSE a password live in `validation.ts`, next to the error type they throw.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a reset link stays usable. Short, because anyone holding it is the account. */
export const RESET_TOKEN_MINUTES = 30;

/** Mirrors the rule in validation.ts; kept here so the meter and the rule agree. */
const COMMON = new Set([
  'password', 'password1', 'passw0rd', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein1',
  'abc12345', 'football', 'baseball', 'sunshine', 'princess', 'starwars',
]);

export type Strength = 'weak' | 'fair' | 'strong';

/**
 * A rough score for the meter next to the password box. It guides, it does not
 * decide: `validatePassword` is what actually accepts or refuses.
 */
export function passwordStrength(value: string): Strength {
  if (typeof value !== 'string' || value.length < 8) return 'weak';
  let variety = 0;
  if (/[a-zа-я]/.test(value)) variety++;
  if (/[A-ZА-Я]/.test(value)) variety++;
  if (/[0-9]/.test(value)) variety++;
  if (/[^a-zA-Z0-9Ѐ-ӿ]/.test(value)) variety++;
  if (COMMON.has(value.toLowerCase())) return 'weak';
  if (value.length >= 12 && variety >= 3) return 'strong';
  if (value.length >= 10 && variety >= 2) return 'fair';
  return variety >= 3 ? 'fair' : 'weak';
}

// ---------------------------------------------------------------- reset links

/** A fresh reset token. Returned to the user once; only its hash is ever stored. */
export function newResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What goes in the database. A stolen dump must not contain working links, so the
 * token is hashed — the same reason a password is never stored as itself.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compares two hashes without letting the time taken reveal how much matched. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function resetExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_MINUTES * 60 * 1000);
}

/** A link works once, and only before it runs out. */
export function isResetTokenLive(
  row: { expires_at: Date | string; used_at: Date | string | null } | null | undefined,
  now: Date,
): boolean {
  if (!row) return false;
  if (row.used_at) return false;
  const expires = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() > now.getTime();
}

/**
 * Is this session still one of the current generation?
 *
 * Every token carries the version it was signed with. Changing or resetting a
 * password raises the account's version, so every token signed before that
 * moment stops being accepted — exactly, with no clock and no window.
 *
 * A token with no version at all predates this check and is treated as
 * generation 1, so existing sessions are not thrown out by the upgrade itself.
 */
export function isSessionCurrent(tokenVersion: unknown, accountVersion: unknown): boolean {
  const carried = Number(tokenVersion ?? 1);
  const current = Number(accountVersion ?? 1);
  if (!Number.isFinite(carried) || !Number.isFinite(current)) return false;
  return carried === current;
}
