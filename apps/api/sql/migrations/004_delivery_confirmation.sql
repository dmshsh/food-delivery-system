-- Confirming a delivery.
--
-- Until now the kitchen could mark any order delivered on its own say-so. That
-- records that somebody pressed a button, not that the food reached the person
-- who paid for it. A short code, shown only to the customer, closes the gap:
-- the courier asks for it at the door and it is what turns the order into
-- DELIVERED.
--
-- The code is four digits, so it can be read aloud, and that is also why it is
-- weak on its own: it is a confirmation of a handover in progress, not a
-- password. What makes it safe enough is that it is useless without the order,
-- it expires with the delivery, and guesses are counted and run out.

ALTER TABLE orders ADD COLUMN confirmation_code TEXT
  CHECK (confirmation_code IS NULL OR confirmation_code ~ '^[0-9]{4}$');

-- How many wrong codes have been tried at the door. Five is the limit, after
-- which the order can only be closed by an administrator — a courier guessing
-- ten thousand codes must not be able to mark an order delivered.
ALTER TABLE orders ADD COLUMN confirmation_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (confirmation_attempts >= 0);

ALTER TABLE orders ADD COLUMN confirmed_at TIMESTAMPTZ;

-- Orders that already exist and are still on their way get a code now, so the
-- new rule does not strand them half-delivered. Orders already finished do not
-- need one, and inventing one would suggest a handover that never happened.
UPDATE orders
   SET confirmation_code = lpad((floor(random() * 10000))::int::text, 4, '0')
 WHERE status IN ('CONFIRMED', 'PREPARING', 'READY');

UPDATE orders SET confirmed_at = created_at WHERE status = 'DELIVERED';
