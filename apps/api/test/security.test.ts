// Sign-in limiting rules and the security journal's vocabulary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTEMPT_WINDOW_MINUTES,
  BLOCK_MINUTES,
  EVENT_SEVERITY,
  MAX_FAILED_ATTEMPTS,
  SECURITY_EVENTS,
  attemptsLeft,
  blockSecondsLeft,
  blockUntil,
  describeWait,
  isBlocked,
  isSecurityEventKind,
  shouldBlock,
  windowStart,
} from '../src/domain/security.ts';

const now = new Date('2026-11-11T10:00:00Z');

test('security: the fifth failure in the window blocks the account, the fourth does not', () => {
  assert.equal(MAX_FAILED_ATTEMPTS, 5);
  assert.equal(shouldBlock(4), false);
  assert.equal(shouldBlock(5), true);
  assert.equal(shouldBlock(9), true);
  assert.equal(shouldBlock(0), false);
});

test('security: the attempts shown to the user count down and stop at zero', () => {
  assert.equal(attemptsLeft(0), 5);
  assert.equal(attemptsLeft(3), 2);
  assert.equal(attemptsLeft(5), 0);
  assert.equal(attemptsLeft(12), 0); // never negative
});

test('security: a block lasts 15 minutes from the moment it is set', () => {
  assert.equal(BLOCK_MINUTES, 15);
  assert.equal(blockUntil(now).toISOString(), '2026-11-11T10:15:00.000Z');
});

test('security: failures are counted over the last 15 minutes only', () => {
  assert.equal(ATTEMPT_WINDOW_MINUTES, 15);
  assert.equal(windowStart(now).toISOString(), '2026-11-11T09:45:00.000Z');
  // An old failure falls outside the window, so it cannot block anyone later on.
  assert.ok(new Date('2026-11-11T09:30:00Z') < windowStart(now));
});

test('security: the wait left is read from the stored time, in any shape', () => {
  assert.equal(blockSecondsLeft(new Date('2026-11-11T10:05:00Z'), now), 300);
  assert.equal(blockSecondsLeft('2026-11-11T10:05:00.000Z', now), 300); // as the database returns it
  assert.equal(blockSecondsLeft(new Date('2026-11-11T09:55:00Z'), now), 0); // already over
  assert.equal(blockSecondsLeft(null, now), 0);
  assert.equal(blockSecondsLeft(undefined, now), 0);
  assert.equal(blockSecondsLeft('not a date', now), 0);
});

test('security: an account is blocked exactly while there is time left on it', () => {
  assert.equal(isBlocked(new Date('2026-11-11T10:00:01Z'), now), true);
  assert.equal(isBlocked(new Date('2026-11-11T10:00:00Z'), now), false); // the moment it runs out
  assert.equal(isBlocked(null, now), false);
});

test('security: the wait is described in words the user can act on', () => {
  assert.equal(describeWait(1), '1 second');
  assert.equal(describeWait(45), '45 seconds');
  assert.equal(describeWait(60), '60 seconds');
  assert.equal(describeWait(61), '2 minutes');
  assert.equal(describeWait(900), '15 minutes');
});

test('security: every journal event has a severity, and unknown kinds are refused', () => {
  for (const kind of SECURITY_EVENTS) {
    assert.ok(EVENT_SEVERITY[kind], `${kind} has no severity`);
    assert.ok(['INFO', 'WARNING', 'CRITICAL'].includes(EVENT_SEVERITY[kind]));
    assert.equal(isSecurityEventKind(kind), true);
  }
  // Blocks are the serious ones: they are what an administrator must notice.
  assert.equal(EVENT_SEVERITY.ACCOUNT_BLOCKED, 'CRITICAL');
  assert.equal(EVENT_SEVERITY.BLOCKED_LOGIN_ATTEMPT, 'CRITICAL');
  assert.equal(EVENT_SEVERITY.LOGIN_OK, 'INFO');
  assert.equal(isSecurityEventKind('DROP_TABLE'), false);
  assert.equal(isSecurityEventKind(42), false);
});
