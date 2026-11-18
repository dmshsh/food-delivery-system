// End-to-end checks for the week-3 work, against a RUNNING API.
//   1) npm run db:up   2) npm run dev:api   3) npm run test:e2e
// Covers: the registration language field, the profile, password reset and
// change, blocking by address, order history search, repeating an order,
// the three new reports, the health endpoint, and the uniqueness rules.
import assert from 'node:assert/strict';

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

/** A phone number no other account holds: one number belongs to one customer. */
let phoneCounter = 0;
function uniquePhone() {
  const unique = String(Date.now()).slice(-7) + String(phoneCounter++).padStart(2, '0');
  return `+7 ${unique.slice(0, 3)} ${unique.slice(3, 6)} ${unique.slice(6)}`;
}

/** Reads one CSV line the way a spreadsheet does: quotes protect commas. */
function readFields(line) {
  const fields = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function countFields(line) {
  return readFields(line).length;
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

async function newCustomer(label, extra = {}) {
  const call = client();
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
  const phone = uniquePhone();
  const body = {
    fullName: `E2E ${label}`,
    email,
    phone,
    address: 'Almaty, Abay 1',
    password: 'longenough1',
    ...extra,
  };
  const r = await call('POST', '/auth/register', body);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { call, email, phone, password: 'longenough1' };
}

const admin = client();
const kitchen = client();
const accountant = client();

console.log(`E2E (week-3 features) against ${API}`);

// ------------------------------------------------------------------ server

await check('the health endpoint answers, and says whether the database is reachable', async () => {
  const guest = client();
  const ready = await guest('GET', '/health');
  assert.equal(ready.status, 200, JSON.stringify(ready.data));
  assert.equal(ready.data.status, 'ok');
  assert.equal(ready.data.database, 'ok');
  assert.ok(typeof ready.data.databaseLatencyMs === 'number');
  assert.ok(ready.data.uptimeSeconds >= 0);

  // The cheap one answers without touching the database at all.
  const live = await guest('GET', '/health/live');
  assert.equal(live.status, 200);
  assert.equal(live.data.status, 'ok');
});

await check('answers carry the headers that stop the page being framed or sniffed', async () => {
  const res = await fetch(`${API}/menu`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

await check('the seeded staff can still sign in', async () => {
  assert.equal((await admin('POST', '/auth/login', { email: 'admin@example.test', password: PASSWORD })).status, 200);
  assert.equal((await kitchen('POST', '/auth/login', { email: 'kitchen@example.test', password: PASSWORD })).status, 200);
  assert.equal((await accountant('POST', '/auth/login', { email: 'accounts@example.test', password: PASSWORD })).status, 200);
});

// ------------------------------------------------- registration + language

await check('registration takes a language, and it comes back with the session', async () => {
  const user = await newCustomer('lang', { language: 'kk' });
  const me = await user.call('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.language, 'kk');

  // Signing in again on another device finds the same choice.
  const second = client();
  const again = await second('POST', '/auth/login', { email: user.email, password: user.password });
  assert.equal(again.data.user.language, 'kk');
});

await check('an unknown language, and a password built from the name, are refused (400)', async () => {
  const base = {
    fullName: 'E2E Rejected',
    email: `e2e-reject-${Date.now()}@example.test`,
    phone: uniquePhone(),
    address: 'Almaty',
    password: 'longenough1',
  };
  assert.equal((await client()('POST', '/auth/register', { ...base, language: 'fr' })).status, 400);
  // "rejected" is the person's own surname here.
  const weak = await client()('POST', '/auth/register', { ...base, password: 'rejected123' });
  assert.equal(weak.status, 400);
  assert.equal(weak.data.code, 'weak_password');
  assert.equal((await client()('POST', '/auth/register', { ...base, password: 'password1' })).status, 400);
});

// ---------------------------------------------------------- uniqueness

await check('one phone number belongs to one account (409)', async () => {
  const first = await newCustomer('phone');
  const clash = await client()('POST', '/auth/register', {
    fullName: 'E2E Clash',
    email: `e2e-clash-${Date.now()}@example.test`,
    // The same number, written without the spacing.
    phone: first.phone.replace(/\s/g, ''),
    address: 'Almaty',
    password: 'longenough1',
  });
  assert.equal(clash.status, 409, JSON.stringify(clash.data));
  assert.equal(clash.data.code, 'phone_taken');
});

await check('one email belongs to one account, and the answer says which field clashed (409)', async () => {
  const first = await newCustomer('email');
  const clash = await client()('POST', '/auth/register', {
    fullName: 'E2E Clash',
    email: first.email.toUpperCase(), // capitalisation must not create a second account
    phone: uniquePhone(),
    address: 'Almaty',
    password: 'longenough1',
  });
  assert.equal(clash.status, 409);
  assert.equal(clash.data.code, 'email_taken');
});

await check('two dishes cannot share a name (409)', async () => {
  const name = `E2E unique dish ${Date.now()}`;
  const dish = { name, description: 'only for the test', category: 'Meals', priceTiyn: 50000, available: true };
  const created = await admin('POST', '/admin/menu', dish);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  try {
    const clash = await admin('POST', '/admin/menu', { ...dish, name: name.toUpperCase() });
    assert.equal(clash.status, 409, JSON.stringify(clash.data));
    assert.equal(clash.data.code, 'dish_name_taken');
    // Renaming a dish to its own name is not a clash.
    const same = await admin('PATCH', `/admin/menu/${created.data.item.id}`, dish);
    assert.equal(same.status, 200);
  } finally {
    await admin('DELETE', `/admin/menu/${created.data.item.id}`);
  }
});

// ---------------------------------------------------------------- profile

await check('a customer reads and edits their own profile', async () => {
  const user = await newCustomer('profile');
  const before = await user.call('GET', '/profile');
  assert.equal(before.status, 200);
  assert.equal(before.data.profile.role, 'CUSTOMER');
  assert.equal(before.data.profile.orderCount, 0);

  const phone = uniquePhone();
  const after = await user.call('PATCH', '/profile', {
    fullName: 'E2E Renamed',
    phone,
    address: 'Almaty, Dostyk 5',
    language: 'ru',
  });
  assert.equal(after.status, 200, JSON.stringify(after.data));
  assert.equal(after.data.profile.fullName, 'E2E Renamed');
  assert.equal(after.data.profile.address, 'Almaty, Dostyk 5');
  assert.equal(after.data.profile.language, 'ru');
  // The change is real, not just echoed back.
  assert.equal((await user.call('GET', '/auth/me')).data.user.fullName, 'E2E Renamed');
});

await check('the profile cannot be used to change the email, the role or the balance', async () => {
  const user = await newCustomer('escalate');
  const before = await user.call('GET', '/profile');
  const r = await user.call('PATCH', '/profile', {
    fullName: 'E2E Escalate',
    phone: uniquePhone(),
    address: 'Almaty',
    language: 'en',
    role: 'ADMIN',
    email: 'admin@example.test',
    bonusPoints: 99999,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.role, 'CUSTOMER', 'the role was changed through the profile form');
  assert.equal(r.data.profile.email, before.data.profile.email, 'the email was changed through the profile form');
  assert.equal(r.data.profile.bonusPoints, 0, 'points were granted through the profile form');
  assert.equal((await user.call('GET', '/admin/users')).status, 403);
});

await check('a profile cannot take a phone number another account already holds (409)', async () => {
  const first = await newCustomer('phone-a');
  const second = await newCustomer('phone-b');
  const clash = await second.call('PATCH', '/profile', {
    fullName: 'E2E Phone B',
    phone: first.phone,
    address: 'Almaty',
    language: 'en',
  });
  assert.equal(clash.status, 409);
  assert.equal(clash.data.code, 'phone_taken');
  // Keeping its own number is not a clash.
  const same = await second.call('PATCH', '/profile', {
    fullName: 'E2E Phone B',
    phone: second.phone,
    address: 'Almaty',
    language: 'en',
  });
  assert.equal(same.status, 200);
});

await check('staff have a profile and a language too, but no delivery details', async () => {
  const r = await kitchen('GET', '/profile');
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.role, 'KITCHEN');
  assert.equal(r.data.profile.phone, null);
  assert.equal((await kitchen('PATCH', '/profile/language', { language: 'ru' })).status, 200);
  assert.equal((await kitchen('GET', '/auth/me')).data.user.language, 'ru');
  await kitchen('PATCH', '/profile/language', { language: 'en' }); // put it back
  assert.equal((await kitchen('PATCH', '/profile/language', { language: 'fr' })).status, 400);
});

// -------------------------------------------------------------- passwords

await check('a forgotten password gives the same answer whether or not the account exists', async () => {
  const user = await newCustomer('forgot');
  const real = await client()('POST', '/auth/password/forgot', { email: user.email });
  const fake = await client()('POST', '/auth/password/forgot', { email: 'nobody-here@example.test' });
  assert.equal(real.status, 200);
  assert.equal(fake.status, 200);
  assert.equal(real.data.message, fake.data.message, 'the answer reveals whether the account exists');
  // In development the link is handed back instead of emailed; for an unknown
  // address there is nothing to hand back.
  assert.ok(real.data.demoToken, 'no reset link was issued');
  assert.equal(fake.data.demoToken, undefined);
});

await check('a reset link sets a new password, works once, and signs the old sessions out', async () => {
  const user = await newCustomer('reset');
  // A session that is open before the reset.
  assert.equal((await user.call('GET', '/auth/me')).status, 200);

  const { demoToken } = (await client()('POST', '/auth/password/forgot', { email: user.email })).data;
  const used = await client()('POST', '/auth/password/reset', { token: demoToken, password: 'brandnew99' });
  assert.equal(used.status, 200, JSON.stringify(used.data));

  // The same link a second time is refused.
  const twice = await client()('POST', '/auth/password/reset', { token: demoToken, password: 'another99' });
  assert.equal(twice.status, 400);
  assert.equal(twice.data.code, 'bad_reset_token');

  // The old password no longer works, the new one does.
  assert.equal((await client()('POST', '/auth/login', { email: user.email, password: 'longenough1' })).status, 401);
  assert.equal((await client()('POST', '/auth/login', { email: user.email, password: 'brandnew99' })).status, 200);
  // And the session opened before the reset is refused.
  const stale = await user.call('GET', '/auth/me');
  assert.equal(stale.status, 401);
  assert.equal(stale.data.code, 'password_changed');
});

await check('asking again retires the earlier reset link', async () => {
  const user = await newCustomer('two-links');
  const first = (await client()('POST', '/auth/password/forgot', { email: user.email })).data.demoToken;
  const second = (await client()('POST', '/auth/password/forgot', { email: user.email })).data.demoToken;
  assert.notEqual(first, second);
  assert.equal((await client()('POST', '/auth/password/reset', { token: first, password: 'brandnew99' })).status, 400);
  assert.equal((await client()('POST', '/auth/password/reset', { token: second, password: 'brandnew99' })).status, 200);
});

await check('a weak new password is refused by the reset form (400)', async () => {
  const user = await newCustomer('weak-reset');
  const { demoToken } = (await client()('POST', '/auth/password/forgot', { email: user.email })).data;
  for (const password of ['short1', 'password1', 'allletters']) {
    const r = await client()('POST', '/auth/password/reset', { token: demoToken, password });
    assert.equal(r.status, 400, password);
  }
  // The link still works for a good password: a refusal must not consume it.
  assert.equal((await client()('POST', '/auth/password/reset', { token: demoToken, password: 'brandnew99' })).status, 200);
});

await check('changing a password needs the current one, and keeps this session alive', async () => {
  const user = await newCustomer('change');
  const wrong = await user.call('POST', '/auth/password/change', {
    currentPassword: 'not-the-one1',
    newPassword: 'brandnew99',
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.code, 'bad_current_password');

  const same = await user.call('POST', '/auth/password/change', {
    currentPassword: 'longenough1',
    newPassword: 'longenough1',
  });
  assert.equal(same.status, 400);
  assert.equal(same.data.code, 'password_unchanged');

  const ok = await user.call('POST', '/auth/password/change', {
    currentPassword: 'longenough1',
    newPassword: 'brandnew99',
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  // This browser is handed a fresh token, so it is not signed out by its own action.
  assert.equal((await user.call('GET', '/auth/me')).status, 200);
  assert.equal((await client()('POST', '/auth/login', { email: user.email, password: 'brandnew99' })).status, 200);
});

await check('changing a password signs the OTHER devices out', async () => {
  const user = await newCustomer('other-device');
  const otherDevice = client();
  assert.equal((await otherDevice('POST', '/auth/login', { email: user.email, password: 'longenough1' })).status, 200);
  assert.equal((await otherDevice('GET', '/auth/me')).status, 200);

  await user.call('POST', '/auth/password/change', { currentPassword: 'longenough1', newPassword: 'brandnew99' });

  const stale = await otherDevice('GET', '/auth/me');
  assert.equal(stale.status, 401);
  assert.equal(stale.data.code, 'password_changed');
});

// ------------------------------------------------------ blocking by address

await check('the admin blocks and unblocks an address, and it is journalled', async () => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  const blocked = await admin('POST', '/admin/ips', { ip, reason: 'e2e test' });
  assert.equal(blocked.status, 200, JSON.stringify(blocked.data));
  const row = blocked.data.addresses.find((a) => a.ip === ip);
  assert.ok(row, 'the address is not in the list');
  assert.equal(row.manual, true);
  assert.equal(row.active, true);

  const journal = await admin('GET', '/admin/security?kind=IP_BLOCKED');
  assert.ok(journal.data.events.some((e) => e.ip === ip), 'the block is missing from the journal');

  const lifted = await admin('DELETE', `/admin/ips/${encodeURIComponent(ip)}`);
  assert.equal(lifted.status, 200);
  assert.ok(!lifted.data.addresses.some((a) => a.ip === ip));
});

await check('the address list is admin-only, and the rules are stated with it', async () => {
  const user = await newCustomer('ips');
  assert.equal((await user.call('GET', '/admin/ips')).status, 403);
  assert.equal((await accountant('GET', '/admin/ips')).status, 403);
  const r = await admin('GET', '/admin/ips');
  assert.equal(r.status, 200);
  assert.equal(r.data.rules.maxFailures, 15);
  assert.equal(r.data.rules.blockMinutes, 60);
  assert.ok(Array.isArray(r.data.suspicious));
});

await check('the server\'s own address cannot be blocked, which would lock everyone out (400)', async () => {
  for (const ip of ['127.0.0.1', '::1', 'localhost']) {
    const r = await admin('POST', '/admin/ips', { ip, reason: 'should be refused' });
    assert.equal(r.status, 400, ip);
    assert.equal(r.data.code, 'ip_not_blockable');
  }
  assert.equal((await admin('POST', '/admin/ips', { ip: '203.0.113.9' })).status, 400); // no reason given
});

// -------------------------------------------------- history search + repeat

const menu = (await client()('GET', '/menu')).data.items;
const rice = menu.find((m) => m.name === 'Rice bowl');
const tea = menu.find((m) => m.name === 'Lemon tea');
assert.ok(rice && tea, 'the seeded dishes are missing');

const shopper = await newCustomer('history');
let riceOrderId;
let teaOrderId;

await check('two orders are placed, to search through', async () => {
  const place = async (itemId, notes) => {
    const created = await shopper.call('POST', '/orders', {
      attemptId: `${Date.now()}-${Math.random()}`,
      deliveryAddress: 'Almaty, Abay 1',
      deliveryTime: 'ASAP',
      notes,
      bonusPoints: 0,
      items: [{ itemId, quantity: 1 }],
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    await shopper.call('POST', `/orders/${created.data.order.id}/checkout`, { outcome: 'success' });
    return created.data.order.id;
  };
  riceOrderId = await place(rice.id, 'no onions please');
  teaOrderId = await place(tea.id, 'extra hot');
});

await check('the history searches by dish name', async () => {
  const r = await shopper.call('GET', '/orders?search=rice');
  assert.equal(r.status, 200);
  assert.equal(r.data.filter.search, 'rice');
  assert.ok(r.data.orders.some((o) => o.id === riceOrderId));
  assert.ok(!r.data.orders.some((o) => o.id === teaOrderId), 'the tea order matched a search for rice');
});

await check('the history searches by note, address and order number', async () => {
  const byNote = await shopper.call('GET', '/orders?search=onions');
  assert.ok(byNote.data.orders.some((o) => o.id === riceOrderId));

  const byAddress = await shopper.call('GET', '/orders?search=abay');
  assert.ok(byAddress.data.orders.length >= 2);

  const byNumber = await shopper.call('GET', `/orders?search=${teaOrderId}`);
  assert.equal(byNumber.data.orders.length, 1);
  assert.equal(byNumber.data.orders[0].id, teaOrderId);

  const nothing = await shopper.call('GET', '/orders?search=zzzz-no-such-thing');
  assert.equal(nothing.data.orders.length, 0);
});

await check('the history filters by status and by date, and refuses nonsense (400)', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const confirmed = await shopper.call('GET', `/orders?status=CONFIRMED&from=${today}&to=${today}`);
  assert.equal(confirmed.status, 200);
  assert.ok(confirmed.data.orders.length >= 2);
  assert.ok(confirmed.data.orders.every((o) => o.status === 'CONFIRMED'));

  // An end date covers the whole of that day, not the instant it begins.
  assert.ok((await shopper.call(`GET`, `/orders?to=${today}`)).data.orders.length >= 2);
  // A range in the past finds nothing.
  assert.equal((await shopper.call('GET', '/orders?from=2020-01-01&to=2020-01-02')).data.orders.length, 0);

  assert.equal((await shopper.call('GET', '/orders?status=COOKED')).status, 400);
  assert.equal((await shopper.call('GET', '/orders?from=yesterday')).status, 400);
  assert.equal((await shopper.call('GET', `/orders?from=${today}&to=2020-01-01`)).status, 400);
  assert.equal((await shopper.call('GET', `/orders?search=${'x'.repeat(61)}`)).status, 400);
});

await check('repeating an order lists what is still on the menu and what it costs now', async () => {
  const r = await shopper.call('GET', `/orders/${riceOrderId}/repeat`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.orderId ?? r.data.orderId, riceOrderId);
  assert.deepEqual(r.data.items, [{ itemId: rice.id, quantity: 1 }]);
  assert.equal(r.data.totalTiyn, rice.priceTiyn);
  assert.equal(r.data.previousTotalTiyn, rice.priceTiyn);
  assert.deepEqual(r.data.unavailable, []);
});

await check('repeating notices a dish that has left the menu, and one whose price moved', async () => {
  // A dish of our own, ordered and then taken off the menu.
  const dish = (
    await admin('POST', '/admin/menu', {
      name: `E2E vanishing dish ${Date.now()}`,
      description: 'ordered once, then hidden',
      category: 'Meals',
      priceTiyn: 70000,
      available: true,
    })
  ).data.item;

  const created = await shopper.call('POST', '/orders', {
    attemptId: `${Date.now()}-vanish`,
    deliveryAddress: 'Almaty, Abay 1',
    deliveryTime: 'ASAP',
    notes: '',
    bonusPoints: 0,
    items: [{ itemId: dish.id, quantity: 2 }, { itemId: tea.id, quantity: 1 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const orderId = created.data.order.id;
  await shopper.call('POST', `/orders/${orderId}/checkout`, { outcome: 'success' });

  // The price of the tea moves, and the other dish is hidden.
  await admin('PATCH', `/admin/menu/${tea.id}`, {
    name: tea.name,
    description: tea.description,
    category: tea.category,
    priceTiyn: tea.priceTiyn + 1000,
    available: true,
  });
  await admin('DELETE', `/admin/menu/${dish.id}`); // it is in an order, so it is hidden, not deleted

  try {
    const r = await shopper.call('GET', `/orders/${orderId}/repeat`);
    assert.equal(r.status, 200);
    assert.equal(r.data.unavailable.length, 1, JSON.stringify(r.data.unavailable));
    assert.ok(r.data.unavailable[0].includes('vanishing'));
    assert.deepEqual(r.data.items, [{ itemId: tea.id, quantity: 1 }]);
    assert.equal(r.data.repricedCount, 1);
    assert.equal(r.data.totalTiyn, tea.priceTiyn + 1000);
    assert.ok(r.data.previousTotalTiyn > r.data.totalTiyn);
  } finally {
    await admin('PATCH', `/admin/menu/${tea.id}`, {
      name: tea.name,
      description: tea.description,
      category: tea.category,
      priceTiyn: tea.priceTiyn,
      available: true,
    });
  }
});

await check('nobody can repeat somebody else\'s order (403), and a missing one is 404', async () => {
  const stranger = await newCustomer('repeat-stranger');
  assert.equal((await stranger.call('GET', `/orders/${riceOrderId}/repeat`)).status, 403);
  assert.equal((await shopper.call('GET', '/orders/99999999/repeat')).status, 404);
});

// ----------------------------------------------------------- new reports

await check('the daily report adds up to the same money as the order report', async () => {
  const daily = await accountant('GET', '/reports/daily');
  assert.equal(daily.status, 200, JSON.stringify(daily.data));
  const orders = await accountant('GET', '/reports');
  const approvedPaid = orders.data.orders
    .filter((o) => o.paymentOutcome === 'APPROVED')
    .reduce((sum, o) => sum + o.paidTiyn, 0);
  assert.equal(daily.data.summary.paidTiyn, approvedPaid, 'the daily report and the order report disagree');
  assert.equal(
    daily.data.summary.paidTiyn,
    daily.data.days.reduce((sum, d) => sum + d.paidTiyn, 0),
    'the summary does not match its own rows',
  );
  if (daily.data.days.length) assert.ok(daily.data.summary.bestDay);
});

await check('the dish report accounts for every dish, and its shares add up', async () => {
  const r = await accountant('GET', '/reports/dishes');
  assert.equal(r.status, 200);
  assert.ok(r.data.dishes.length >= 6);
  assert.equal(
    r.data.summary.revenueTiyn,
    r.data.dishes.reduce((sum, d) => sum + d.revenueTiyn, 0),
  );
  const sold = r.data.dishes.filter((d) => d.quantity > 0);
  assert.equal(r.data.summary.soldCount, sold.length);
  const shares = sold.reduce((sum, d) => sum + d.sharePercent, 0);
  if (sold.length) assert.ok(Math.abs(shares - 100) < 1.5, `shares add up to ${shares}`);
});

await check('the customer report counts orders and spending per customer', async () => {
  const r = await accountant('GET', '/reports/customers');
  assert.equal(r.status, 200);
  const row = r.data.customers.find((c) => c.email === shopper.email);
  assert.ok(row, 'the shopper is missing from the customer report');
  assert.ok(row.orders >= 2);
  assert.ok(row.paidTiyn > 0);
  assert.equal(row.averageOrderTiyn, Math.round(row.paidTiyn / row.orders));
  assert.ok(r.data.summary.activeCount >= 1);
});

await check('the three reports take a date range and refuse a broken one (400)', async () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const kind of ['daily', 'dishes', 'customers']) {
    assert.equal((await accountant('GET', `/reports/${kind}?from=${today}&to=${today}`)).status, 200, kind);
    assert.equal((await accountant('GET', `/reports/${kind}?from=yesterday`)).status, 400, kind);
    assert.equal((await accountant('GET', `/reports/${kind}?from=${today}&to=2020-01-01`)).status, 400, kind);
  }
  // Nothing was paid in 2020, so the range is empty rather than wrong.
  const empty = await accountant('GET', '/reports/daily?from=2020-01-01&to=2020-01-02');
  assert.equal(empty.data.days.length, 0);
  assert.equal(empty.data.summary.paidTiyn, 0);
});

await check('each report downloads as CSV, with its own columns', async () => {
  const expected = {
    daily: 'day,orders,customers,paid_kzt',
    dishes: 'dish_id,name,category,available',
    customers: 'customer_id,name,email,orders',
  };
  for (const [kind, header] of Object.entries(expected)) {
    const r = await accountant('GET', `/reports/${kind}/export.csv`);
    assert.equal(r.status, 200, kind);
    assert.ok(String(r.data).startsWith(header), `${kind}: ${String(r.data).slice(0, 60)}`);
  }
  assert.equal((await accountant('GET', '/reports/nonsense/export.csv')).status, 400);
});

await check('a dish whose name holds a comma does not break the CSV', async () => {
  const name = `E2E tea, with lemon ${Date.now()}`;
  const created = await admin('POST', '/admin/menu', {
    name,
    description: 'a name that would split a column',
    category: 'Drinks',
    priceTiyn: 30000,
    available: true,
  });
  try {
    const csv = String((await accountant('GET', '/reports/dishes/export.csv')).data);
    assert.ok(csv.includes(`"${name}"`), 'the name with a comma was not quoted');
    // Every row has the same number of columns as the header. Counted with a
    // real reader, because splitting on commas is exactly the mistake the
    // quoting exists to survive.
    const lines = csv.split('\n').filter(Boolean);
    const columns = countFields(lines[0]);
    for (const line of lines) {
      assert.equal(countFields(line), columns, `wrong column count: ${line}`);
    }
    // And the quoted name is read back whole, comma and all.
    const row = lines.find((l) => l.includes(name));
    assert.equal(readFields(row)[1], name);
  } finally {
    await admin('DELETE', `/admin/menu/${created.data.item.id}`);
  }
});

await check('reports stay closed to customers and the kitchen (403)', async () => {
  for (const path of ['/reports/daily', '/reports/dishes', '/reports/customers']) {
    assert.equal((await shopper.call('GET', path)).status, 403, path);
    assert.equal((await kitchen('GET', path)).status, 403, path);
  }
  // The admin runs the restaurant, so the admin may read them too.
  assert.equal((await admin('GET', '/reports/daily')).status, 200);
});

console.log(process.exitCode ? '\nSome checks FAILED.' : `\nAll ${passed} checks passed.`);
