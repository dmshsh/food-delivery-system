// End-to-end checks for the week-2 features, against a RUNNING API.
//   1) npm run db:up   2) npm run dev:api   3) npm run test:e2e
// Covers: the admin panel, drag-and-drop menu order, bonus points, reviews,
// and the sign-in limit with its security journal.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const PASSWORD = 'StudentDemo123!';

/** A tiny HTTP client with its own cookie jar, so each "user" has a separate session. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const line of set) {
      const pair = line.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

/** Registers a brand-new customer, so balances and counters start from zero. */
async function newCustomer(label) {
  const c = client();
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
  const r = await c('POST', '/auth/register', {
    fullName: `E2E ${label}`,
    email,
    phone: '+7 700 111 22 33',
    address: 'Almaty, Abay 1',
    password: 'longenough1',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { call: c, email };
}

const admin = client();
const kitchen = client();
const accountant = client();

console.log(`E2E (week-2 features) against ${API}`);

await check('the seeded administrator can sign in', async () => {
  const r = await admin('POST', '/auth/login', { email: 'admin@example.test', password: PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'ADMIN');
  assert.equal((await kitchen('POST', '/auth/login', { email: 'kitchen@example.test', password: PASSWORD })).status, 200);
  assert.equal((await accountant('POST', '/auth/login', { email: 'accounts@example.test', password: PASSWORD })).status, 200);
});

await check('the admin panel is closed to every other role, and the refusal is recorded', async () => {
  const { call: customer } = await newCustomer('denied');
  for (const path of ['/admin/overview', '/admin/menu', '/admin/users', '/admin/security']) {
    assert.equal((await customer('GET', path)).status, 403, path);
  }
  assert.equal((await kitchen('GET', '/admin/users')).status, 403);
  assert.equal((await accountant('GET', '/admin/menu')).status, 403);
  assert.equal((await client()('GET', '/admin/overview')).status, 401); // a guest is not even signed in

  const journal = await admin('GET', '/admin/security?kind=ROLE_DENIED');
  assert.equal(journal.status, 200);
  assert.ok(journal.data.events.some((e) => e.detail.includes('/api/admin/')), 'the refusal is missing from the journal');
});

await check('admin overview answers with the numbers the dashboard shows', async () => {
  const r = await admin('GET', '/admin/overview');
  assert.equal(r.status, 200);
  assert.ok(r.data.users.total >= 5);
  assert.ok(typeof r.data.orders.total === 'number');
  assert.ok(typeof r.data.money.approvedTotalTiyn === 'number');
  assert.ok(typeof r.data.security.criticalLast24h === 'number');
});

let dishId;
await check('admin can add a dish, edit it, and the public menu follows', async () => {
  const created = await admin('POST', '/admin/menu', {
    name: 'E2E salad',
    description: 'Only here for the test.',
    category: 'Meals',
    priceTiyn: 90000,
    available: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  dishId = created.data.item.id;

  const edited = await admin('PATCH', `/admin/menu/${dishId}`, {
    name: 'E2E salad',
    description: 'Edited by the test.',
    category: 'Meals',
    priceTiyn: 95000,
    available: true,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.item.priceTiyn, 95000);

  const publicMenu = await client()('GET', '/menu');
  const shown = publicMenu.data.items.find((i) => i.id === dishId);
  assert.ok(shown, 'the new dish is not on the public menu');
  assert.equal(shown.priceTiyn, 95000);
});

await check('admin rejects a dish with a broken price or an empty name (400)', async () => {
  const base = { name: 'Bad', description: 'd', category: 'c', priceTiyn: 1000, available: true };
  assert.equal((await admin('POST', '/admin/menu', { ...base, priceTiyn: -1 })).status, 400);
  assert.equal((await admin('POST', '/admin/menu', { ...base, priceTiyn: 1.5 })).status, 400);
  assert.equal((await admin('POST', '/admin/menu', { ...base, name: '   ' })).status, 400);
});

await check('drag and drop: the new menu order is saved and shown to everyone', async () => {
  const before = (await admin('GET', '/admin/menu')).data.items.map((i) => i.id);
  assert.ok(before.length >= 3);
  // Move the last dish to the front, the way dropping a card at the top does.
  const moved = [before[before.length - 1], ...before.slice(0, -1)];
  const r = await admin('PATCH', '/admin/menu/reorder', { ids: moved });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.items.map((i) => i.id), moved);

  // Guests see the same arrangement (hidden dishes aside).
  const publicIds = (await client()('GET', '/menu')).data.items.map((i) => i.id);
  const expected = moved.filter((id) => publicIds.includes(id));
  assert.deepEqual(publicIds, expected);

  // Put it back, so running the test twice does not slowly shuffle the menu.
  await admin('PATCH', '/admin/menu/reorder', { ids: before });
});

await check('drag and drop: a list with a repeat or an unknown dish is refused (400)', async () => {
  const ids = (await admin('GET', '/admin/menu')).data.items.map((i) => i.id);
  assert.equal((await admin('PATCH', '/admin/menu/reorder', { ids: [ids[0], ids[0]] })).status, 400);
  assert.equal((await admin('PATCH', '/admin/menu/reorder', { ids: [] })).status, 400);
  assert.equal((await admin('PATCH', '/admin/menu/reorder', { ids: [999999] })).status, 400);
  // ...and the menu is untouched afterwards.
  assert.deepEqual((await admin('GET', '/admin/menu')).data.items.map((i) => i.id), ids);
});

await check('a dish nobody ordered is deleted outright', async () => {
  const r = await admin('DELETE', `/admin/menu/${dishId}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.removed, true);
  assert.ok(!(await admin('GET', '/admin/menu')).data.items.some((i) => i.id === dishId));
});

// ------------------------------------------------------------------- bonus

const menu = (await client()('GET', '/menu')).data.items;
const rice = menu.find((m) => m.name === 'Rice bowl');
assert.ok(rice, 'the seeded "Rice bowl" is missing');

const buyer = await newCustomer('bonus');
const draft = (quantity, bonusPoints = 0) => ({
  attemptId: randomUUID(),
  deliveryAddress: 'Almaty, Abay 1',
  deliveryTime: 'ASAP',
  notes: '',
  bonusPoints,
  items: [{ itemId: rice.id, quantity }],
});

let earnedFirst = 0;
let firstOrderId;
await check('a new customer starts at zero points and earns 5% of an approved payment', async () => {
  const start = await buyer.call('GET', '/bonus');
  assert.equal(start.status, 200);
  assert.equal(start.data.balance, 0);
  assert.equal(start.data.rules.earnPercent, 5);
  assert.equal(start.data.rules.maxRedeemPercent, 30);

  const created = await buyer.call('POST', '/orders', draft(2)); // 2 x 1,800 KZT = 3,600 KZT
  assert.equal(created.status, 201, JSON.stringify(created.data));
  firstOrderId = created.data.order.id;
  const total = created.data.order.totalTiyn;

  const paid = await buyer.call('POST', `/orders/${firstOrderId}/checkout`, { outcome: 'success' });
  assert.equal(paid.data.order.status, 'CONFIRMED');
  earnedFirst = Math.floor((total * 0.05) / 100);
  assert.equal(paid.data.order.bonusEarned, earnedFirst);

  const after = await buyer.call('GET', '/bonus');
  assert.equal(after.data.balance, earnedFirst);
  assert.ok(after.data.history.some((h) => h.kind === 'EARNED' && h.points === earnedFirst));
});

await check('points pay part of the next order and leave the balance', async () => {
  const total = rice.priceTiyn; // one bowl
  const spend = Math.min(earnedFirst, Math.floor((total * 0.3) / 100));
  const created = await buyer.call('POST', '/orders', draft(1, spend));
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const order = created.data.order;
  assert.equal(order.bonusRequested, spend);
  assert.equal(order.discountTiyn, spend * 100);
  assert.equal(order.payableTiyn, total - spend * 100);
  // Nothing has left the balance yet: the payment has not happened.
  assert.equal((await buyer.call('GET', '/bonus')).data.balance, earnedFirst);

  const paid = await buyer.call('POST', `/orders/${order.id}/checkout`, { outcome: 'success' });
  assert.equal(paid.data.order.status, 'CONFIRMED');
  assert.equal(paid.data.order.bonusSpent, spend);
  const earnedSecond = Math.floor(((total - spend * 100) * 0.05) / 100);
  assert.equal(paid.data.order.bonusEarned, earnedSecond);
  assert.equal((await buyer.call('GET', '/bonus')).data.balance, earnedFirst - spend + earnedSecond);
});

await check('asking for more points than allowed is refused and saves no order (400)', async () => {
  const before = (await buyer.call('GET', '/orders')).data.orders.length;
  const tooMany = await buyer.call('POST', '/orders', draft(1, 1000000));
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.data.code, 'bonus_too_high');
  // The 30% cap bites even when the balance would cover it.
  const overCap = await buyer.call('POST', '/orders', draft(1, 999));
  assert.equal(overCap.status, 400);
  assert.equal((await buyer.call('GET', '/orders')).data.orders.length, before, 'a refused order was still saved');
});

await check('a rejected payment costs no points at all', async () => {
  const balanceBefore = (await buyer.call('GET', '/bonus')).data.balance;
  const spend = Math.min(balanceBefore, Math.floor((rice.priceTiyn * 0.3) / 100));
  const order = (await buyer.call('POST', '/orders', draft(1, spend))).data.order;
  const rejected = await buyer.call('POST', `/orders/${order.id}/checkout`, { outcome: 'rejected' });
  assert.equal(rejected.data.order.status, 'PAYMENT_REJECTED');
  assert.equal(rejected.data.order.bonusSpent, 0);
  assert.equal((await buyer.call('GET', '/bonus')).data.balance, balanceBefore);
});

await check('the bonus account is the customer\'s own: staff have none', async () => {
  assert.equal((await kitchen('GET', '/bonus')).status, 403);
  assert.equal((await admin('GET', '/bonus')).status, 403);
  assert.equal((await client()('GET', '/bonus')).status, 401);
});

// ---------------------------------------------------------------- feedback

await check('a review is refused until the order has been delivered', async () => {
  const r = await buyer.call('POST', `/orders/${firstOrderId}/feedback`, { rating: 5, comment: 'Too early' });
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'not_delivered');
});

await check('once delivered, the customer may review the order exactly once', async () => {
  for (const status of ['PREPARING', 'READY', 'DELIVERED']) {
    const step = await kitchen('PATCH', `/orders/${firstOrderId}/status`, { status });
    assert.equal(step.status, 200, `${status}: ${JSON.stringify(step.data)}`);
  }
  const first = await buyer.call('POST', `/orders/${firstOrderId}/feedback`, { rating: 4, comment: 'Warm and on time.' });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.order.feedback.rating, 4);

  const second = await buyer.call('POST', `/orders/${firstOrderId}/feedback`, { rating: 1, comment: 'Changed my mind' });
  assert.equal(second.status, 409);
  assert.equal(second.data.code, 'feedback_exists');
});

await check('a review with a rating outside 1-5 is refused (400)', async () => {
  for (const rating of [0, 6, 2.5, '5', null]) {
    const r = await buyer.call('POST', `/orders/${firstOrderId}/feedback`, { rating });
    assert.equal(r.status, 400, `rating ${rating} was accepted`);
  }
});

await check('nobody can review somebody else\'s order (403)', async () => {
  const stranger = await newCustomer('stranger');
  const r = await stranger.call('POST', `/orders/${firstOrderId}/feedback`, { rating: 1 });
  assert.equal(r.status, 403);
});

await check('admin and accountant read the reviews; the kitchen and customers do not', async () => {
  const list = await admin('GET', '/feedback');
  assert.equal(list.status, 200);
  assert.ok(list.data.summary.count >= 1);
  assert.ok(list.data.summary.average >= 1 && list.data.summary.average <= 5);
  assert.ok(list.data.feedback.some((f) => f.orderId === firstOrderId));
  assert.equal((await accountant('GET', '/feedback')).status, 200);
  assert.equal((await kitchen('GET', '/feedback')).status, 403);
  assert.equal((await buyer.call('GET', '/feedback')).status, 403);

  const filtered = await admin('GET', '/feedback?rating=4');
  assert.ok(filtered.data.feedback.every((f) => f.rating === 4));
});

await check('the admin replies and the customer sees the answer under their order', async () => {
  const mine = (await admin('GET', '/feedback')).data.feedback.find((f) => f.orderId === firstOrderId);
  const reply = await admin('POST', `/feedback/${mine.id}/reply`, { reply: 'Thank you for ordering with us!' });
  assert.equal(reply.status, 200);
  assert.equal((await admin('POST', `/feedback/${mine.id}/reply`, { reply: '   ' })).status, 400);
  assert.equal((await accountant('POST', `/feedback/${mine.id}/reply`, { reply: 'no' })).status, 403);

  const order = (await buyer.call('GET', `/orders/${firstOrderId}`)).data.order;
  assert.equal(order.feedback.reply, 'Thank you for ordering with us!');
});

// ---------------------------------------------------------------- security

await check('five wrong passwords block the account, and the sixth try is refused outright', async () => {
  const victim = await newCustomer('blocked');
  const guess = client();
  for (let i = 1; i <= 4; i++) {
    const r = await guess('POST', '/auth/login', { email: victim.email, password: `wrong-${i}` });
    assert.equal(r.status, 401, `attempt ${i} should still be an ordinary refusal`);
  }
  const fifth = await guess('POST', '/auth/login', { email: victim.email, password: 'wrong-5' });
  assert.equal(fifth.status, 403, JSON.stringify(fifth.data));
  assert.equal(fifth.data.code, 'account_blocked');

  // Even the RIGHT password is refused while the block lasts.
  const correct = await guess('POST', '/auth/login', { email: victim.email, password: 'longenough1' });
  assert.equal(correct.status, 403);
  assert.equal(correct.data.code, 'account_blocked');
  assert.ok(correct.data.retryAfterSeconds > 0);

  victim.blocked = true;
  globalThis.__victim = victim;
});

await check('the block is written to the security journal and shown in the user list', async () => {
  const victim = globalThis.__victim;
  const journal = await admin('GET', '/admin/security?severity=CRITICAL');
  assert.equal(journal.status, 200);
  assert.ok(
    journal.data.events.some((e) => e.kind === 'ACCOUNT_BLOCKED' && e.email === victim.email),
    'the block is missing from the journal',
  );
  assert.ok(journal.data.last24h.CRITICAL >= 1);

  const users = (await admin('GET', '/admin/users')).data.users;
  const row = users.find((u) => u.email === victim.email);
  assert.ok(row, 'the blocked user is missing from the admin user list');
  assert.ok(row.blockedUntil !== null);
  assert.ok(row.failedAttempts >= 5);
});

await check('the admin lifts the block and the customer can sign in again', async () => {
  const victim = globalThis.__victim;
  const row = (await admin('GET', '/admin/users')).data.users.find((u) => u.email === victim.email);
  const lifted = await admin('PATCH', `/admin/users/${row.id}/access`, { action: 'unblock', reason: 'checked by hand' });
  assert.equal(lifted.status, 200, JSON.stringify(lifted.data));

  const back = await client()('POST', '/auth/login', { email: victim.email, password: 'longenough1' });
  assert.equal(back.status, 200, JSON.stringify(back.data));

  const journal = await admin('GET', '/admin/security?kind=ACCOUNT_UNBLOCKED');
  assert.ok(journal.data.events.some((e) => e.email === victim.email));
});

await check('a correct password clears the counter, so four mistakes never add up to a block', async () => {
  const user = await newCustomer('counter');
  const guess = client();
  for (let i = 1; i <= 4; i++) {
    assert.equal((await guess('POST', '/auth/login', { email: user.email, password: 'nope' })).status, 401);
  }
  assert.equal((await guess('POST', '/auth/login', { email: user.email, password: 'longenough1' })).status, 200);
  // The window has been wiped: four more mistakes are still only four.
  for (let i = 1; i <= 4; i++) {
    assert.equal((await guess('POST', '/auth/login', { email: user.email, password: 'nope' })).status, 401, `after reset, attempt ${i}`);
  }
});

await check('an admin block stops a session that is already open', async () => {
  const user = await newCustomer('session');
  assert.equal((await user.call('GET', '/auth/me')).status, 200);

  const row = (await admin('GET', '/admin/users')).data.users.find((u) => u.email === user.email);
  const blocked = await admin('PATCH', `/admin/users/${row.id}/access`, { action: 'block', reason: 'e2e test' });
  assert.equal(blocked.status, 200, JSON.stringify(blocked.data));

  // The cookie is still in the jar and still valid, but the guard refuses it now.
  const me = await user.call('GET', '/auth/me');
  assert.equal(me.status, 403);
  assert.equal(me.data.code, 'account_disabled');
  assert.equal((await user.call('GET', '/orders')).status, 403);
  // And signing in again does not help.
  assert.equal((await client()('POST', '/auth/login', { email: user.email, password: 'longenough1' })).status, 403);

  await admin('PATCH', `/admin/users/${row.id}/access`, { action: 'unblock', reason: 'end of test' });
});

await check('blocking needs a reason, and an admin cannot block themselves (400/409)', async () => {
  const users = (await admin('GET', '/admin/users')).data.users;
  const me = users.find((u) => u.role === 'ADMIN' && u.email === 'admin@example.test');
  const other = users.find((u) => u.id !== me.id);

  assert.equal((await admin('PATCH', `/admin/users/${other.id}/access`, { action: 'block' })).status, 400);
  assert.equal((await admin('PATCH', `/admin/users/${other.id}/access`, { action: 'vanish', reason: 'x' })).status, 400);
  const self = await admin('PATCH', `/admin/users/${me.id}/access`, { action: 'block', reason: 'oops' });
  assert.equal(self.status, 409);
  assert.equal(self.data.code, 'self_block');
});

await check('the admin changes a role, and the new role takes effect', async () => {
  const user = await newCustomer('promote');
  const row = (await admin('GET', '/admin/users')).data.users.find((u) => u.email === user.email);
  assert.equal((await user.call('GET', '/reports')).status, 403); // a customer cannot read reports

  const changed = await admin('PATCH', `/admin/users/${row.id}/role`, { role: 'ACCOUNTANT' });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await user.call('GET', '/reports')).status, 200); // the same session, the new role

  assert.equal((await admin('PATCH', `/admin/users/${row.id}/role`, { role: 'WIZARD' })).status, 400);
  const me = (await admin('GET', '/admin/users')).data.users.find((u) => u.email === 'admin@example.test');
  assert.equal((await admin('PATCH', `/admin/users/${me.id}/role`, { role: 'CUSTOMER' })).status, 409);
});

await check('the accounting report separates the list price from the money received', async () => {
  const r = await accountant('GET', '/reports');
  assert.equal(r.status, 200);
  const approved = r.data.orders.filter((o) => o.paymentOutcome === 'APPROVED');
  assert.equal(r.data.summary.approvedPaidTiyn, approved.reduce((s, o) => s + o.paidTiyn, 0));
  assert.equal(r.data.summary.bonusDiscountTiyn, approved.reduce((s, o) => s + o.discountTiyn, 0));
  // Any order paid partly with points must show less money than the food cost.
  for (const o of approved.filter((x) => x.discountTiyn > 0)) {
    assert.equal(o.paidTiyn, o.totalTiyn - o.discountTiyn, `order ${o.id}`);
  }
  const csv = await accountant('GET', '/reports/export.csv');
  assert.ok(String(csv.data).startsWith('order_id,created_at,status,item_count,total_kzt,bonus_discount_kzt,paid_kzt,payment,rating'));
});

console.log(process.exitCode ? '\nSome checks FAILED.' : `\nAll ${passed} checks passed.`);
