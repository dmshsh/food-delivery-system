// Bonus point rules. Run: npm test  (Node >= 22.6, no extra packages needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARN_RATE,
  MAX_REDEEM_SHARE,
  POINT_TIYN,
  applicablePoints,
  maxRedeemablePoints,
  pointsEarned,
  settle,
} from '../src/domain/bonus.ts';

test('bonus: an approved payment earns 5% of the money paid, rounded down', () => {
  assert.equal(pointsEarned(510000), 255); // 5,100 KZT -> 255 points
  assert.equal(pointsEarned(100000), 50);
  assert.equal(pointsEarned(1900), 0); // 19 KZT: less than one whole point, so nothing
  assert.equal(EARN_RATE, 0.05);
});

test('bonus: nothing is earned from a payment that is zero, negative or not a number', () => {
  assert.equal(pointsEarned(0), 0);
  assert.equal(pointsEarned(-510000), 0);
  assert.equal(pointsEarned(Number.NaN), 0);
  assert.equal(pointsEarned(Number.POSITIVE_INFINITY), 0);
});

test('bonus: points may cover at most 30% of an order', () => {
  // 5,100 KZT -> 30% is 1,530 KZT -> 1,530 points, even though the customer holds far more.
  assert.equal(maxRedeemablePoints(510000, 100000), 1530);
  assert.equal(MAX_REDEEM_SHARE, 0.3);
  assert.equal(maxRedeemablePoints(0, 500), 0); // an empty order can use nothing
});

test('bonus: a customer can never spend more points than they hold', () => {
  assert.equal(maxRedeemablePoints(510000, 100), 100);
  assert.equal(maxRedeemablePoints(510000, 0), 0);
  assert.equal(maxRedeemablePoints(510000, -50), 0); // a broken balance never becomes a discount
});

test('bonus: the applied discount is the smallest of request, balance and the 30% cap', () => {
  assert.equal(applicablePoints(100, 510000, 100000), 100); // the request is the smallest
  assert.equal(applicablePoints(5000, 510000, 100000), 1530); // the cap is the smallest
  assert.equal(applicablePoints(5000, 510000, 90), 90); // the balance is the smallest
  assert.equal(applicablePoints(0, 510000, 100), 0);
  assert.equal(applicablePoints(-5, 510000, 100), 0);
  assert.equal(applicablePoints(1.5, 510000, 100), 0); // half a point does not exist
});

test('bonus: settle keeps discount, amount to pay and new balance in agreement', () => {
  const r = settle(510000, 1000, 2000);
  assert.equal(r.pointsSpent, 1000);
  assert.equal(r.discountTiyn, 1000 * POINT_TIYN);
  assert.equal(r.payableTiyn, 510000 - 100000);
  assert.equal(r.pointsEarned, pointsEarned(r.payableTiyn));
  assert.equal(r.balanceAfter, 2000 - r.pointsSpent + r.pointsEarned);
  assert.ok(r.payableTiyn >= 0);
});

test('bonus: points cannot create themselves, because only money paid earns them', () => {
  // Pay an order entirely with points as far as the rules allow, then check the balance fell.
  const balance = 10000;
  const total = 510000;
  const r = settle(total, balance, balance);
  assert.ok(r.pointsSpent > 0);
  assert.ok(r.pointsEarned < r.pointsSpent, 'an order must never return more points than it takes');
  assert.ok(r.balanceAfter < balance);
  // And the part paid with points earns nothing: earning counts the payable part only.
  assert.equal(r.pointsEarned, pointsEarned(total - r.discountTiyn));
});
