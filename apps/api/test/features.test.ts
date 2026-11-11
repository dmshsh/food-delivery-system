// Validation of everything the new features accept from a browser:
// reviews, admin menu editing, the drag-and-drop order, blocking, and bonus points on an order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_COMMENT_LENGTH,
  ValidationError,
  validateAccess,
  validateFeedback,
  validateMenuItem,
  validateOrderInput,
  validateReorder,
  validateReply,
} from '../src/domain/validation.ts';

const now = new Date('2026-11-11T10:00:00Z');
const order = {
  attemptId: 'attempt-1',
  deliveryAddress: 'Almaty, Abay 1',
  deliveryTime: 'ASAP',
  notes: '',
  items: [{ itemId: 1, quantity: 2 }],
};

// ---------------------------------------------------------------- feedback

test('feedback: a whole star from 1 to 5 with an optional trimmed comment', () => {
  assert.deepEqual(validateFeedback({ rating: 5, comment: '  Hot and on time.  ' }), {
    rating: 5,
    comment: 'Hot and on time.',
  });
  assert.deepEqual(validateFeedback({ rating: 1 }), { rating: 1, comment: '' });
});

test('feedback: ratings outside 1-5, fractions and over-long comments are refused', () => {
  const bad = (value: unknown) => assert.throws(() => validateFeedback(value), ValidationError);
  bad({ rating: 0 });
  bad({ rating: 6 });
  bad({ rating: 4.5 });
  bad({ rating: '5' });
  bad({ rating: undefined });
  bad({ rating: 3, comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) });
  bad(null);
});

test('feedback: a reply must say something and stay within the limit', () => {
  assert.equal(validateReply({ reply: '  Thank you!  ' }), 'Thank you!');
  assert.throws(() => validateReply({ reply: '   ' }), ValidationError);
  assert.throws(() => validateReply({}), ValidationError);
  assert.throws(() => validateReply({ reply: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }), ValidationError);
});

// ------------------------------------------------------------- admin menu

test('menu item: valid input is trimmed, and the price must be whole tiyn in range', () => {
  const ok = validateMenuItem({
    name: '  Rice bowl  ',
    description: ' Warm rice. ',
    category: ' Meals ',
    priceTiyn: 180000,
    available: true,
  });
  assert.equal(ok.name, 'Rice bowl');
  assert.equal(ok.category, 'Meals');
  assert.equal(ok.priceTiyn, 180000);
  assert.equal(validateMenuItem({ ...ok, available: undefined }).available, true); // available by default
});

test('menu item: empty names, fractional, negative and absurd prices are refused', () => {
  const base = { name: 'Tea', description: 'Black tea.', category: 'Drinks', priceTiyn: 60000, available: true };
  const bad = (patch: object) => assert.throws(() => validateMenuItem({ ...base, ...patch }), ValidationError);
  bad({ name: '   ' });
  bad({ description: '' });
  bad({ category: '' });
  bad({ priceTiyn: -1 });
  bad({ priceTiyn: 1.5 });
  bad({ priceTiyn: '60000' });
  bad({ priceTiyn: 100_000_001 }); // a slipped zero
  bad({ available: 'yes' });
});

test('drag and drop: the new menu order is a list of distinct dish IDs', () => {
  assert.deepEqual(validateReorder({ ids: [3, 1, 2] }), [3, 1, 2]);
  const bad = (value: unknown) => assert.throws(() => validateReorder(value), ValidationError);
  bad({ ids: [] });
  bad({ ids: [1, 1, 2] }); // the same dish twice would claim two places
  bad({ ids: [1, 0] });
  bad({ ids: [1, -2] });
  bad({ ids: [1, 2.5] });
  bad({ ids: ['1', '2'] });
  bad({});
  bad(null);
});

// ----------------------------------------------------------- user access

test('access: blocking needs a written reason, unblocking does not', () => {
  assert.deepEqual(validateAccess({ action: 'block', reason: '  spam  ' }), { action: 'block', reason: 'spam' });
  assert.deepEqual(validateAccess({ action: 'unblock' }), { action: 'unblock', reason: '' });
  assert.throws(() => validateAccess({ action: 'block' }), ValidationError);
  assert.throws(() => validateAccess({ action: 'block', reason: '   ' }), ValidationError);
  assert.throws(() => validateAccess({ action: 'delete', reason: 'x' }), ValidationError);
  assert.throws(() => validateAccess({ action: 'block', reason: 'x'.repeat(201) }), ValidationError);
});

// ---------------------------------------------- bonus points on an order

test('order: bonus points default to none and must be a whole, non-negative number', () => {
  assert.equal(validateOrderInput(order, now).bonusPoints, 0);
  assert.equal(validateOrderInput({ ...order, bonusPoints: 150 }, now).bonusPoints, 150);
  const bad = (value: unknown) => assert.throws(() => validateOrderInput({ ...order, bonusPoints: value }, now), ValidationError);
  bad(-1);
  bad(1.5);
  bad('100');
  bad(1_000_001);
});

test('order: changing the points changes the fingerprint, so a retry cannot change the discount', () => {
  const plain = validateOrderInput(order, now).hash;
  const discounted = validateOrderInput({ ...order, bonusPoints: 100 }, now).hash;
  const other = validateOrderInput({ ...order, bonusPoints: 200 }, now).hash;
  assert.notEqual(plain, discounted);
  assert.notEqual(discounted, other);
  // The same request still gives the same fingerprint, which is what makes a retry safe.
  assert.equal(discounted, validateOrderInput({ ...order, bonusPoints: 100 }, now).hash);
});
