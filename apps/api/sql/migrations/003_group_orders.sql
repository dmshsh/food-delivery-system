-- A group order: one delivery, several people, one bill split between them.
--
-- The change that matters is to the primary key of order_items. It used to be
-- (order_id, item_id): one row per dish, which quietly made "two of this" and
-- "one for Alice and one for Bob" the same thing. With a person on each line
-- they are different, and the key has to say so.
--
-- This is exactly the kind of change the old re-runnable schema file could not
-- express, and the reason this project now has migrations.

ALTER TABLE order_items ADD COLUMN participant TEXT NOT NULL DEFAULT ''
  CHECK (length(participant) <= 40);

-- Existing rows keep the empty participant, which means "the whole order",
-- so every order placed before today reads exactly as it did.
ALTER TABLE order_items DROP CONSTRAINT order_items_pkey;
ALTER TABLE order_items ADD PRIMARY KEY (order_id, item_id, participant);

-- Whether this order is shared. Kept on the order rather than worked out from
-- the lines, so an order that was meant to be shared still says so after
-- somebody removes everyone else's dishes.
ALTER TABLE orders ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT FALSE;

-- The names in this order, in the sequence the customer added them. Rebuilt
-- from the lines on every save; stored so an empty person does not disappear
-- from the bill while their dishes are being chosen.
ALTER TABLE orders ADD COLUMN participants TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE orders ADD CONSTRAINT orders_group_check CHECK (
  -- A group order has people in it; an ordinary one has none.
  (is_group AND cardinality(participants) > 0) OR (NOT is_group AND cardinality(participants) = 0)
);

CREATE INDEX order_items_participant_idx ON order_items (order_id, participant);
