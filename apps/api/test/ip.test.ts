// Blocking by address: the limit that catches a sweep across many accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IP_BLOCK_MINUTES,
  IP_WINDOW_MINUTES,
  MAX_FAILED_ATTEMPTS,
  MAX_IP_FAILURES,
  ipBlockUntil,
  ipWindowStart,
  isBlockableIp,
  isIpBlocked,
  shouldBlockIp,
} from '../src/domain/security.ts';

const now = new Date('2026-11-19T10:00:00Z');

test('address: fifteen failures from one machine block it, fourteen do not', () => {
  assert.equal(MAX_IP_FAILURES, 15);
  assert.equal(shouldBlockIp(14), false);
  assert.equal(shouldBlockIp(15), true);
  assert.equal(shouldBlockIp(0), false);
});

test('address: its limit is looser than the account limit, and that is the point', () => {
  // An attacker spreading five guesses over twenty accounts never trips the
  // account limit, which is why the address limit exists; it is set higher so
  // one household sharing an address is not blocked by ordinary mistakes.
  assert.ok(MAX_IP_FAILURES > MAX_FAILED_ATTEMPTS);
  assert.ok(IP_BLOCK_MINUTES >= 60);
});

test('address: the block lasts an hour and failures are counted over fifteen minutes', () => {
  assert.equal(ipBlockUntil(now).toISOString(), '2026-11-19T11:00:00.000Z');
  assert.equal(ipWindowStart(now).toISOString(), '2026-11-19T09:45:00.000Z');
  assert.equal(IP_WINDOW_MINUTES, 15);
});

test('address: a manual block has no end, an automatic one runs out', () => {
  assert.equal(isIpBlocked({ manual: true, blocked_until: null }, now), true);
  assert.equal(isIpBlocked({ manual: false, blocked_until: '2026-11-19T10:30:00.000Z' }, now), true);
  assert.equal(isIpBlocked({ manual: false, blocked_until: '2026-11-19T09:30:00.000Z' }, now), false);
  assert.equal(isIpBlocked({ manual: false, blocked_until: null }, now), false);
  assert.equal(isIpBlocked(null, now), false);
});

test('address: the server\'s own address is never blocked', () => {
  // Behind the site's proxy every request appears to come from loopback, so
  // blocking it would lock out every visitor at once, administrator included.
  assert.equal(isBlockableIp('127.0.0.1'), false);
  assert.equal(isBlockableIp('::1'), false);
  assert.equal(isBlockableIp('::ffff:127.0.0.1'), false);
  assert.equal(isBlockableIp('localhost'), false);
  assert.equal(isBlockableIp(''), false);
  assert.equal(isBlockableIp('  '), false);
  assert.equal(isBlockableIp('203.0.113.42'), true);
  assert.equal(isBlockableIp('2001:db8::1'), true);
});
