// Run: npm test  (Node >= 22.6, no extra packages needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  canTransition,
  isKitchenStep,
} from '../src/domain/status.ts';
import { ValidationError, validateOrderInput, validateOutcome, validateRegistration } from '../src/domain/validation.ts';

const now = new Date('2026-11-05T10:00:00Z');
const base = {
  attemptId: 'attempt-1',
  deliveryAddress: ' Almaty, Abay 1 ',
  deliveryTime: 'ASAP',
  notes: '',
  items: [
    { itemId: 2, quantity: 1 },
    { itemId: 1, quantity: 2 },
  ],
};

test('status: CONFIRMED can never go back to PENDING', () => {
  assert.equal(canTransition('CONFIRMED', 'PENDING'), false);
  assert.equal(canTransition('CONFIRMED', 'PREPARING'), true);
});

test('status: kitchen may only take the next step', () => {
  assert.equal(isKitchenStep('CONFIRMED', 'PREPARING'), true);
  assert.equal(isKitchenStep('CONFIRMED', 'READY'), false); // skipped step
  assert.equal(isKitchenStep('READY', 'PREPARING'), false); // backwards
  assert.equal(isKitchenStep('PENDING', 'CONFIRMED'), false); // payment is not a kitchen action
  assert.equal(isKitchenStep('CONFIRMED', 'NOPE'), false);
});

test('status: final statuses have no way out', () => {
  for (const s of ['DELIVERED', 'CANCELLED', 'PAYMENT_REJECTED', 'EXPIRED'] as const) {
    assert.deepEqual(ALLOWED_TRANSITIONS[s], []);
  }
  assert.equal(ORDER_STATUSES.length, Object.keys(ALLOWED_TRANSITIONS).length);
});

test('order: valid input is normalised and sorted', () => {
  const r = validateOrderInput(base, now);
  assert.equal(r.deliveryAddress, 'Almaty, Abay 1');
  assert.equal(r.deliveryTime, null);
  assert.deepEqual(r.lines, [
    { itemId: 1, quantity: 2 },
    { itemId: 2, quantity: 1 },
  ]);
});

test('order: same details give the same hash, any change gives another', () => {
  const a = validateOrderInput(base, now).hash;
  const reordered = validateOrderInput({ ...base, items: [...base.items].reverse() }, now).hash;
  const changed = validateOrderInput({ ...base, items: [{ itemId: 1, quantity: 3 }] }, now).hash;
  assert.equal(a, reordered);
  assert.notEqual(a, changed);
});

test('order: empty cart, bad quantity, duplicate dish, bad id are rejected', () => {
  const bad = (patch: object) => assert.throws(() => validateOrderInput({ ...base, ...patch }, now), ValidationError);
  bad({ items: [] });
  bad({ items: [{ itemId: 1, quantity: 0 }] });
  bad({ items: [{ itemId: 1, quantity: 21 }] });
  bad({ items: [{ itemId: 1, quantity: 1.5 }] });
  bad({ items: [{ itemId: 1, quantity: 1 }, { itemId: 1, quantity: 2 }] });
  bad({ items: [{ itemId: '1', quantity: 1 }] });
  bad({ attemptId: '' });
  bad({ deliveryAddress: '   ' });
  bad({ notes: 'x'.repeat(301) });
});

test('order: delivery time must be ASAP or within the next 7 days', () => {
  const ok = validateOrderInput({ ...base, deliveryTime: '2026-11-06T12:00:00Z' }, now);
  assert.equal(ok.deliveryTime?.toISOString(), '2026-11-06T12:00:00.000Z');
  assert.throws(() => validateOrderInput({ ...base, deliveryTime: '2026-11-05T09:00:00Z' }, now), ValidationError); // past
  assert.throws(() => validateOrderInput({ ...base, deliveryTime: '2026-11-20T09:00:00Z' }, now), ValidationError); // too far
  assert.throws(() => validateOrderInput({ ...base, deliveryTime: 'tomorrow' }, now), ValidationError);
});

test('checkout outcome: only the four demo outcomes are accepted', () => {
  for (const o of ['success', 'rejected', 'timeout', 'lost_reply']) assert.equal(validateOutcome(o), o);
  assert.throws(() => validateOutcome('free-money'), ValidationError);
});

test('registration: valid and invalid input', () => {
  const ok = validateRegistration({
    fullName: 'Dana', email: 'Dana@Example.TEST', phone: '+7 700 000 00 00', address: 'Almaty', password: 'longenough1',
  });
  assert.equal(ok.email, 'dana@example.test');
  assert.throws(() => validateRegistration({ ...ok, email: 'nope' }), ValidationError);
  assert.throws(() => validateRegistration({ ...ok, phone: 'abc' }), ValidationError);
  assert.throws(() => validateRegistration({ ...ok, password: 'short' }), ValidationError);
  assert.throws(() => validateRegistration(null), ValidationError);
});
