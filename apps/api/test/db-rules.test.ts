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

test('schema.sql applies twice without errors (idempotent)', { skip }, () => {
  const file = fileURLToPath(new URL('../sql/schema.sql', import.meta.url));
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
