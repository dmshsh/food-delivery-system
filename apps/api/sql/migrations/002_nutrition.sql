-- Nutrition on the menu: what a dish is made of, so it can be searched by
-- calories, by budget and by what is in it, and so an order can say something
-- useful about what it adds up to.
--
-- Unlike the baseline, this file runs exactly once. It does not need to be
-- written to survive a second run.

ALTER TABLE menu_items ADD COLUMN calories_kcal INTEGER;
ALTER TABLE menu_items ADD COLUMN protein_g     NUMERIC(6, 1);
ALTER TABLE menu_items ADD COLUMN fat_g         NUMERIC(6, 1);
ALTER TABLE menu_items ADD COLUMN carbs_g       NUMERIC(6, 1);

-- What is in it, as free text, searched when someone types "chicken" or "nuts".
ALTER TABLE menu_items ADD COLUMN ingredients TEXT NOT NULL DEFAULT '';

-- Short labels a person filters by: vegetarian, vegan, spicy, contains-nuts,
-- gluten-free, halal, dairy-free. A fixed list rather than free text, because a
-- filter that misses "vegeterian" is worse than no filter at all.
ALTER TABLE menu_items ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

-- Nutrition is optional — an admin may add a dish before weighing it — but when
-- it is given it has to be possible.
ALTER TABLE menu_items ADD CONSTRAINT menu_items_nutrition_check CHECK (
      (calories_kcal IS NULL OR (calories_kcal >= 0 AND calories_kcal <= 5000))
  AND (protein_g IS NULL OR (protein_g >= 0 AND protein_g <= 500))
  AND (fat_g     IS NULL OR (fat_g     >= 0 AND fat_g     <= 500))
  AND (carbs_g   IS NULL OR (carbs_g   >= 0 AND carbs_g   <= 500))
);

-- Only labels the application knows. An unknown tag would sit in the database
-- forever, invisible to every filter.
ALTER TABLE menu_items ADD CONSTRAINT menu_items_tags_check CHECK (
  tags <@ ARRAY['vegetarian', 'vegan', 'spicy', 'contains-nuts', 'gluten-free', 'halal', 'dairy-free']::TEXT[]
);

-- The two things the dish search sorts and filters by most.
CREATE INDEX menu_items_calories_idx ON menu_items (calories_kcal) WHERE available;
CREATE INDEX menu_items_tags_idx ON menu_items USING GIN (tags);

-- ---------------------------------------------------------------------------
-- The seeded dishes, measured. Synthetic but plausible figures for one portion.
-- Written by name so the migration does not depend on the ids a given database
-- happened to hand out.
-- ---------------------------------------------------------------------------
UPDATE menu_items SET calories_kcal = 520, protein_g = 14.0, fat_g = 16.0, carbs_g = 78.0,
       ingredients = 'rice, seasonal vegetables, sesame dressing, soy sauce',
       tags = ARRAY['vegetarian', 'dairy-free']
 WHERE lower(btrim(name)) = 'rice bowl';

UPDATE menu_items SET calories_kcal = 610, protein_g = 32.0, fat_g = 24.0, carbs_g = 62.0,
       ingredients = 'wheat tortilla, grilled chicken, lettuce, tomato, yoghurt sauce',
       tags = ARRAY['halal']
 WHERE lower(btrim(name)) = 'chicken wrap';

UPDATE menu_items SET calories_kcal = 180, protein_g = 5.0, fat_g = 4.0, carbs_g = 30.0,
       ingredients = 'potato, carrot, onion, herbs, vegetable broth',
       tags = ARRAY['vegetarian', 'vegan', 'dairy-free', 'gluten-free']
 WHERE lower(btrim(name)) = 'vegetable soup';

UPDATE menu_items SET calories_kcal = 45, protein_g = 0.0, fat_g = 0.0, carbs_g = 11.0,
       ingredients = 'black tea, lemon, sugar',
       tags = ARRAY['vegetarian', 'vegan', 'dairy-free', 'gluten-free']
 WHERE lower(btrim(name)) = 'lemon tea';

UPDATE menu_items SET calories_kcal = 115, protein_g = 0.5, fat_g = 0.0, carbs_g = 28.0,
       ingredients = 'apple juice',
       tags = ARRAY['vegetarian', 'vegan', 'dairy-free', 'gluten-free']
 WHERE lower(btrim(name)) = 'apple juice';

UPDATE menu_items SET calories_kcal = 160, protein_g = 3.0, fat_g = 7.0, carbs_g = 22.0,
       ingredients = 'oats, butter, sugar, hazelnuts',
       tags = ARRAY['vegetarian', 'contains-nuts']
 WHERE lower(btrim(name)) = 'oat cookie';
