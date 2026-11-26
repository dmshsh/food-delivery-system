// Checks the database rules against a REAL PostgreSQL (needs `psql` and DATABASE_URL).
// Skipped automatically when DATABASE_URL is not set.
// Usage: DATABASE_URL=postgres://food:food@localhost:5433/food_delivery npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALLOWED_TRANSITIONS, ORDER_STATUSES, canTransition } from '../src/domain/status.ts';

const url = process.env.DATABASE_URL;
const skip = !url;

function psql(sql: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', [url as string, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
}

test('the baseline migration applies twice without errors (idempotent)', { skip }, () => {
  const file = fileURLToPath(new URL('../sql/migrations/001_baseline.sql', import.meta.url));
  assert.ok(readFileSync(file, 'utf8').length > 0);
  for (let i = 0; i < 2; i++) execFileSync('psql', [url as string, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file]);
});

test('trigger and domain/status.ts agree on every one of the 64 status pairs', { skip }, () => {
  // A scratch user/customer/order, removed at the end.
  psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('dbrules@test.local','x','Rules','CUSTOMER') ON CONFLICT DO NOTHING`);
  psql(`INSERT INTO customers(user_id,phone,address) SELECT id,'+7000000','x' FROM users WHERE email='dbrules@test.local' ON CONFLICT DO NOTHING`);
  psql(`DELETE FROM orders WHERE attempt_id LIKE 'dbrules-%'`);
  try {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (from === to) continue;
        const attempt = `dbrules-${from}-${to}`;
        // Insert directly in the "from" state (INSERT is not guarded by the trigger), then try to move.
        psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,status,delivery_address,expires_at)
              SELECT c.id,'${attempt}','h','${from}','addr',now() FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email='dbrules@test.local'`);
        const res = psql(`UPDATE orders SET status='${to}' WHERE attempt_id='${attempt}'`);
        assert.equal(res.ok, canTransition(from, to), `${from} -> ${to}: database says ${res.ok}, domain says ${canTransition(from, to)}`);
        if (!res.ok) assert.match(res.out, /invalid_transition/);
      }
    }
  } finally {
    psql(`DELETE FROM orders WHERE attempt_id LIKE 'dbrules-%'`);
    psql(`DELETE FROM users WHERE email='dbrules@test.local'`);
  }
  assert.ok(Object.keys(ALLOWED_TRANSITIONS).length === ORDER_STATUSES.length);
});

test('same customer + same attempt_id cannot create two orders', { skip }, () => {
  psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('dbrules2@test.local','x','Rules','CUSTOMER')`);
  psql(`INSERT INTO customers(user_id,phone,address) SELECT id,'+7000000','x' FROM users WHERE email='dbrules2@test.local'`);
  try {
    const insert = `INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at)
                    SELECT c.id,'dup-1','h','addr',now() FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email='dbrules2@test.local'`;
    assert.equal(psql(insert).ok, true);
    const second = psql(insert);
    assert.equal(second.ok, false);
    assert.match(second.out, /duplicate key|unique/i);
  } finally {
    psql(`DELETE FROM orders WHERE attempt_id='dup-1'`);
    psql(`DELETE FROM users WHERE email='dbrules2@test.local'`);
  }
});

test('invalid quantity and negative price are rejected by CHECK constraints', { skip }, () => {
  assert.equal(psql(`INSERT INTO menu_items(name,description,category,price_tiyn) VALUES ('bad','d','c',-1)`).ok, false);
});

// ---------------------------------------------------------------------------
// Week 2: the rules the database itself enforces for feedback, bonus points
// and the admin role.
// ---------------------------------------------------------------------------

/** A throwaway customer to hang the test rows on. Returns the customers.id. */
function scratchCustomer(email: string): string {
  psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('${email}','x','Scratch','CUSTOMER')`);
  psql(`INSERT INTO customers(user_id,phone,address) SELECT id,'+7000000','x' FROM users WHERE email='${email}'`);
  return psql(`SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email='${email}'`).out;
}

function dropScratch(email: string) {
  psql(`DELETE FROM orders WHERE customer_id IN (SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id WHERE u.email='${email}')`);
  psql(`DELETE FROM users WHERE email='${email}'`);
}

test('ADMIN is an accepted role, nonsense roles are not', { skip }, () => {
  const email = 'dbrules-admin@test.local';
  psql(`DELETE FROM users WHERE email='${email}'`);
  try {
    assert.equal(psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('${email}','x','Admin','ADMIN')`).ok, true);
    const bad = psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('${email}2','x','Nope','SUPERUSER')`);
    assert.equal(bad.ok, false);
    assert.match(bad.out, /users_role_check|violates check/i);
  } finally {
    psql(`DELETE FROM users WHERE email LIKE '${email}%'`);
  }
});

test('a review can only be stored for an order that was actually delivered', { skip }, () => {
  const email = 'dbrules-fb@test.local';
  dropScratch(email);
  const customer = scratchCustomer(email);
  try {
    // A PENDING order: the trigger must refuse the review.
    psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,status,delivery_address,expires_at)
          VALUES (${customer},'fb-pending','h','PENDING','addr',now() + interval '1 hour')`);
    const pendingId = psql(`SELECT id FROM orders WHERE attempt_id='fb-pending'`).out;
    const refused = psql(`INSERT INTO order_feedback(order_id,customer_id,rating) VALUES (${pendingId},${customer},5)`);
    assert.equal(refused.ok, false);
    assert.match(refused.out, /feedback_not_delivered/);

    // A DELIVERED order: accepted once, refused the second time.
    psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,status,delivery_address,expires_at)
          VALUES (${customer},'fb-done','h','DELIVERED','addr',now())`);
    const doneId = psql(`SELECT id FROM orders WHERE attempt_id='fb-done'`).out;
    assert.equal(psql(`INSERT INTO order_feedback(order_id,customer_id,rating,comment) VALUES (${doneId},${customer},5,'Good')`).ok, true);
    const twice = psql(`INSERT INTO order_feedback(order_id,customer_id,rating) VALUES (${doneId},${customer},1)`);
    assert.equal(twice.ok, false);
    assert.match(twice.out, /duplicate key|unique/i);

    // And the rating itself has to be a star between 1 and 5.
    psql(`DELETE FROM order_feedback WHERE order_id=${doneId}`);
    assert.equal(psql(`INSERT INTO order_feedback(order_id,customer_id,rating) VALUES (${doneId},${customer},6)`).ok, false);
    assert.equal(psql(`INSERT INTO order_feedback(order_id,customer_id,rating) VALUES (${doneId},${customer},0)`).ok, false);
  } finally {
    dropScratch(email);
  }
});

test('bonus history cannot lie: earning adds points and spending takes them away', { skip }, () => {
  const email = 'dbrules-bonus@test.local';
  dropScratch(email);
  const customer = scratchCustomer(email);
  try {
    const tx = (kind: string, points: number, balance: number) =>
      psql(`INSERT INTO bonus_transactions(customer_id,kind,points,balance_after) VALUES (${customer},'${kind}',${points},${balance})`);
    assert.equal(tx('EARNED', 255, 255).ok, true);
    assert.equal(tx('SPENT', -100, 155).ok, true);
    assert.equal(tx('EARNED', -10, 145).ok, false, 'earning must not remove points');
    assert.equal(tx('SPENT', 10, 165).ok, false, 'spending must not add points');
    assert.equal(tx('EARNED', 10, -5).ok, false, 'a balance can never go below zero');

    // The balance on the customer itself is guarded too.
    assert.equal(psql(`UPDATE customers SET bonus_points = -1 WHERE id = ${customer}`).ok, false);
    assert.equal(psql(`UPDATE customers SET bonus_points = 500 WHERE id = ${customer}`).ok, true);
  } finally {
    psql(`DELETE FROM bonus_transactions WHERE customer_id=${customer}`);
    dropScratch(email);
  }
});

// ---------------------------------------------------------------------------
// Week 3: uniqueness, the language column, reset links and blocked addresses.
// ---------------------------------------------------------------------------

test('one phone number belongs to one customer, however it is written', { skip }, () => {
  const a = 'dbrules-phone-a@test.local';
  const b = 'dbrules-phone-b@test.local';
  dropScratch(a);
  dropScratch(b);
  const first = scratchCustomer(a);
  try {
    assert.equal(psql(`UPDATE customers SET phone = '+7 700 555 11 22' WHERE id = ${first}`).ok, true);

    // The same number, punctuated differently, must still be refused.
    psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('${b}','x','Scratch','CUSTOMER')`);
    const clash = psql(
      `INSERT INTO customers(user_id,phone,address) SELECT id,'77005551122','x' FROM users WHERE email='${b}'`,
    );
    assert.equal(clash.ok, false, 'the same digits were accepted twice');
    assert.match(clash.out, /duplicate key|unique/i);

    // A different number is fine.
    assert.equal(
      psql(`INSERT INTO customers(user_id,phone,address) SELECT id,'+7 700 555 11 23','x' FROM users WHERE email='${b}'`).ok,
      true,
    );
  } finally {
    dropScratch(a);
    dropScratch(b);
  }
});

test('two dishes cannot share a name, whatever the capitalisation or spacing', { skip }, () => {
  psql(`DELETE FROM menu_items WHERE name ILIKE 'dbrules dish%'`);
  try {
    const insert = (name: string) =>
      psql(`INSERT INTO menu_items(name,description,category,price_tiyn) VALUES ('${name}','d','c',1000)`);
    assert.equal(insert('DbRules Dish').ok, true);
    assert.equal(insert('dbrules dish').ok, false, 'the same name in lower case was accepted');
    assert.equal(insert('  DbRules Dish  ').ok, false, 'the same name with spaces around it was accepted');
    assert.equal(insert('DbRules Dish Two').ok, true);
  } finally {
    psql(`DELETE FROM menu_items WHERE name ILIKE '%dbrules dish%'`);
  }
});

test('the language column accepts only the three the site speaks', { skip }, () => {
  const email = 'dbrules-lang@test.local';
  dropScratch(email);
  psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('${email}','x','Scratch','CUSTOMER')`);
  try {
    for (const code of ['en', 'ru', 'kk']) {
      assert.equal(psql(`UPDATE users SET preferred_language='${code}' WHERE email='${email}'`).ok, true, code);
    }
    assert.equal(psql(`UPDATE users SET preferred_language='fr' WHERE email='${email}'`).ok, false);
    // New accounts start in English rather than with nothing.
    assert.equal(psql(`SELECT preferred_language FROM users WHERE email='${email}'`).out, 'kk');
  } finally {
    psql(`DELETE FROM users WHERE email='${email}'`);
  }
});

test('a reset link is stored once, as a hash, and never twice', { skip }, () => {
  const email = 'dbrules-reset@test.local';
  dropScratch(email);
  psql(`INSERT INTO users(email,password_hash,full_name,role) VALUES ('${email}','x','Scratch','CUSTOMER')`);
  const userId = psql(`SELECT id FROM users WHERE email='${email}'`).out;
  try {
    const insert = (hash: string) =>
      psql(`INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES (${userId},'${hash}',now() + interval '30 minutes')`);
    assert.equal(insert('hash-aaa').ok, true);
    assert.equal(insert('hash-aaa').ok, false, 'the same token hash was stored twice');
    assert.match(insert('hash-aaa').out, /duplicate key|unique/i);
    assert.equal(insert('hash-bbb').ok, true);

    // Deleting the account takes its links with it: a link must never outlive its owner.
    psql(`DELETE FROM users WHERE email='${email}'`);
    assert.equal(psql(`SELECT count(*) FROM password_resets WHERE user_id=${userId}`).out, '0');
  } finally {
    psql(`DELETE FROM users WHERE email='${email}'`);
  }
});

test('an address can be blocked only once, and never with a negative failure count', { skip }, () => {
  const ip = '198.51.100.77';
  psql(`DELETE FROM blocked_ips WHERE ip='${ip}'`);
  try {
    assert.equal(psql(`INSERT INTO blocked_ips(ip,reason,failures) VALUES ('${ip}','test',15)`).ok, true);
    const twice = psql(`INSERT INTO blocked_ips(ip,reason,failures) VALUES ('${ip}','again',16)`);
    assert.equal(twice.ok, false);
    assert.match(twice.out, /duplicate key|unique/i);
    assert.equal(psql(`UPDATE blocked_ips SET failures = -1 WHERE ip='${ip}'`).ok, false);
  } finally {
    psql(`DELETE FROM blocked_ips WHERE ip='${ip}'`);
  }
});

// ---------------------------------------------------------------------------
// Week 4: nutrition, group orders and the delivery code.
// ---------------------------------------------------------------------------

test('migrations are recorded, and each one only once', { skip }, () => {
  // The table exists and holds the baseline, which is what lets an existing
  // database adopt the migration system without being rebuilt.
  assert.match(psql(`SELECT count(*) FROM schema_migrations`).out, /^[1-9]/);
  assert.equal(psql(`SELECT count(*) FROM schema_migrations WHERE name = '001_baseline.sql'`).out, '1');
  // Applying one twice is refused by the primary key, which is what makes
  // "exactly once" a guarantee rather than an intention.
  const twice = psql(`INSERT INTO schema_migrations(name, checksum) VALUES ('001_baseline.sql','x')`);
  assert.equal(twice.ok, false);
  assert.match(twice.out, /duplicate key|unique/i);
});

test('nutrition on a dish must be possible, and its labels must be known', { skip }, () => {
  psql(`DELETE FROM menu_items WHERE name ILIKE 'dbrules nutrition%'`);
  try {
    const insert = (columns: string, values: string) =>
      psql(`INSERT INTO menu_items(name,description,category,price_tiyn,${columns})
            VALUES ('DbRules nutrition ${Math.random()}','d','c',1000,${values})`);

    assert.equal(insert('calories_kcal', '520').ok, true);
    assert.equal(insert('calories_kcal', '-1').ok, false, 'a negative calorie count was accepted');
    assert.equal(insert('calories_kcal', '99999').ok, false, 'an impossible calorie count was accepted');
    assert.equal(insert('protein_g', '-5').ok, false);

    // Nutrition stays optional: a dish can be added before it is weighed.
    assert.equal(insert('calories_kcal', 'NULL').ok, true);

    assert.equal(insert('tags', `ARRAY['vegan','halal']::text[]`).ok, true);
    const madeUp = insert('tags', `ARRAY['delicious']::text[]`);
    assert.equal(madeUp.ok, false, 'an unknown label was stored');
    assert.match(madeUp.out, /menu_items_tags_check|violates check/i);
  } finally {
    psql(`DELETE FROM menu_items WHERE name ILIKE 'dbrules nutrition%'`);
  }
});

test('a group order holds people, and an ordinary one holds none', { skip }, () => {
  const email = 'dbrules-group@test.local';
  dropScratch(email);
  const customer = scratchCustomer(email);
  try {
    const order = (attempt: string, extra: string) =>
      psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at${extra ? ',' + extra.split('=')[0] : ''})
            VALUES (${customer},'${attempt}','h','addr',now()${extra ? ',' + extra.split('=')[1] : ''})`);

    // An ordinary order: no people, and that is consistent.
    assert.equal(order('grp-plain', '').ok, true);

    // A group order with people in it.
    assert.equal(
      psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at,is_group,participants)
            VALUES (${customer},'grp-ok','h','addr',now(),TRUE,ARRAY['Alice','Bob'])`).ok,
      true,
    );

    // A group order with nobody in it, and an ordinary order with people in it,
    // are both states the application can never mean.
    const emptyGroup = psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at,is_group,participants)
                             VALUES (${customer},'grp-empty','h','addr',now(),TRUE,ARRAY[]::text[])`);
    assert.equal(emptyGroup.ok, false, 'a group order with no people was accepted');
    assert.match(emptyGroup.out, /orders_group_check|violates check/i);

    const peopleWithoutGroup = psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at,is_group,participants)
                                     VALUES (${customer},'grp-stray','h','addr',now(),FALSE,ARRAY['Alice'])`);
    assert.equal(peopleWithoutGroup.ok, false);
  } finally {
    dropScratch(email);
  }
});

test('the same dish for two people is two rows; for one person it is one', { skip }, () => {
  const email = 'dbrules-items@test.local';
  dropScratch(email);
  const customer = scratchCustomer(email);
  try {
    psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at,is_group,participants)
          VALUES (${customer},'items-1','h','addr',now(),TRUE,ARRAY['Alice','Bob'])`);
    const orderId = psql(`SELECT id FROM orders WHERE attempt_id='items-1'`).out;
    const dishId = psql(`SELECT id FROM menu_items ORDER BY id LIMIT 1`).out;

    const line = (participant: string) =>
      psql(`INSERT INTO order_items(order_id,item_id,quantity,unit_price_tiyn,participant)
            VALUES (${orderId},${dishId},1,1000,'${participant}')`);

    // The key is (order, dish, person), so the same dish for two people is fine…
    assert.equal(line('Alice').ok, true);
    assert.equal(line('Bob').ok, true);
    // …and the same dish for the same person twice is not: that is one line
    // with a quantity of two.
    const again = line('Alice');
    assert.equal(again.ok, false, 'the same dish was listed twice for one person');
    assert.match(again.out, /duplicate key|unique/i);
  } finally {
    dropScratch(email);
  }
});

test('a delivery code is four digits or nothing at all', { skip }, () => {
  const email = 'dbrules-code@test.local';
  dropScratch(email);
  const customer = scratchCustomer(email);
  try {
    // The label is separate from the value: a code is written with quotes around
    // it, and folding those into the attempt id would break the statement rather
    // than test the constraint.
    let attempt = 0;
    const withCode = (code: string) =>
      psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at,confirmation_code)
            VALUES (${customer},'code-${attempt++}','h','addr',now(),${code})`);

    assert.equal(withCode(`'0427'`).ok, true);
    assert.equal(withCode('NULL').ok, true, 'an order with no code yet was refused');
    assert.equal(withCode(`'42'`).ok, false, 'a two-digit code was accepted');
    assert.equal(withCode(`'12345'`).ok, false);
    assert.equal(withCode(`'12a4'`).ok, false);

    // Guesses are counted, and the count cannot be talked backwards.
    psql(`INSERT INTO orders(customer_id,attempt_id,request_hash,delivery_address,expires_at)
          VALUES (${customer},'code-attempts','h','addr',now())`);
    assert.equal(psql(`UPDATE orders SET confirmation_attempts = -1 WHERE attempt_id='code-attempts'`).ok, false);
    assert.equal(psql(`UPDATE orders SET confirmation_attempts = 3 WHERE attempt_id='code-attempts'`).ok, true);
  } finally {
    dropScratch(email);
  }
});
