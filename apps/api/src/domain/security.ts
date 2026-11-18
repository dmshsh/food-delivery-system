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
  'IP_BLOCKED',
  'IP_UNBLOCKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_USED',
  'PROFILE_UPDATED',
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
  IP_BLOCKED: 'CRITICAL',
  IP_UNBLOCKED: 'WARNING',
  // Changing a password is ordinary; being sent a reset link, or using one, is
  // the moment an account can be taken over, so both are worth a warning.
  PASSWORD_CHANGED: 'WARNING',
  PASSWORD_RESET_REQUESTED: 'WARNING',
  PASSWORD_RESET_USED: 'CRITICAL',
  PROFILE_UPDATED: 'INFO',
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

// ---------------------------------------------------------------------------
// Blocking by address.
//
// Blocking an account stops an attack aimed at one person. It does nothing
// against someone working through a list of accounts from the same machine:
// each account collects one or two failures, none reaches five, and the attempt
// runs for as long as it likes. Counting failures per address closes that, so
// the two limits sit side by side and cover different attacks.
// ---------------------------------------------------------------------------

/** Failed sign-ins from one address, across all accounts, before the address is blocked. */
export const MAX_IP_FAILURES = 15;

/** The window those failures are counted in. */
export const IP_WINDOW_MINUTES = 15;

/** How long an automatic address block lasts: longer than an account block, since it follows a broader attempt. */
export const IP_BLOCK_MINUTES = 60;

export function shouldBlockIp(failuresInWindow: number): boolean {
  return failuresInWindow >= MAX_IP_FAILURES;
}

export function ipBlockUntil(now: Date): Date {
  return new Date(now.getTime() + IP_BLOCK_MINUTES * 60 * 1000);
}

export function ipWindowStart(now: Date): Date {
  return new Date(now.getTime() - IP_WINDOW_MINUTES * 60 * 1000);
}

/**
 * Is this address blocked right now?
 *
 * A manual block has no end time and lasts until an administrator lifts it; an
 * automatic one carries the moment it runs out. A row with neither is not a block.
 */
export function isIpBlocked(
  row: { manual?: boolean; blocked_until?: Date | string | null } | null | undefined,
  now: Date,
): boolean {
  if (!row) return false;
  if (row.manual) return true;
  return blockSecondsLeft(row.blocked_until ?? null, now) > 0;
}

/**
 * Addresses that are never blocked.
 *
 * Behind the Next.js proxy every request arrives from the proxy itself, so in a
 * single-machine deployment one blocked address would lock out everybody. The
 * loopback addresses are therefore counted but never blocked. A real deployment
 * puts the true client address in X-Forwarded-For, and those are blocked normally.
 */
const NEVER_BLOCKED = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', '']);

export function isBlockableIp(ip: string): boolean {
  return !NEVER_BLOCKED.has((ip ?? '').trim().toLowerCase());
}
