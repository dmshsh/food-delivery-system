// Sign-in limiting rules and the kinds of event the security journal records.
// Pure functions, no framework and no database imports.

/** Failed sign-ins allowed inside one window before the account is blocked. */
export const MAX_FAILED_ATTEMPTS = 5;

/** The window the failures are counted in. */
export const ATTEMPT_WINDOW_MINUTES = 15;

/** How long the automatic block lasts. */
export const BLOCK_MINUTES = 15;

/** A warning is shown to the user from this many failures on ("2 attempts left"). */
export const WARN_FROM_ATTEMPT = 3;

/** Every kind of line the security journal can hold. */
export const SECURITY_EVENTS = [
  'LOGIN_OK',
  'LOGIN_FAILED',
  'ACCOUNT_BLOCKED',
  'BLOCKED_LOGIN_ATTEMPT',
  'ACCOUNT_UNBLOCKED',
  'LOGOUT',
  'REGISTERED',
  'ROLE_DENIED',
  'ADMIN_ACTION',
] as const;
export type SecurityEventKind = (typeof SECURITY_EVENTS)[number];

export const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** How serious each kind of event is, for filtering and colouring the journal. */
export const EVENT_SEVERITY: Record<SecurityEventKind, Severity> = {
  LOGIN_OK: 'INFO',
  LOGOUT: 'INFO',
  REGISTERED: 'INFO',
  LOGIN_FAILED: 'WARNING',
  ROLE_DENIED: 'WARNING',
  ADMIN_ACTION: 'WARNING',
  ACCOUNT_UNBLOCKED: 'WARNING',
  ACCOUNT_BLOCKED: 'CRITICAL',
  BLOCKED_LOGIN_ATTEMPT: 'CRITICAL',
};

export function isSecurityEventKind(value: unknown): value is SecurityEventKind {
  return typeof value === 'string' && (SECURITY_EVENTS as readonly string[]).includes(value);
}

/** The 5th failure inside the window blocks the account. */
export function shouldBlock(failuresInWindow: number): boolean {
  return failuresInWindow >= MAX_FAILED_ATTEMPTS;
}

/** Failures left before the block, for the message shown to the user. */
export function attemptsLeft(failuresInWindow: number): number {
  return Math.max(0, MAX_FAILED_ATTEMPTS - failuresInWindow);
}

/** When an account blocked now may sign in again. */
export function blockUntil(now: Date): Date {
  return new Date(now.getTime() + BLOCK_MINUTES * 60 * 1000);
}

/** Start of the window the failures are counted in. */
export function windowStart(now: Date): Date {
  return new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
}

/** Seconds left on a block; 0 when there is none or it has already run out. */
export function blockSecondsLeft(blockedUntil: Date | string | null | undefined, now: Date): number {
  if (!blockedUntil) return 0;
  const until = blockedUntil instanceof Date ? blockedUntil : new Date(blockedUntil);
  if (Number.isNaN(until.getTime())) return 0;
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

export function isBlocked(blockedUntil: Date | string | null | undefined, now: Date): boolean {
  return blockSecondsLeft(blockedUntil, now) > 0;
}

/** "14 minutes" / "45 seconds": the wait as the user is told it. */
export function describeWait(seconds: number): string {
  if (seconds <= 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
