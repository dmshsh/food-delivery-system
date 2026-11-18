-- Removes the throwaway accounts the end-to-end suite registers.
--
-- Every account the tests create has an email of the form  e2e-…@example.test .
-- Nothing else matches that pattern, and no demo account does, so this file
-- cannot touch alice, bob, the kitchen, the accountant or the administrator.
--
-- Why it exists: the tests used to register every customer with the same phone
-- number, which leaves duplicates behind and blocks the unique index on phone
-- numbers. The suite now generates a fresh number per account, so this is a
-- one-time clean-up of what earlier runs left behind.
--
-- The order of the deletes matters. Most rows hang off an account with
-- ON DELETE CASCADE, but two references deliberately do not cascade, because
-- losing them would rewrite history rather than tidy it:
--   orders.customer_id          — a paid order is a record, not a detail of a user
--   order_events.actor_user_id  — "who moved this order" must not vanish silently
-- So the orders are removed first, on purpose, and only then the accounts.
--
-- Usage:
--   psql postgres://food:food@localhost:5433/food_delivery -f sql/cleanup-test-accounts.sql
--   (or: npm run db:clean-tests)

BEGIN;

\echo 'Accounts to be removed:'
SELECT id, email, full_name FROM users WHERE email LIKE 'e2e-%@example.test' ORDER BY id;

CREATE TEMP TABLE doomed_users ON COMMIT DROP AS
  SELECT id FROM users WHERE email LIKE 'e2e-%@example.test';

CREATE TEMP TABLE doomed_orders ON COMMIT DROP AS
  SELECT o.id FROM orders o
   JOIN customers c ON c.id = o.customer_id
   WHERE c.user_id IN (SELECT id FROM doomed_users);

-- The orders first: this cascades to their items, payments, events and reviews.
DELETE FROM orders WHERE id IN (SELECT id FROM doomed_orders);

-- An event on somebody else's order that a test account caused (none are expected,
-- but the foreign key would refuse the delete if one existed).
DELETE FROM order_events WHERE actor_user_id IN (SELECT id FROM doomed_users);

-- The security journal keeps its lines — they are the record of what happened —
-- but they must not point at an account that no longer exists.
UPDATE security_events SET user_id = NULL WHERE user_id IN (SELECT id FROM doomed_users);
UPDATE blocked_ips     SET blocked_by = NULL WHERE blocked_by IN (SELECT id FROM doomed_users);

DELETE FROM login_attempts WHERE email LIKE 'e2e-%@example.test';
DELETE FROM users WHERE id IN (SELECT id FROM doomed_users);

\echo 'Phone numbers still used by more than one customer (0 rows = the unique index can now be created):'
SELECT phone_digits(phone) AS digits, count(*) AS accounts
  FROM customers GROUP BY 1 HAVING count(*) > 1;

COMMIT;
