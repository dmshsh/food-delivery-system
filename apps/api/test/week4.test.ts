// The migration planner, group orders, the dish search, delivery codes and the chart query.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checksumOf, planMigrations } from '../src/db/migrate.ts';
import {
  CHART_BUCKETS,
  CHART_METRICS,
  DIET_TAGS,
  MAX_PARTICIPANTS,
  ValidationError,
  validateChartQuery,
  validateConfirmationCode,
  validateDishFilter,
  validateNutrition,
  validateNutritionPatch,
  validateOrderInput,
  validateParticipants,
} from '../src/domain/validation.ts';

const now = new Date('2026-11-26T10:00:00Z');
const order = {
  attemptId: 'attempt-1',
  deliveryAddress: 'Almaty, Abay 1',
  deliveryTime: 'ASAP',
  notes: '',
  items: [{ itemId: 1, quantity: 2 }],
};

// ---------------------------------------------------------------- migrations

const migration = (name: string, sql: string) => ({ name, sql, checksum: checksumOf(sql) });

test('migrations: only the ones never applied are pending, in file order', () => {
  const onDisk = [migration('001_a.sql', 'CREATE TABLE a();'), migration('002_b.sql', 'CREATE TABLE b();')];
  const fresh = planMigrations(onDisk, new Map());
  assert.deepEqual(fresh.pending.map((m) => m.name), ['001_a.sql', '002_b.sql']);

  const partly = planMigrations(onDisk, new Map([['001_a.sql', onDisk[0].checksum]]));
  assert.deepEqual(partly.pending.map((m) => m.name), ['002_b.sql']);

  const done = planMigrations(onDisk, new Map(onDisk.map((m) => [m.name, m.checksum])));
  assert.deepEqual(done.pending, []);
});

test('migrations: editing one that has already run is an error, not a silent re-run', () => {
  // The database in front of you would no longer match the file that claims to
  // describe it, and nothing would ever tell you.
  const onDisk = [migration('001_a.sql', 'CREATE TABLE a(id int);')];
  const applied = new Map([['001_a.sql', checksumOf('CREATE TABLE a();')]]);
  const plan = planMigrations(onDisk, applied);
  assert.deepEqual(plan.changed, ['001_a.sql']);
  assert.deepEqual(plan.pending, []);
});

test('migrations: a line-ending difference is not a change', () => {
  // Checked out on Windows, written on Linux: the same file either way.
  assert.equal(checksumOf('CREATE TABLE a();\nSELECT 1;\n'), checksumOf('CREATE TABLE a();\r\nSELECT 1;\r\n'));
});

test('migrations: one recorded but missing from disk is reported, not ignored', () => {
  const plan = planMigrations([migration('002_b.sql', 'SELECT 1;')], new Map([['001_a.sql', 'whatever']]));
  assert.deepEqual(plan.missing, ['001_a.sql']);
});

// -------------------------------------------------------------- group orders

test('group order: names are trimmed, blanks dropped, and two are the minimum', () => {
  assert.deepEqual(validateParticipants(['  Alice ', 'Bob', '  ']), ['Alice', 'Bob']);
  assert.deepEqual(validateParticipants([]), []);
  assert.deepEqual(validateParticipants(undefined), []);
  // One person is not a group, and the form should say so rather than silently
  // creating a group of one.
  assert.throws(() => validateParticipants(['Alice']), ValidationError);
  assert.throws(() => validateParticipants(['Alice', ' ', '']), ValidationError);
});

test('group order: the same name twice would split the bill wrongly', () => {
  assert.throws(() => validateParticipants(['Alice', 'alice']), ValidationError);
  assert.throws(() => validateParticipants(['Alice', 'Bob', 'ALICE']), ValidationError);
  assert.throws(() => validateParticipants(Array.from({ length: MAX_PARTICIPANTS + 1 }, (_, i) => `P${i}`)), ValidationError);
  assert.throws(() => validateParticipants('Alice'), ValidationError);
  assert.throws(() => validateParticipants([42]), ValidationError);
});

test('group order: every line names somebody who is actually in the order', () => {
  const lines = [
    { itemId: 1, quantity: 1, participant: 'Alice' },
    { itemId: 1, quantity: 1, participant: 'Bob' },
  ];
  const ok = validateOrderInput({ ...order, participants: ['Alice', 'Bob'], items: lines }, now);
  assert.equal(ok.participants.length, 2);
  // The same dish for two people is two lines; that is the whole point.
  assert.equal(ok.lines.length, 2);

  assert.throws(
    () =>
      validateOrderInput(
        { ...order, participants: ['Alice', 'Bob'], items: [{ itemId: 1, quantity: 1, participant: 'Carol' }] },
        now,
      ),
    ValidationError,
  );
});

test('group order: the same dish for the same person twice is one line, not two', () => {
  assert.throws(
    () =>
      validateOrderInput(
        {
          ...order,
          participants: ['Alice', 'Bob'],
          items: [
            { itemId: 1, quantity: 1, participant: 'Alice' },
            { itemId: 1, quantity: 2, participant: 'Alice' },
          ],
        },
        now,
      ),
    ValidationError,
  );
});

test('group order: a group with every dish unassigned would have nothing to split', () => {
  assert.throws(
    () => validateOrderInput({ ...order, participants: ['Alice', 'Bob'] }, now),
    ValidationError,
  );
});

test('group order: the people are part of the order fingerprint', () => {
  // Otherwise a retry under the same attempt could arrive with a different bill split.
  const alone = validateOrderInput(order, now).hash;
  const shared = validateOrderInput(
    { ...order, participants: ['Alice', 'Bob'], items: [{ itemId: 1, quantity: 2, participant: 'Alice' }] },
    now,
  ).hash;
  const other = validateOrderInput(
    { ...order, participants: ['Alice', 'Carol'], items: [{ itemId: 1, quantity: 2, participant: 'Alice' }] },
    now,
  ).hash;
  assert.notEqual(alone, shared);
  assert.notEqual(shared, other);
});

// ---------------------------------------------------------- the dish search

test('dish search: an empty query narrows nothing', () => {
  const filter = validateDishFilter({});
  assert.deepEqual(filter, {
    search: null,
    minCalories: null,
    maxCalories: null,
    maxPriceTiyn: null,
    tags: [],
    withoutTags: [],
    sort: 'menu',
  });
});

test('dish search: calories, budget and labels are read from a query string', () => {
  const filter = validateDishFilter({
    search: '  chicken ',
    maxCalories: '600',
    maxPriceTiyn: '200000',
    tags: 'halal,gluten-free',
    withoutTags: 'contains-nuts',
    sort: 'calories',
  });
  assert.equal(filter.search, 'chicken');
  assert.equal(filter.maxCalories, 600);
  assert.equal(filter.maxPriceTiyn, 200000);
  assert.deepEqual(filter.tags, ['halal', 'gluten-free']);
  assert.deepEqual(filter.withoutTags, ['contains-nuts']);
  assert.equal(filter.sort, 'calories');
  // A repeated query parameter arrives as an array, and means the same thing.
  assert.deepEqual(validateDishFilter({ tags: ['vegan', 'vegan'] }).tags, ['vegan']);
});

test('dish search: an unknown label, a backwards range and a contradiction are refused', () => {
  assert.throws(() => validateDishFilter({ tags: 'delicious' }), ValidationError);
  assert.throws(() => validateDishFilter({ minCalories: 800, maxCalories: 200 }), ValidationError);
  // "Must be vegan" and "must not be vegan" can never match anything, and is far
  // more likely to be a mistake than a question.
  assert.throws(() => validateDishFilter({ tags: 'vegan', withoutTags: 'vegan' }), ValidationError);
  assert.throws(() => validateDishFilter({ maxCalories: -1 }), ValidationError);
  assert.throws(() => validateDishFilter({ maxPriceTiyn: 'free' }), ValidationError);
  assert.throws(() => validateDishFilter({ search: 'x'.repeat(61) }), ValidationError);
  // An unknown sort is not an error, it is simply the default.
  assert.equal(validateDishFilter({ sort: 'sideways' }).sort, 'menu');
});

test('dish search: the labels are a closed list, shared with the database', () => {
  assert.deepEqual(
    [...DIET_TAGS],
    ['vegetarian', 'vegan', 'spicy', 'contains-nuts', 'gluten-free', 'halal', 'dairy-free'],
  );
});

// ------------------------------------------------------------ dish nutrition

test('dish nutrition: empty means unmeasured, and a figure given has to be real', () => {
  const blank = validateNutrition({});
  assert.equal(blank.caloriesKcal, null);
  assert.equal(blank.ingredients, '');
  assert.deepEqual(blank.tags, []);

  const filled = validateNutrition({
    caloriesKcal: '520',
    proteinG: 14.26,
    fatG: 16,
    carbsG: 78,
    ingredients: '  rice, vegetables  ',
    tags: ['vegetarian'],
  });
  assert.equal(filled.caloriesKcal, 520);
  assert.equal(filled.proteinG, 14.3); // one decimal, as the column stores it
  assert.equal(filled.ingredients, 'rice, vegetables');

  assert.throws(() => validateNutrition({ caloriesKcal: -1 }), ValidationError);
  assert.throws(() => validateNutrition({ caloriesKcal: 99999 }), ValidationError);
  assert.throws(() => validateNutrition({ ingredients: 'x'.repeat(401) }), ValidationError);
  assert.throws(() => validateNutrition({ tags: ['tasty'] }), ValidationError);
});

test('dish nutrition: an update leaves out what it does not mention', () => {
  // The bug this guards against: a form that posts only name and price would
  // otherwise blank the calories somebody had measured, because "absent" and
  // "null" looked the same to the server.
  const patch = validateNutritionPatch({ name: 'Lemon tea', priceTiyn: 60000 });
  assert.deepEqual(patch, {});
  assert.equal('caloriesKcal' in patch, false);

  // Mentioning one field changes that field and nothing else.
  const one = validateNutritionPatch({ caloriesKcal: 60 });
  assert.deepEqual(Object.keys(one), ['caloriesKcal']);
  assert.equal(one.caloriesKcal, 60);

  // An explicit null is still how a figure is deliberately cleared.
  const cleared = validateNutritionPatch({ caloriesKcal: null });
  assert.equal('caloriesKcal' in cleared, true);
  assert.equal(cleared.caloriesKcal, null);

  // And the rules still apply to what is sent.
  assert.throws(() => validateNutritionPatch({ caloriesKcal: -5 }), ValidationError);
});

// ------------------------------------------------------ delivery confirmation

test('delivery code: exactly four digits, however they arrive', () => {
  assert.equal(validateConfirmationCode({ code: '0427' }), '0427');
  assert.equal(validateConfirmationCode({ code: ' 0427 ' }), '0427');
  // A JSON number loses a leading zero, so it is read as text either way.
  assert.equal(validateConfirmationCode({ code: 1234 }), '1234');

  const bad = (code: unknown) => assert.throws(() => validateConfirmationCode({ code }), ValidationError);
  bad('42');
  bad('12345');
  bad('12a4');
  bad('');
  bad(undefined);
  assert.throws(() => validateConfirmationCode(null), ValidationError);
});

// ------------------------------------------------------------- the chart

test('chart: it defaults to revenue by day', () => {
  const query = validateChartQuery({});
  assert.equal(query.metric, 'revenue');
  assert.equal(query.bucket, 'day');
  assert.equal(query.from, null);
  assert.equal(query.to, null);
});

test('chart: every metric and bucket it offers is accepted, and nothing else is', () => {
  for (const metric of CHART_METRICS) assert.equal(validateChartQuery({ metric }).metric, metric);
  for (const bucket of CHART_BUCKETS) assert.equal(validateChartQuery({ bucket }).bucket, bucket);
  assert.throws(() => validateChartQuery({ metric: 'profit' }), ValidationError);
  assert.throws(() => validateChartQuery({ bucket: 'hour' }), ValidationError);
  assert.throws(() => validateChartQuery({ from: 'last tuesday' }), ValidationError);
  assert.throws(() => validateChartQuery({ from: '2026-11-26', to: '2026-01-01' }), ValidationError);
});
