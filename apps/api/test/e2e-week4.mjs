// End-to-end checks for the week-4 work, against a RUNNING API.
//   1) npm run db:up   2) npm run dev:api   3) npm run test:e2e
//
// Covers: the dish search by calories, budget and composition; nutrition and
// the advice built on it; group orders and the bill split; the delivery
// confirmation code; the accounting chart; and a set of PARALLEL-REQUEST checks
// that fire several requests at the same instant and assert that the rules hold
// when two people (or two tabs, or one impatient person) act at once.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const PASSWORD = 'StudentDemo123!';

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

let phoneCounter = 0;
function uniquePhone() {
  const unique = String(Date.now()).slice(-7) + String(phoneCounter++).padStart(2, '0');
  return `+7 ${unique.slice(0, 3)} ${unique.slice(3, 6)} ${unique.slice(6)}`;
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

async function newCustomer(label) {
  const call = client();
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
  const r = await call('POST', '/auth/register', {
    fullName: `E2E ${label}`,
    email,
    phone: uniquePhone(),
    address: 'Almaty, Abay 1',
    password: 'longenough1',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { call, email, password: 'longenough1' };
}

const admin = client();
const kitchen = client();
const accountant = client();

console.log(`E2E (week-4 features) against ${API}`);

await check('the seeded staff sign in', async () => {
  assert.equal((await admin('POST', '/auth/login', { email: 'admin@example.test', password: PASSWORD })).status, 200);
  assert.equal((await kitchen('POST', '/auth/login', { email: 'kitchen@example.test', password: PASSWORD })).status, 200);
  assert.equal(
    (await accountant('POST', '/auth/login', { email: 'accounts@example.test', password: PASSWORD })).status,
    200,
  );
});

// ------------------------------------------------- the dish search

const guest = client();
let menu;

await check('the menu carries nutrition, and says so for every dish', async () => {
  const r = await guest('GET', '/menu');
  assert.equal(r.status, 200);
  menu = r.data.items;
  assert.ok(menu.length >= 6);
  assert.ok(r.data.bounds.maxCalories > 0, 'the calorie bounds are missing');
  assert.ok(r.data.availableTags.includes('vegetarian'));
  for (const dish of menu) {
    assert.ok('caloriesKcal' in dish, `${dish.name} has no calorie field`);
    assert.ok(Array.isArray(dish.tags), `${dish.name} has no labels`);
  }
  // The six seeded dishes are measured, so the search has something to work
  // with. Dishes an admin added later may not be, and that is allowed: the
  // menu does not refuse a dish because nobody has weighed it yet.
  const seeded = ['Rice bowl', 'Chicken wrap', 'Vegetable soup', 'Lemon tea', 'Apple juice', 'Oat cookie'];
  for (const name of seeded) {
    const dish = menu.find((d) => d.name === name);
    assert.ok(dish, `the seeded dish ${name} is missing`);
    assert.ok(dish.caloriesKcal !== null, `${name} has no calories`);
    assert.ok(dish.ingredients.length > 0, `${name} has no ingredients`);
  }
});

await check('a dish can be found by what is in it', async () => {
  const chicken = await guest('GET', '/menu?search=chicken');
  assert.equal(chicken.status, 200);
  assert.ok(chicken.data.items.length >= 1);
  // "chicken" is in the ingredients, not only in the name.
  assert.ok(chicken.data.items.every((d) => `${d.name} ${d.description} ${d.ingredients}`.toLowerCase().includes('chicken')));

  const nothing = await guest('GET', '/menu?search=zzzz-not-a-food');
  assert.equal(nothing.data.items.length, 0);
});

await check('a dish can be found by calories and by budget', async () => {
  const light = await guest('GET', '/menu?maxCalories=200');
  assert.ok(light.data.items.length >= 1);
  assert.ok(light.data.items.every((d) => d.caloriesKcal === null || d.caloriesKcal <= 200));

  const cheap = await guest('GET', '/menu?maxPriceTiyn=70000');
  assert.ok(cheap.data.items.every((d) => d.priceTiyn <= 70000));

  // Both at once, which is the question somebody actually has.
  const both = await guest('GET', '/menu?maxCalories=200&maxPriceTiyn=70000');
  assert.ok(both.data.items.every((d) => d.priceTiyn <= 70000 && (d.caloriesKcal ?? 0) <= 200));
  assert.ok(both.data.items.length <= cheap.data.items.length);
});

await check('labels narrow the menu both ways', async () => {
  const vegan = await guest('GET', '/menu?tags=vegan');
  assert.ok(vegan.data.items.length >= 1);
  assert.ok(vegan.data.items.every((d) => d.tags.includes('vegan')));

  const noNuts = await guest('GET', '/menu?withoutTags=contains-nuts');
  assert.ok(noNuts.data.items.every((d) => !d.tags.includes('contains-nuts')));
  // The oat cookie has nuts, so it must be gone.
  assert.ok(!noNuts.data.items.some((d) => d.name === 'Oat cookie'));

  const both = await guest('GET', '/menu?tags=vegetarian&withoutTags=contains-nuts');
  assert.ok(both.data.items.every((d) => d.tags.includes('vegetarian') && !d.tags.includes('contains-nuts')));
});

await check('the search refuses a filter that cannot mean anything (400)', async () => {
  assert.equal((await guest('GET', '/menu?tags=delicious')).status, 400);
  assert.equal((await guest('GET', '/menu?tags=vegan&withoutTags=vegan')).status, 400);
  assert.equal((await guest('GET', '/menu?maxCalories=-5')).status, 400);
  assert.equal((await guest('GET', '/menu?minCalories=900&maxCalories=100')).status, 400);
});

await check('the menu can be sorted by price and by calories', async () => {
  const byPrice = (await guest('GET', '/menu?sort=price')).data.items.map((d) => d.priceTiyn);
  assert.deepEqual(byPrice, [...byPrice].sort((a, b) => a - b));

  const byCalories = (await guest('GET', '/menu?sort=calories')).data.items.map((d) => d.caloriesKcal ?? Infinity);
  assert.deepEqual(byCalories, [...byCalories].sort((a, b) => a - b));
});

// ---------------------------------------------------------- nutrition

const rice = menu.find((m) => m.name === 'Rice bowl');
const tea = menu.find((m) => m.name === 'Lemon tea');
const soup = menu.find((m) => m.name === 'Vegetable soup');
assert.ok(rice && tea && soup, 'the seeded dishes are missing');

await check('a basket adds up, and the figures come from the server', async () => {
  const r = await guest('POST', '/nutrition/summary', {
    items: [
      { itemId: rice.id, quantity: 2 },
      { itemId: tea.id, quantity: 1 },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.summary.caloriesKcal, rice.caloriesKcal * 2 + tea.caloriesKcal);
  const split = r.data.summary.energySplit;
  assert.equal(split.protein + split.fat + split.carbs, 100);
  assert.ok(r.data.summary.shareOfDayPercent > 0);
  assert.ok(r.data.summary.advice.some((a) => a.code === 'advice.shareOfDay'));
});

await check('a large basket is named as such, and an empty one makes no claims', async () => {
  const heavy = await guest('POST', '/nutrition/summary', { items: [{ itemId: rice.id, quantity: 3 }] });
  assert.ok(heavy.data.summary.advice.some((a) => a.code === 'advice.heavyOrder'));

  const empty = await guest('POST', '/nutrition/summary', { items: [] });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.summary.advice, []);
});

await check('a basket with broken quantities is refused (400)', async () => {
  for (const items of [[{ itemId: rice.id, quantity: 0 }], [{ itemId: rice.id, quantity: 99 }], [{ itemId: 'x', quantity: 1 }]]) {
    assert.equal((await guest('POST', '/nutrition/summary', { items })).status, 400, JSON.stringify(items));
  }
  assert.equal((await guest('POST', '/nutrition/summary', { items: 'everything' })).status, 400);
});

// -------------------------------------------------------- group orders

const host = await newCustomer('group');
let groupOrderId;

await check('a group order splits the bill between the people in it', async () => {
  const created = await host.call('POST', '/orders', {
    attemptId: randomUUID(),
    deliveryAddress: 'Almaty, Abay 1',
    deliveryTime: 'ASAP',
    notes: '',
    bonusPoints: 0,
    participants: ['Alice', 'Bob'],
    items: [
      { itemId: rice.id, quantity: 1, participant: 'Alice' },
      { itemId: soup.id, quantity: 1, participant: 'Bob' },
      { itemId: tea.id, quantity: 1, participant: 'Bob' },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  groupOrderId = created.data.order.id;

  const order = created.data.order;
  assert.equal(order.isGroup, true);
  assert.deepEqual(order.participants, ['Alice', 'Bob']);
  assert.ok(order.split, 'the order carries no split');

  const alice = order.split.shares.find((s) => s.name === 'Alice');
  const bob = order.split.shares.find((s) => s.name === 'Bob');
  assert.equal(alice.totalTiyn, rice.priceTiyn);
  assert.equal(bob.totalTiyn, soup.priceTiyn + tea.priceTiyn);
  assert.equal(bob.itemCount, 2);
  assert.equal(order.split.unassignedTiyn, 0);
  // The shares add up to the whole order.
  assert.equal(alice.totalTiyn + bob.totalTiyn, order.totalTiyn);
});

await check('the same dish for two people is two lines, not one', async () => {
  const created = await host.call('POST', '/orders', {
    attemptId: randomUUID(),
    deliveryAddress: 'Almaty, Abay 1',
    deliveryTime: 'ASAP',
    notes: '',
    bonusPoints: 0,
    participants: ['Alice', 'Bob'],
    items: [
      { itemId: rice.id, quantity: 1, participant: 'Alice' },
      { itemId: rice.id, quantity: 1, participant: 'Bob' },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.order.items.length, 2);
  assert.equal(created.data.order.totalTiyn, rice.priceTiyn * 2);
});

await check('a group order with a stranger, one person, or an unassigned dish is refused (400)', async () => {
  const base = {
    deliveryAddress: 'Almaty, Abay 1',
    deliveryTime: 'ASAP',
    notes: '',
    bonusPoints: 0,
  };
  const bad = async (body) =>
    assert.equal((await host.call('POST', '/orders', { attemptId: randomUUID(), ...base, ...body })).status, 400);

  await bad({ participants: ['Alice', 'Bob'], items: [{ itemId: rice.id, quantity: 1, participant: 'Carol' }] });
  await bad({ participants: ['Alice'], items: [{ itemId: rice.id, quantity: 1, participant: 'Alice' }] });
  await bad({ participants: ['Alice', 'alice'], items: [{ itemId: rice.id, quantity: 1, participant: 'Alice' }] });
  // Every dish unassigned means there is nothing to split.
  await bad({ participants: ['Alice', 'Bob'], items: [{ itemId: rice.id, quantity: 1 }] });
});

await check('the kitchen sees the names but still no money', async () => {
  await host.call('POST', `/orders/${groupOrderId}/checkout`, { outcome: 'success' });
  const r = await kitchen('GET', `/orders/${groupOrderId}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.order.isGroup, true);
  // The name goes on the box, which is why the packer sees it.
  assert.ok(r.data.order.items.some((i) => i.participant === 'Alice'));
  assert.equal(r.data.order.totalTiyn, undefined);
  assert.equal(r.data.order.split, undefined);
  assert.equal(r.data.order.confirmationCode, undefined, 'the kitchen can read the delivery code');
});

// ------------------------------------------------- delivery confirmation

await check('an approved payment issues a four-digit code, to the customer only', async () => {
  const order = (await host.call('GET', `/orders/${groupOrderId}`)).data.order;
  assert.match(String(order.confirmationCode), /^[0-9]{4}$/);

  const stranger = await newCustomer('code-stranger');
  assert.equal((await stranger.call('GET', `/orders/${groupOrderId}`)).status, 403);
});

await check('delivery needs the code: a wrong one is refused and counted', async () => {
  for (const status of ['PREPARING', 'READY']) {
    assert.equal((await kitchen('PATCH', `/orders/${groupOrderId}/status`, { status })).status, 200, status);
  }

  const noCode = await kitchen('PATCH', `/orders/${groupOrderId}/status`, { status: 'DELIVERED' });
  assert.equal(noCode.status, 400, JSON.stringify(noCode.data));
  assert.equal(noCode.data.code, 'bad_confirmation_code');

  const code = (await host.call('GET', `/orders/${groupOrderId}`)).data.order.confirmationCode;
  const wrong = String((Number(code) + 1) % 10000).padStart(4, '0');
  const refused = await kitchen('PATCH', `/orders/${groupOrderId}/status`, { status: 'DELIVERED', code: wrong });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.code, 'bad_confirmation_code');
  assert.ok(refused.data.attemptsLeft < 5, 'the wrong guess was not counted');

  // The order is still on its way, not delivered.
  assert.equal((await host.call('GET', `/orders/${groupOrderId}`)).data.order.status, 'READY');
});

await check('the right code completes the delivery and records when', async () => {
  const code = (await host.call('GET', `/orders/${groupOrderId}`)).data.order.confirmationCode;
  const done = await kitchen('PATCH', `/orders/${groupOrderId}/status`, { status: 'DELIVERED', code });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.order.status, 'DELIVERED');

  const mine = (await host.call('GET', `/orders/${groupOrderId}`)).data.order;
  assert.equal(mine.status, 'DELIVERED');
  assert.ok(mine.confirmedAt, 'the handover was not timestamped');
});

// --------------------------------------------------------- the chart

await check('the chart returns a point for every bucket, including the empty ones', async () => {
  const r = await accountant('GET', '/reports/chart?metric=revenue&bucket=day&from=2026-11-01&to=2026-11-10');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Ten days asked for, ten points returned: a quiet day is a dip in the line,
  // not a gap that makes the days either side look adjacent.
  assert.equal(r.data.points.length, 10);
  assert.equal(r.data.unit, 'tiyn');
  assert.ok(r.data.points.every((p) => typeof p.bucket === 'string'));
});

await check('the chart agrees with the reports it is drawn from', async () => {
  const chart = await accountant('GET', '/reports/chart?metric=revenue&bucket=day&from=2020-01-01');
  const daily = await accountant('GET', '/reports/daily');
  const fromChart = chart.data.points.reduce((sum, p) => sum + p.paidTiyn, 0);
  assert.equal(fromChart, daily.data.summary.paidTiyn, 'the chart and the daily report disagree');
  assert.equal(chart.data.summary.totalPaidTiyn, fromChart);
});

await check('an average has no value where there is nothing to average', async () => {
  const r = await accountant('GET', '/reports/chart?metric=averageOrder&bucket=day&from=2020-01-01&to=2020-01-05');
  assert.equal(r.status, 200);
  // Showing zero would drag the line down as if the average had fallen, rather
  // than there having been no orders at all.
  assert.ok(r.data.points.every((p) => p.value === null));
  assert.equal(r.data.summary.orderCount, 0);
});

await check('the chart takes every metric and bucket it offers, and refuses the rest (400)', async () => {
  for (const metric of ['revenue', 'orders', 'averageOrder', 'customers']) {
    assert.equal((await accountant('GET', `/reports/chart?metric=${metric}`)).status, 200, metric);
  }
  for (const bucket of ['day', 'week', 'month']) {
    assert.equal((await accountant('GET', `/reports/chart?bucket=${bucket}`)).status, 200, bucket);
  }
  assert.equal((await accountant('GET', '/reports/chart?metric=profit')).status, 400);
  assert.equal((await accountant('GET', '/reports/chart?bucket=hour')).status, 400);
  assert.equal((await accountant('GET', '/reports/chart?from=whenever')).status, 400);
});

await check('the chart is closed to customers and the kitchen (403)', async () => {
  assert.equal((await host.call('GET', '/reports/chart')).status, 403);
  assert.equal((await kitchen('GET', '/reports/chart')).status, 403);
  assert.equal((await admin('GET', '/reports/chart')).status, 200);
});

// ===========================================================================
// Parallel requests.
//
// Everything above asks one question at a time. These fire several at the same
// instant, which is when the rules that hold "obviously" start to matter: two
// tabs, an impatient double-click, two people on one account, a retry that
// arrives while the first attempt is still running.
//
// Each check asserts the same shape of thing: exactly one of the racing
// requests may win, and the database afterwards must show exactly one effect.
// ===========================================================================

await check('parallel: the same order attempt sent five times creates one order', async () => {
  const buyer = await newCustomer('race-create');
  const body = {
    attemptId: randomUUID(),
    deliveryAddress: 'Almaty, Abay 1',
    deliveryTime: 'ASAP',
    notes: '',
    bonusPoints: 0,
    participants: [],
    items: [{ itemId: rice.id, quantity: 1 }],
  };

  const results = await Promise.all(Array.from({ length: 5 }, () => buyer.call('POST', '/orders', body)));
  assert.ok(results.every((r) => r.status === 201 || r.status === 200), JSON.stringify(results.map((r) => r.status)));

  const ids = new Set(results.map((r) => r.data.order.id));
  assert.equal(ids.size, 1, `five simultaneous attempts created ${ids.size} orders`);
  // Exactly one of them was the creation; the rest were replays.
  assert.equal(results.filter((r) => r.data.replayed === false).length, 1);

  const mine = (await buyer.call('GET', '/orders')).data.orders;
  assert.equal(mine.length, 1, 'more than one order ended up in the history');
});

await check('parallel: two checkouts of one order pay exactly once', async () => {
  const buyer = await newCustomer('race-pay');
  const order = (
    await buyer.call('POST', '/orders', {
      attemptId: randomUUID(),
      deliveryAddress: 'Almaty, Abay 1',
      deliveryTime: 'ASAP',
      notes: '',
      bonusPoints: 0,
      participants: [],
      items: [{ itemId: rice.id, quantity: 1 }],
    })
  ).data.order;

  // Two tabs, one button, the same instant.
  const [first, second] = await Promise.all([
    buyer.call('POST', `/orders/${order.id}/checkout`, { outcome: 'success' }),
    buyer.call('POST', `/orders/${order.id}/checkout`, { outcome: 'success' }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const settled = (await buyer.call('GET', `/orders/${order.id}`)).data.order;
  assert.equal(settled.status, 'CONFIRMED');
  // One payment, so one lot of points: the earnings are the proof that the
  // money moved once.
  assert.equal(settled.bonusEarned, Math.floor((rice.priceTiyn * 0.05) / 100));
  const replays = [first, second].filter((r) => r.data.replayed === true);
  assert.equal(replays.length, 1, 'both calls thought they were the first');
});

await check('parallel: bonus points cannot be spent twice at once', async () => {
  const buyer = await newCustomer('race-points');
  // Earn enough points to pay part of two orders, but not both.
  const earner = await buyer.call('POST', '/orders', {
    attemptId: randomUUID(),
    deliveryAddress: 'Almaty, Abay 1',
    deliveryTime: 'ASAP',
    notes: '',
    bonusPoints: 0,
    participants: [],
    items: [{ itemId: rice.id, quantity: 4 }],
  });
  await buyer.call('POST', `/orders/${earner.data.order.id}/checkout`, { outcome: 'success' });
  const balance = (await buyer.call('GET', '/bonus')).data.balance;
  assert.ok(balance > 0, 'nothing was earned to race over');

  // Two orders, each asking for every point there is.
  const spend = Math.min(balance, Math.floor((rice.priceTiyn * 0.3) / 100));
  const makeOrder = async () => {
    const r = await buyer.call('POST', '/orders', {
      attemptId: randomUUID(),
      deliveryAddress: 'Almaty, Abay 1',
      deliveryTime: 'ASAP',
      notes: '',
      bonusPoints: spend,
      participants: [],
      items: [{ itemId: rice.id, quantity: 1 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.order.id;
  };
  const [a, b] = [await makeOrder(), await makeOrder()];

  await Promise.all([
    buyer.call('POST', `/orders/${a}/checkout`, { outcome: 'success' }),
    buyer.call('POST', `/orders/${b}/checkout`, { outcome: 'success' }),
  ]);

  const after = await buyer.call('GET', '/bonus');
  // Whatever order the two settled in, the balance never went below zero and
  // the history adds up to it.
  assert.ok(after.data.balance >= 0, `balance went negative: ${after.data.balance}`);
  const fromHistory = after.data.history.reduce((sum, h) => sum + h.points, 0);
  assert.equal(after.data.balance, fromHistory, 'the balance and its history disagree');

  const orders = (await buyer.call('GET', '/orders')).data.orders;
  const spent = orders.reduce((sum, o) => sum + (o.bonusSpent ?? 0), 0);
  const earned = orders.reduce((sum, o) => sum + (o.bonusEarned ?? 0), 0);
  // Spending can exceed the starting balance, because a paid order earns points
  // that the next one may legitimately spend. What must never happen is
  // spending more than has ever existed.
  assert.ok(spent <= earned, `${spent} points were spent but only ${earned} were ever earned`);
});

await check('parallel: two couriers with the right code deliver the order once', async () => {
  const buyer = await newCustomer('race-deliver');
  const order = (
    await buyer.call('POST', '/orders', {
      attemptId: randomUUID(),
      deliveryAddress: 'Almaty, Abay 1',
      deliveryTime: 'ASAP',
      notes: '',
      bonusPoints: 0,
      participants: [],
      items: [{ itemId: tea.id, quantity: 1 }],
    })
  ).data.order;
  await buyer.call('POST', `/orders/${order.id}/checkout`, { outcome: 'success' });
  for (const status of ['PREPARING', 'READY']) {
    await kitchen('PATCH', `/orders/${order.id}/status`, { status });
  }
  const code = (await buyer.call('GET', `/orders/${order.id}`)).data.order.confirmationCode;

  const results = await Promise.all([
    kitchen('PATCH', `/orders/${order.id}/status`, { status: 'DELIVERED', code }),
    kitchen('PATCH', `/orders/${order.id}/status`, { status: 'DELIVERED', code }),
  ]);
  // One succeeds; the other finds the order already delivered and is refused
  // by the status rule rather than silently doing it twice.
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal((await buyer.call('GET', `/orders/${order.id}`)).data.order.status, 'DELIVERED');
});

await check('parallel: five wrong codes at once do not add up to a delivery', async () => {
  const buyer = await newCustomer('race-guess');
  const order = (
    await buyer.call('POST', '/orders', {
      attemptId: randomUUID(),
      deliveryAddress: 'Almaty, Abay 1',
      deliveryTime: 'ASAP',
      notes: '',
      bonusPoints: 0,
      participants: [],
      items: [{ itemId: tea.id, quantity: 1 }],
    })
  ).data.order;
  await buyer.call('POST', `/orders/${order.id}/checkout`, { outcome: 'success' });
  for (const status of ['PREPARING', 'READY']) {
    await kitchen('PATCH', `/orders/${order.id}/status`, { status });
  }
  const code = (await buyer.call('GET', `/orders/${order.id}`)).data.order.confirmationCode;
  const wrong = Array.from({ length: 5 }, (_, i) => String((Number(code) + i + 1) % 10000).padStart(4, '0'));

  const results = await Promise.all(
    wrong.map((guess) => kitchen('PATCH', `/orders/${order.id}/status`, { status: 'DELIVERED', code: guess })),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 0, 'a wrong code got through');
  assert.equal((await buyer.call('GET', `/orders/${order.id}`)).data.order.status, 'READY');
});

await check('parallel: two registrations with the same email create one account', async () => {
  const email = `e2e-race-${Date.now()}@example.test`;
  const body = (phone) => ({
    fullName: 'E2E Race',
    email,
    phone,
    address: 'Almaty',
    password: 'longenough1',
  });

  const [first, second] = await Promise.all([
    client()('POST', '/auth/register', body(uniquePhone())),
    client()('POST', '/auth/register', body(uniquePhone())),
  ]);
  const created = [first, second].filter((r) => r.status === 201);
  const refused = [first, second].filter((r) => r.status === 409);
  assert.equal(created.length, 1, `${created.length} accounts were created for one email`);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].data.code, 'email_taken');
});

await check('parallel: two registrations with the same phone create one account', async () => {
  const phone = uniquePhone();
  const body = (email) => ({ fullName: 'E2E Race', email, phone, address: 'Almaty', password: 'longenough1' });

  const [first, second] = await Promise.all([
    client()('POST', '/auth/register', body(`e2e-race-p1-${Date.now()}@example.test`)),
    client()('POST', '/auth/register', body(`e2e-race-p2-${Date.now()}@example.test`)),
  ]);
  const created = [first, second].filter((r) => r.status === 201);
  assert.equal(created.length, 1, 'one phone number ended up on two accounts');
  const refused = [first, second].find((r) => r.status === 409);
  assert.equal(refused.data.code, 'phone_taken');
});

await check('parallel: two dishes created with one name leave one dish', async () => {
  const name = `E2E race dish ${Date.now()}`;
  const dish = (suffix) => ({
    name: `${name}${suffix}`,
    description: 'created twice at once',
    category: 'Meals',
    priceTiyn: 50000,
    available: true,
  });

  const [first, second] = await Promise.all([
    admin('POST', '/admin/menu', dish('')),
    admin('POST', '/admin/menu', dish('')),
  ]);
  const created = [first, second].filter((r) => r.status === 201);
  const refused = [first, second].filter((r) => r.status === 409);
  try {
    assert.equal(created.length, 1, `${created.length} dishes were created with one name`);
    assert.equal(refused.length, 1);
    assert.equal(refused[0].data.code, 'dish_name_taken');
  } finally {
    for (const r of created) await admin('DELETE', `/admin/menu/${r.data.item.id}`);
  }
});

await check('parallel: many reads of one order never disagree with each other', async () => {
  // Nothing is being written here; the point is that the read path is not
  // quietly stateful. Twenty simultaneous reads must all describe the same order.
  const reads = await Promise.all(Array.from({ length: 20 }, () => host.call('GET', `/orders/${groupOrderId}`)));
  assert.ok(reads.every((r) => r.status === 200));
  const shapes = new Set(
    reads.map((r) => `${r.data.order.status}|${r.data.order.totalTiyn}|${r.data.order.items.length}`),
  );
  assert.equal(shapes.size, 1, `twenty reads returned ${shapes.size} different answers`);
});

await check('parallel: the menu stays one list while it is being reordered', async () => {
  const before = (await admin('GET', '/admin/menu')).data.items.map((i) => i.id);
  const reversed = [...before].reverse();

  // Two reorders and a read, all at once.
  const [a, b, read] = await Promise.all([
    admin('PATCH', '/admin/menu/reorder', { ids: reversed }),
    admin('PATCH', '/admin/menu/reorder', { ids: before }),
    client()('GET', '/menu'),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(read.status, 200);

  // Whichever landed last, the menu is a complete list with no dish lost or
  // duplicated — the reorder is one transaction, not a row at a time.
  const after = (await admin('GET', '/admin/menu')).data.items.map((i) => i.id);
  assert.equal(new Set(after).size, after.length, 'a dish appears twice after the race');
  assert.deepEqual([...after].sort((x, y) => x - y), [...before].sort((x, y) => x - y));

  await admin('PATCH', '/admin/menu/reorder', { ids: before });
});

console.log(process.exitCode ? '\nSome checks FAILED.' : `\nAll ${passed} checks passed.`);
