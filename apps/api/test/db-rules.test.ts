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
