// End-to-end API check against a RUNNING API. No packages needed (Node 22 fetch).
//   1) npm run db:up   2) npm run dev:api   3) npm run test:e2e
// Optional: API_URL=http://localhost:3001/api node test/e2e.mjs
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

const alice = client();
const bob = client();
const kitchen = client();
const accountant = client();
const guest = client();

console.log(`E2E against ${API}`);

await check('guests can read the menu, but not orders', async () => {
  const menu = await guest('GET', '/menu');
  assert.equal(menu.status, 200);
  assert.ok(menu.data.items.length >= 6);
  assert.equal((await guest('GET', '/orders')).status, 401);
});

await check('login works for all four seeded roles; wrong password is rejected', async () => {
  for (const [c, email] of [[alice, 'alice@example.test'], [bob, 'bob@example.test'], [kitchen, 'kitchen@example.test'], [accountant, 'accounts@example.test']]) {
    assert.equal((await c('POST', '/auth/login', { email, password: PASSWORD })).status, 200, email);
  }
  assert.equal((await client()('POST', '/auth/login', { email: 'alice@example.test', password: 'wrong' })).status, 401);
});

const menu = (await guest('GET', '/menu')).data.items;
const rice = menu.find((m) => m.name === 'Rice bowl');
const wrap = menu.find((m) => m.name === 'Chicken wrap');
const draft = () => ({
  attemptId: randomUUID(),
  deliveryAddress: 'Almaty, Abay 1',
  deliveryTime: 'ASAP',
  notes: 'No onions',
  items: [{ itemId: rice.id, quantity: 2 }, { itemId: wrap.id, quantity: 1 }],
});

let order;
const attempt = draft();

await check('create order: saved as PENDING, server calculates 5,100 KZT', async () => {
  const r = await alice('POST', '/orders', attempt);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.order.status, 'PENDING');
  assert.equal(r.data.order.totalTiyn, 510000);
  order = r.data.order;
});

await check('retry with the same attempt returns the SAME order (no duplicate)', async () => {
  const r = await alice('POST', '/orders', attempt);
  assert.equal(r.status, 200);
  assert.equal(r.data.replayed, true);
  assert.equal(r.data.order.id, order.id);
});

await check('same attempt with a changed cart is refused (409)', async () => {
  const r = await alice('POST', '/orders', { ...attempt, items: [{ itemId: rice.id, quantity: 5 }] });
  assert.equal(r.status, 409);
});

await check('empty cart, quantity 0, quantity 21 are rejected (400)', async () => {
  assert.equal((await alice('POST', '/orders', { ...draft(), items: [] })).status, 400);
  assert.equal((await alice('POST', '/orders', { ...draft(), items: [{ itemId: rice.id, quantity: 0 }] })).status, 400);
  assert.equal((await alice('POST', '/orders', { ...draft(), items: [{ itemId: rice.id, quantity: 21 }] })).status, 400);
});

await check('roles: Bob cannot read Alice\'s order; kitchen cannot see an unpaid order (403)', async () => {
  assert.equal((await bob('GET', `/orders/${order.id}`)).status, 403);
  assert.equal((await kitchen('GET', `/orders/${order.id}`)).status, 403);
  assert.equal((await bob('POST', `/orders/${order.id}/checkout`, { outcome: 'success' })).status, 403);
});

await check('checkout success: CONFIRMED; repeating it does not pay twice', async () => {
  const r = await alice('POST', `/orders/${order.id}/checkout`, { outcome: 'success' });
  assert.equal(r.status, 200);
  assert.equal(r.data.order.status, 'CONFIRMED');
  const again = await alice('POST', `/orders/${order.id}/checkout`, { outcome: 'success' });
  assert.equal(again.data.replayed, true);
});

await check('status rules: CONFIRMED -> PENDING and CONFIRMED -> READY are refused (409)', async () => {
  const back = await kitchen('PATCH', `/orders/${order.id}/status`, { status: 'PENDING' });
  assert.equal(back.status, 409);
  assert.equal(back.data.code, 'invalid_transition');
  assert.equal((await kitchen('PATCH', `/orders/${order.id}/status`, { status: 'READY' })).status, 409);
});

await check('kitchen moves the order forward step by step; a customer cannot', async () => {
  assert.equal((await alice('PATCH', `/orders/${order.id}/status`, { status: 'PREPARING' })).status, 403);
  for (const status of ['PREPARING', 'READY', 'DELIVERED']) {
    const r = await kitchen('PATCH', `/orders/${order.id}/status`, { status });
    assert.equal(r.status, 200, status);
    assert.equal(r.data.order.status, status);
  }
  assert.equal((await kitchen('PATCH', `/orders/${order.id}/status`, { status: 'READY' })).status, 409);
});

await check('kitchen view has no prices and no customer address', async () => {
  const r = await kitchen('GET', `/orders/${order.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.order.totalTiyn, undefined);
  assert.equal(r.data.order.deliveryAddress, undefined);
  assert.equal(r.data.order.items[0].unitPriceTiyn, undefined);
});

await check('checkout rejected -> PAYMENT_REJECTED; simulated time limit -> EXPIRED', async () => {
  const a = (await alice('POST', '/orders', draft())).data.order;
  const rej = await alice('POST', `/orders/${a.id}/checkout`, { outcome: 'rejected' });
  assert.equal(rej.data.order.status, 'PAYMENT_REJECTED');
  const b = (await alice('POST', '/orders', draft())).data.order;
  const exp = await alice('POST', `/orders/${b.id}/checkout`, { outcome: 'timeout' });
  assert.equal(exp.data.order.status, 'EXPIRED');
});

await check('lost reply: 503 once, then Retry recovers the same saved order', async () => {
  const o = (await alice('POST', '/orders', draft())).data.order;
  const lost = await alice('POST', `/orders/${o.id}/checkout`, { outcome: 'lost_reply' });
  assert.equal(lost.status, 503);
  assert.equal(lost.data.code, 'confirmation_lost');
  const retry = await alice('POST', `/orders/${o.id}/checkout`, { outcome: 'success' });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.order.status, 'CONFIRMED');
  assert.equal(retry.data.replayed, true);
});

await check('accounting: only the accountant reads reports; approved total matches', async () => {
  assert.equal((await alice('GET', '/reports')).status, 403);
  assert.equal((await kitchen('GET', '/reports')).status, 403);
  const r = await accountant('GET', '/reports');
  assert.equal(r.status, 200);
  const approved = r.data.orders.filter((o) => o.paymentOutcome === 'APPROVED');
  assert.equal(r.data.summary.approvedTotalTiyn, approved.reduce((s, o) => s + o.totalTiyn, 0));
  assert.ok(r.data.orders.some((o) => o.status === 'PAYMENT_REJECTED'));
  const filtered = await accountant('GET', '/reports?status=EXPIRED');
  assert.ok(filtered.data.orders.every((o) => o.status === 'EXPIRED'));
  const csv = await accountant('GET', '/reports/export.csv');
  assert.equal(csv.status, 200);
  assert.ok(String(csv.data).startsWith('order_id,created_at,status'));
});

await check('registration creates a customer only and signs in', async () => {
  const c = client();
  const email = `e2e-${Date.now()}@example.test`;
  const r = await c('POST', '/auth/register', {
    fullName: 'E2E User', email, phone: '+7 700 111 22 33', address: 'Almaty', password: 'longenough1', role: 'KITCHEN',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'CUSTOMER'); // a "role" field in the request is ignored
  assert.equal((await c('GET', '/auth/me')).data.user.email, email);
  assert.equal((await client()('POST', '/auth/register', { fullName: 'X', email, phone: '+7 700 111 22 33', address: 'A', password: 'longenough1' })).status, 409);
});

console.log(process.exitCode ? '\nSome checks FAILED.' : `\nAll ${passed} checks passed.`);
