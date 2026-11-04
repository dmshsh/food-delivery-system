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
