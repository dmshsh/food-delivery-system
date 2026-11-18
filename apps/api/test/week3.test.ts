// Registration language, the profile form, phone uniqueness and the history filters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrderStatus } from '../src/domain/status.ts';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  MAX_SEARCH_LENGTH,
  ValidationError,
  digitsOnly,
  isLanguage,
  isPhone,
  languageFromHeader,
  phoneDigits,
  validateEmail,
  validateHistoryFilter,
  validateLanguage,
  validatePasswordChange,
  validateProfile,
  validateRegistration,
  validateReset,
} from '../src/domain/validation.ts';

const registration = {
  fullName: 'Dana Student',
  email: 'Dana@Example.TEST',
  phone: '+7 700 000 00 00',
  address: 'Almaty, Abay 1',
  password: 'longenough1',
};

// ---------------------------------------------------------------- language

test('language: only the three the site speaks are accepted', () => {
  assert.deepEqual([...LANGUAGES], ['en', 'ru', 'kk']);
  for (const code of LANGUAGES) assert.equal(validateLanguage(code), code);
  assert.equal(isLanguage('fr'), false);
  assert.throws(() => validateLanguage('fr'), ValidationError);
  assert.throws(() => validateLanguage(undefined), ValidationError);
  assert.equal(DEFAULT_LANGUAGE, 'en');
});

test('language: a browser header is read, and anything unknown falls back to English', () => {
  assert.equal(languageFromHeader('ru-RU,ru;q=0.9,en;q=0.8'), 'ru');
  assert.equal(languageFromHeader('en-GB,en;q=0.9'), 'en');
  assert.equal(languageFromHeader('kk'), 'kk');
  assert.equal(languageFromHeader('kz'), 'kk'); // kz is the country, kk the language
  // The highest quality wins, not the first one listed.
  assert.equal(languageFromHeader('fr;q=0.9,ru;q=1.0'), 'ru');
  assert.equal(languageFromHeader('fr-FR,de;q=0.8'), 'en');
  assert.equal(languageFromHeader(undefined), 'en');
  assert.equal(languageFromHeader(42), 'en');
});

// ------------------------------------------------------------ registration

test('registration: the new language field defaults to English and is validated', () => {
  assert.equal(validateRegistration(registration).language, 'en');
  assert.equal(validateRegistration({ ...registration, language: 'kk' }).language, 'kk');
  assert.throws(() => validateRegistration({ ...registration, language: 'fr' }), ValidationError);
});

test('registration: the password is judged against the name and the email', () => {
  // Accepted on its own, refused for this person: "dana" is their own name.
  assert.throws(
    () => validateRegistration({ ...registration, password: 'dana12345' }),
    ValidationError,
  );
  assert.equal(validateRegistration(registration).email, 'dana@example.test'); // still normalised
});

// -------------------------------------------------------------- phone rules

test('phone: the same number written differently is the same number', () => {
  assert.equal(phoneDigits('+7 700 111 22 33'), '77001112233');
  assert.equal(phoneDigits('(770) 011-1223'), '7700111223');
  assert.equal(phoneDigits('77001112233'), '77001112233');
  // This reduction is what the unique index compares, so the two must agree.
  assert.equal(phoneDigits('+7 700 111 22 33'), phoneDigits('77001112233'));
  assert.equal(digitsOnly('order #42'), '42');
  assert.equal(digitsOnly(''), '');
});

test('phone: a number needs 7 to 15 digits, however it is punctuated', () => {
  assert.equal(isPhone('+7 700 000 00 00'), true);
  assert.equal(isPhone('7000000'), true);
  assert.equal(isPhone('123456'), false); // too few digits
  assert.equal(isPhone('+1 (234) 567-8901'), true);
  assert.equal(isPhone('abcdefgh'), false);
  assert.equal(isPhone('1234567890123456'), false); // too many digits
});

// ----------------------------------------------------------------- profile

test('profile: name, phone, address and language — and nothing else', () => {
  const ok = validateProfile({
    fullName: '  Dana  ',
    phone: '+7 700 000 00 00',
    address: '  Almaty  ',
    language: 'ru',
    // Sent by a hopeful client; must simply not appear in the result.
    role: 'ADMIN',
    email: 'someone-else@example.test',
    bonusPoints: 99999,
  });
  assert.deepEqual(ok, { fullName: 'Dana', phone: '+7 700 000 00 00', address: 'Almaty', language: 'ru' });
  assert.equal('role' in ok, false);
  assert.equal('email' in ok, false);
});

test('profile: a broken phone or an unknown language is refused', () => {
  const base = { fullName: 'Dana', phone: '+7 700 000 00 00', address: 'Almaty', language: 'en' };
  assert.throws(() => validateProfile({ ...base, phone: 'call me' }), ValidationError);
  assert.throws(() => validateProfile({ ...base, fullName: '   ' }), ValidationError);
  assert.throws(() => validateProfile({ ...base, language: 'fr' }), ValidationError);
  assert.throws(() => validateProfile(null), ValidationError);
});

// ------------------------------------------------------- password requests

test('password change: the current one is required and the new one must differ', () => {
  assert.deepEqual(validatePasswordChange({ currentPassword: 'old-one-1', newPassword: 'brandnew99' }), {
    currentPassword: 'old-one-1',
    newPassword: 'brandnew99',
  });
  assert.throws(
    () => validatePasswordChange({ currentPassword: 'samepass1', newPassword: 'samepass1' }),
    ValidationError,
  );
  assert.throws(() => validatePasswordChange({ newPassword: 'brandnew99' }), ValidationError);
  assert.throws(() => validatePasswordChange({ currentPassword: 'old-one-1', newPassword: 'weak' }), ValidationError);
});

test('password reset: the email form and the token form', () => {
  assert.equal(validateEmail({ email: '  Dana@Example.TEST ' }), 'dana@example.test');
  assert.throws(() => validateEmail({ email: 'not-an-email' }), ValidationError);
  assert.throws(() => validateEmail({}), ValidationError);

  const token = 'a'.repeat(40);
  assert.deepEqual(validateReset({ token, password: 'brandnew99' }), { token, password: 'brandnew99' });
  assert.throws(() => validateReset({ token: 'tiny', password: 'brandnew99' }), ValidationError);
  assert.throws(() => validateReset({ token, password: 'weak' }), ValidationError);
});

// ------------------------------------------------------ history filters

test('history: every filter is optional, and an empty one narrows nothing', () => {
  assert.deepEqual(validateHistoryFilter({}, isOrderStatus), {
    status: null,
    search: null,
    from: null,
    to: null,
  });
  assert.deepEqual(validateHistoryFilter({ status: '', search: '   ' }, isOrderStatus), {
    status: null,
    search: null,
    from: null,
    to: null,
  });
});

test('history: the search is trimmed and limited, and the status must be real', () => {
  assert.equal(validateHistoryFilter({ search: '  rice bowl  ' }, isOrderStatus).search, 'rice bowl');
  assert.equal(validateHistoryFilter({ status: 'DELIVERED' }, isOrderStatus).status, 'DELIVERED');
  assert.throws(() => validateHistoryFilter({ status: 'COOKED' }, isOrderStatus), ValidationError);
  assert.throws(
    () => validateHistoryFilter({ search: 'x'.repeat(MAX_SEARCH_LENGTH + 1) }, isOrderStatus),
    ValidationError,
  );
});

test('history: dates are parsed, and the range has to run forwards', () => {
  const filter = validateHistoryFilter({ from: '2026-11-01', to: '2026-11-19' }, isOrderStatus);
  assert.equal(filter.from?.toISOString().slice(0, 10), '2026-11-01');
  assert.equal(filter.to?.toISOString().slice(0, 10), '2026-11-19');
  assert.throws(() => validateHistoryFilter({ from: 'yesterday' }, isOrderStatus), ValidationError);
  assert.throws(
    () => validateHistoryFilter({ from: '2026-11-19', to: '2026-11-01' }, isOrderStatus),
    ValidationError,
  );
  // One side on its own is fine: "everything since the first" is a real question.
  assert.equal(validateHistoryFilter({ from: '2026-11-01' }, isOrderStatus).to, null);
});
