// Password rules and the arithmetic of a reset link.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESET_TOKEN_MINUTES,
  hashResetToken,
  isResetTokenLive,
  isSessionCurrent,
  newResetToken,
  passwordStrength,
  resetExpiry,
  sameToken,
} from '../src/domain/password.ts';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  ValidationError,
  isCommonPassword,
  validatePassword,
} from '../src/domain/validation.ts';

const now = new Date('2026-11-19T10:00:00Z');

test('password: length alone is not enough, it needs a letter and a digit', () => {
  assert.equal(validatePassword('longenough1'), 'longenough1');
  assert.equal(validatePassword('StudentDemo123!'), 'StudentDemo123!');
  const bad = (value: unknown) => assert.throws(() => validatePassword(value), ValidationError);
  bad('short1');            // too short
  bad('alllettershere');    // no digit
  bad('1234567890');        // no letter
  bad(12345678);            // not a string
  bad('x'.repeat(MAX_PASSWORD_LENGTH + 1));
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test('password: the most common choices are refused outright', () => {
  for (const common of ['password1', 'qwerty123', 'admin123', 'abc12345']) {
    assert.throws(() => validatePassword(common), ValidationError, common);
    assert.equal(isCommonPassword(common), true);
  }
  assert.equal(isCommonPassword('verysafe99'), false);
});

test('password: it must not contain the owner\'s own name or email', () => {
  // The first thing anyone would try for alice@example.test.
  assert.throws(() => validatePassword('alice2026', { email: 'alice@example.test' }), ValidationError);
  assert.throws(() => validatePassword('Dana12345', { fullName: 'Dana Student' }), ValidationError);
  // A short fragment is not enough to refuse on: "ann" would reject half the dictionary.
  assert.equal(validatePassword('verysafe99', { email: 'ann@example.test', fullName: 'Ann Lee' }), 'verysafe99');
});

test('password: Cyrillic letters count as letters', () => {
  // The site is read in Russian and Kazakh, so a password written in Cyrillic
  // must not be refused for "having no letters".
  assert.equal(validatePassword('парольный1'), 'парольный1');
});

test('password: the strength meter agrees with what the rules accept', () => {
  assert.equal(passwordStrength('short'), 'weak');
  assert.equal(passwordStrength('password1'), 'weak'); // common, whatever its shape
  assert.equal(passwordStrength('longenough1'), 'fair');
  assert.equal(passwordStrength('Str0ng&Passphrase'), 'strong');
});

test('reset link: the token is random, and only its hash is ever stored', () => {
  const a = newResetToken();
  const b = newResetToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32);
  // The hash is what goes in the database, and it is not the token.
  const hash = hashResetToken(a);
  assert.notEqual(hash, a);
  assert.equal(hash, hashResetToken(a)); // same token, same hash: the lookup works
  assert.notEqual(hash, hashResetToken(b));
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('reset link: comparing hashes does not leak how much matched', () => {
  const hash = hashResetToken('token-a');
  assert.equal(sameToken(hash, hash), true);
  assert.equal(sameToken(hash, hashResetToken('token-b')), false);
  assert.equal(sameToken(hash, 'short'), false); // different lengths, no crash
});

test('reset link: it works once, and only before it expires', () => {
  const live = { expires_at: resetExpiry(now), used_at: null };
  assert.equal(isResetTokenLive(live, now), true);
  assert.equal(resetExpiry(now).toISOString(), '2026-11-19T10:30:00.000Z');
  assert.equal(RESET_TOKEN_MINUTES, 30);

  assert.equal(isResetTokenLive({ expires_at: now, used_at: null }, now), false); // the moment it runs out
  assert.equal(isResetTokenLive({ ...live, used_at: new Date() }, now), false); // already used
  assert.equal(isResetTokenLive({ expires_at: 'not a date', used_at: null }, now), false);
  assert.equal(isResetTokenLive(null, now), false);
  // As the database hands it back: a string, not a Date.
  assert.equal(isResetTokenLive({ expires_at: '2026-11-19T10:30:00.000Z', used_at: null }, now), true);
});

test('session: a token from an earlier generation is refused', () => {
  // Changing a password raises the account's version. Every token carries the
  // version it was signed with, so the comparison is exact: no clock, and no
  // window in which an old session still works.
  assert.equal(isSessionCurrent(3, 3), true);
  assert.equal(isSessionCurrent(2, 3), false);
  assert.equal(isSessionCurrent(4, 3), false); // a version from the future is not ours either

  // A token issued before this check existed carries no version, and counts as
  // the first generation, so the upgrade does not sign everybody out.
  assert.equal(isSessionCurrent(undefined, 1), true);
  assert.equal(isSessionCurrent(undefined, 2), false);

  // Anything unreadable is refused rather than waved through.
  assert.equal(isSessionCurrent('two', 2), false);
  assert.equal(isSessionCurrent(2, 'two'), false);
});
