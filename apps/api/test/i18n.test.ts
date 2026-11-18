// The three translations, checked against each other.
//
// These read the web app's dictionary file directly. It has no imports of its
// own, so it can be loaded from here without pulling in React or Next.js, and
// a missing or broken translation is caught by `npm test` rather than by
// someone opening the site in Kazakh and finding English in the middle of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DICTIONARIES,
  LANGUAGES,
  LANGUAGE_NAMES,
  translate,
  type MessageKey,
} from '../../web/src/i18n/dictionaries.ts';

/** Every `{placeholder}` a string expects. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

test('i18n: every language carries every key, with nothing left over', () => {
  const englishKeys = Object.keys(DICTIONARIES.en).sort();
  assert.ok(englishKeys.length > 150, `expected a full dictionary, found ${englishKeys.length} keys`);

  for (const language of LANGUAGES) {
    const keys = Object.keys(DICTIONARIES[language]).sort();
    const missing = englishKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !englishKeys.includes(k));
    assert.deepEqual(missing, [], `${language} is missing: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${language} has keys English does not: ${extra.join(', ')}`);
  }
});

test('i18n: no translation is left empty or left in English by accident', () => {
  for (const language of LANGUAGES) {
    for (const [key, text] of Object.entries(DICTIONARIES[language])) {
      assert.ok(text.trim().length > 0, `${language}.${key} is empty`);
    }
  }
  // A spot check that the other two are genuinely translated, not copied.
  assert.notEqual(DICTIONARIES.ru['nav.orders'], DICTIONARIES.en['nav.orders']);
  assert.notEqual(DICTIONARIES.kk['nav.orders'], DICTIONARIES.en['nav.orders']);
  assert.notEqual(DICTIONARIES.ru['checkout.title'], DICTIONARIES.kk['checkout.title']);
});

test('i18n: a translation never loses or invents a placeholder', () => {
  // "{count} orders" translated without its {count} would show a sentence with
  // a hole in it; one with an invented {total} would print the word unchanged.
  for (const language of LANGUAGES) {
    for (const key of Object.keys(DICTIONARIES.en) as MessageKey[]) {
      assert.deepEqual(
        placeholders(DICTIONARIES[language][key]),
        placeholders(DICTIONARIES.en[key]),
        `${language}.${key} does not use the same placeholders as English`,
      );
    }
  }
});

test('i18n: looking a message up fills its placeholders and falls back to English', () => {
  assert.equal(translate('en', 'checkout.orderNumber', { id: 42 }), 'Order #42');
  assert.equal(translate('ru', 'checkout.orderNumber', { id: 42 }), 'Заказ №42');
  assert.ok(translate('kk', 'checkout.orderNumber', { id: 42 }).includes('42'));

  // A placeholder with no value is left as it is rather than printed as "undefined".
  assert.equal(translate('en', 'checkout.orderNumber', {}), 'Order #{id}');
  // An unknown language falls back to English instead of showing the key.
  assert.equal(translate('fr' as 'en', 'nav.menu'), 'Menu');
});

test('i18n: every status and role a page can show has a label in all three languages', () => {
  const statuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED', 'PAYMENT_REJECTED', 'EXPIRED'];
  const roles = ['CUSTOMER', 'KITCHEN', 'ACCOUNTANT', 'ADMIN'];
  for (const language of LANGUAGES) {
    for (const status of statuses) {
      const key = `status.${status}` as MessageKey;
      assert.ok(DICTIONARIES[language][key], `${language} has no label for ${status}`);
    }
    for (const role of roles) {
      const key = `role.${role}` as MessageKey;
      assert.ok(DICTIONARIES[language][key], `${language} has no label for ${role}`);
    }
    assert.ok(LANGUAGE_NAMES[language], `${language} has no name of its own`);
  }
});
