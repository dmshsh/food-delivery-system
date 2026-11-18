-- Food Delivery System: PostgreSQL schema.
-- Idempotent: the API runs this file on every start (CREATE ... IF NOT EXISTS).
-- Money is stored as integer tiyn (1 KZT = 100 tiyn), never as floating point.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 160),
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 80),
  role          TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'KITCHEN', 'ACCOUNTANT'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS customers (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  phone   TEXT NOT NULL CHECK (phone ~ '^[+0-9 ()-]{7,30}$'),
  address TEXT NOT NULL CHECK (length(btrim(address)) BETWEEN 1 AND 240)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL,
  price_tiyn  INTEGER NOT NULL CHECK (price_tiyn >= 0),
  available   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  customer_id      INTEGER NOT NULL REFERENCES customers (id),
  -- Retry identity: the browser reuses one attempt_id for one intended order.
  attempt_id       TEXT NOT NULL CHECK (length(attempt_id) BETWEEN 1 AND 100),
  request_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN
                   ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED',
                    'CANCELLED', 'PAYMENT_REJECTED', 'EXPIRED')),
  delivery_address TEXT NOT NULL CHECK (length(btrim(delivery_address)) BETWEEN 1 AND 240),
  delivery_time    TIMESTAMPTZ,            -- NULL means "as soon as possible"
  notes            TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,   -- checkout time limit
  UNIQUE (customer_id, attempt_id)
);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  item_id          INTEGER NOT NULL REFERENCES menu_items (id),
  quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_tiyn  INTEGER NOT NULL CHECK (unit_price_tiyn >= 0),  -- price at purchase time
  PRIMARY KEY (order_id, item_id)
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  outcome      TEXT NOT NULL CHECK (outcome IN ('APPROVED', 'REJECTED', 'TIMEOUT')),
  amount_tiyn  INTEGER NOT NULL CHECK (amount_tiyn >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status rule enforced by the database itself, so no code path can break it:
--   PENDING   -> CONFIRMED | PAYMENT_REJECTED | EXPIRED | CANCELLED
--   CONFIRMED -> PREPARING -> READY -> DELIVERED
-- Everything else (for example CONFIRMED -> PENDING) is rejected.
-- Keep this in sync with apps/api/src/domain/status.ts (a test compares them).
CREATE OR REPLACE FUNCTION enforce_order_status_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
       (OLD.status = 'PENDING'   AND NEW.status IN ('CONFIRMED', 'PAYMENT_REJECTED', 'EXPIRED', 'CANCELLED'))
    OR (OLD.status = 'CONFIRMED' AND NEW.status = 'PREPARING')
    OR (OLD.status = 'PREPARING' AND NEW.status = 'READY')
    OR (OLD.status = 'READY'     AND NEW.status = 'DELIVERED')
  ) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_status_transition ON orders;
CREATE TRIGGER orders_status_transition
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition();

-- ============================================================================
-- Week 2 additions: admin role, security (login limits + journal), bonus
-- points, customer feedback and drag-and-drop menu order.
-- Written as ALTER ... IF NOT EXISTS / DROP + CREATE so the whole file stays
-- idempotent: running it again on an existing database changes nothing.
-- ============================================================================

-- ---------------------------------------------------------------- users: ADMIN role + account state
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('CUSTOMER', 'KITCHEN', 'ACCOUNTANT', 'ADMIN'));

-- Failed sign-ins in the current window, and the automatic block that follows them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_until   TIMESTAMPTZ;
-- is_active = FALSE is a manual block by an administrator (no automatic expiry).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason    TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------- menu: manual order for drag and drop
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS menu_items_sort_idx ON menu_items (sort_order, id);

-- ---------------------------------------------------------------- bonus points
-- 1 point = 1 KZT. The balance lives on the customer; every change is written
-- to bonus_transactions, so the balance can always be re-derived from history.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bonus_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_bonus_points_check;
ALTER TABLE customers ADD CONSTRAINT customers_bonus_points_check CHECK (bonus_points >= 0);

-- How many points the customer asked to spend on this order (applied at checkout),
-- and how many the approved payment earned back.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_spent     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_earned    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_bonus_check;
ALTER TABLE orders ADD CONSTRAINT orders_bonus_check
  CHECK (bonus_requested >= 0 AND bonus_spent >= 0 AND bonus_earned >= 0);

CREATE TABLE IF NOT EXISTS bonus_transactions (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  order_id      INTEGER REFERENCES orders (id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('EARNED', 'SPENT', 'ADJUSTED')),
  points        INTEGER NOT NULL,          -- signed: + earned, - spent
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  note          TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bonus_tx_customer_idx ON bonus_transactions (customer_id, created_at DESC);

-- A spend must take points away and an earn must add them: the sign has to match the kind.
ALTER TABLE bonus_transactions DROP CONSTRAINT IF EXISTS bonus_tx_sign_check;
ALTER TABLE bonus_transactions ADD CONSTRAINT bonus_tx_sign_check CHECK (
     (kind = 'EARNED' AND points > 0)
  OR (kind = 'SPENT'  AND points < 0)
  OR (kind = 'ADJUSTED')
);

-- ---------------------------------------------------------------- feedback
CREATE TABLE IF NOT EXISTS order_feedback (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
  reply       TEXT NOT NULL DEFAULT '' CHECK (length(reply) <= 500),
  replied_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_feedback_rating_idx ON order_feedback (rating, created_at DESC);

-- ---------------------------------------------------------------- security
-- Every sign-in try, successful or not. The limiter counts the failures in the
-- last few minutes; the journal below keeps the readable story for the admin.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  ip         TEXT NOT NULL DEFAULT '',
  success    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  user_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  email      TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_time_idx ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_kind_idx ON security_events (kind, created_at DESC);

-- Feedback belongs to a finished order only. Checked in the database as well as
-- in the service, so no code path can store a review for an order never delivered.
CREATE OR REPLACE FUNCTION enforce_feedback_on_delivered() RETURNS trigger AS $$
DECLARE
  current_status TEXT;
BEGIN
  SELECT status INTO current_status FROM orders WHERE id = NEW.order_id;
  IF current_status IS DISTINCT FROM 'DELIVERED' THEN
    RAISE EXCEPTION 'feedback_not_delivered: order % is %', NEW.order_id, current_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_feedback_delivered ON order_feedback;
CREATE TRIGGER order_feedback_delivered
  BEFORE INSERT ON order_feedback
  FOR EACH ROW EXECUTE FUNCTION enforce_feedback_on_delivered();

-- ============================================================================
-- Week 3 additions: registration language, profile editing, password reset and
-- change, blocking by IP address, uniqueness rules, and the indexes the order
-- history search needs. Idempotent, like everything above.
-- ============================================================================

-- ---------------------------------------------------------------- language
-- The language a person reads the site in. Chosen at registration, changed in
-- the profile, and remembered server-side so it follows the account to any device.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_language_check;
ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (preferred_language IN ('en', 'ru', 'kk'));

-- ---------------------------------------------------------------- passwords
-- When the password last changed. Tokens issued before that moment stop working,
-- so changing a password really does sign the other devices out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Which generation of sessions is currently valid.
--
-- "Changing your password signs out your other devices" cannot be decided from
-- the clock: a JWT records when it was issued in whole seconds, so a token
-- issued at 10:00:00.8 and a password changed at 10:00:00.9 are
-- indistinguishable, and any comparison leaves a window of up to a second in
-- which an old session survives. A counter has no such ambiguity: every token
-- carries the number it was signed with, changing a password raises it, and
-- every token carrying the old number is refused from that instant.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- A reset link. Only the HASH of the token is stored: a stolen database must not
-- hand the thief working reset links.
CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_ip TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at DESC);

-- ------------------------------------------------------------ IP blocking
-- Blocking one account does not stop someone working through a list of accounts
-- from the same machine. This blocks the source instead of the target.
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip          TEXT PRIMARY KEY CHECK (length(ip) BETWEEN 1 AND 60),
  reason      TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  failures    INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  blocked_until TIMESTAMPTZ,              -- NULL with manual = TRUE means "until lifted by hand"
  manual      BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blocked_ips_until_idx ON blocked_ips (blocked_until);

-- ------------------------------------------------------------- uniqueness
-- One phone number belongs to one customer. Without this, two accounts can claim
-- the same person, and a courier calling the number reaches the wrong order.
-- Stored digits only, so "+7 700 111 22 33" and "+77001112233" are the same number.
CREATE OR REPLACE FUNCTION phone_digits(value TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(COALESCE(value, ''), '[^0-9]', '', 'g');
$$ LANGUAGE sql IMMUTABLE;

-- A uniqueness rule cannot be added to a table that already breaks it, and a
-- migration must never quietly rewrite or delete rows to make itself fit. So the
-- index is created when the data allows it, and otherwise the start-up says
-- loudly what is in the way. Until it is created, UniquenessService still
-- refuses duplicates, so the running system keeps the guarantee either way.
DO $$
DECLARE
  clashes INTEGER;
BEGIN
  SELECT count(*) INTO clashes FROM (
    SELECT 1 FROM customers GROUP BY phone_digits(phone) HAVING count(*) > 1
  ) AS duplicated;
  IF clashes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_digits_key ON customers (phone_digits(phone));
  ELSE
    RAISE WARNING 'customers_phone_digits_key not created: % phone number(s) are used by more than one customer. Run sql/cleanup-test-accounts.sql, or merge the accounts by hand, then restart.', clashes;
  END IF;
END $$;

-- Two dishes with the same name cannot be told apart in an order or a report.
DO $$
DECLARE
  clashes INTEGER;
BEGIN
  SELECT count(*) INTO clashes FROM (
    SELECT 1 FROM menu_items GROUP BY lower(btrim(name)) HAVING count(*) > 1
  ) AS duplicated;
  IF clashes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS menu_items_name_lower_key ON menu_items (lower(btrim(name)));
  ELSE
    RAISE WARNING 'menu_items_name_lower_key not created: % dish name(s) appear more than once. Rename them in the admin panel, then restart.', clashes;
  END IF;
END $$;

-- One open reset link per user at a time: issuing a new one retires the old,
-- which the service does explicitly. This index makes finding the live one cheap.
CREATE INDEX IF NOT EXISTS password_resets_live_idx ON password_resets (user_id) WHERE used_at IS NULL;

-- ------------------------------------------------- order history search
-- The history page searches by dish name and filters by date, for one customer
-- at a time, so the useful index is the customer with the date.
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders (customer_id, created_at DESC);
