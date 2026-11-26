// What an order adds up to, and what may honestly be said about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KCAL_PER_GRAM,
  REFERENCE_DAY,
  adviceFor,
  energySplit,
  shareOfDay,
  sumNutrition,
  summarise,
} from '../src/domain/nutrition.ts';

const dish = (caloriesKcal: number | null, proteinG = 0, fatG = 0, carbsG = 0, quantity = 1) => ({
  caloriesKcal,
  proteinG,
  fatG,
  carbsG,
  quantity,
});

test('nutrition: an order is the sum of its dishes, times how many of each', () => {
  const totals = sumNutrition([dish(500, 20, 15, 60, 2), dish(100, 2, 1, 20)]);
  assert.equal(totals.caloriesKcal, 1100);
  assert.equal(totals.proteinG, 42);
  assert.equal(totals.fatG, 31);
  assert.equal(totals.carbsG, 140);
  assert.equal(totals.incomplete, false);
});

test('nutrition: a dish nobody has measured is counted, not guessed at', () => {
  // Treating "unknown" as zero would report a 900 kcal order as 400 and call it light.
  const totals = sumNutrition([dish(400, 10, 10, 50), dish(null)]);
  assert.equal(totals.caloriesKcal, 400);
  assert.equal(totals.unknownDishes, 1);
  assert.equal(totals.incomplete, true);
  // And the order says so out loud.
  assert.ok(adviceFor(totals).some((a) => a.code === 'advice.incomplete' && a.severity === 'warning'));
});

test('nutrition: a broken quantity contributes nothing rather than a negative total', () => {
  const totals = sumNutrition([dish(500, 20, 15, 60, -3), dish(500, 20, 15, 60, Number.NaN)]);
  assert.equal(totals.caloriesKcal, 0);
  assert.equal(totals.proteinG, 0);
});

test('nutrition: the share of a reference day is a plain percentage', () => {
  assert.equal(REFERENCE_DAY.calories, 2000);
  assert.equal(shareOfDay(sumNutrition([dish(1000)])), 50);
  assert.equal(shareOfDay(sumNutrition([dish(0)])), 0);
});

test('nutrition: the energy split is worked out from the macronutrients and always adds to 100', () => {
  assert.deepEqual(KCAL_PER_GRAM, { protein: 4, fat: 9, carbs: 4 });
  // 100 g protein (400) + 100 g fat (900) + 100 g carbs (400) = 1700 kcal.
  const split = energySplit(sumNutrition([dish(1700, 100, 100, 100)]));
  assert.equal(split.protein + split.fat + split.carbs, 100);
  assert.equal(split.fat, 53);

  // Rounding must never leave the three adding up to 99 or 101.
  for (const [p, f, c] of [
    [33, 33, 33],
    [10, 7, 70],
    [1, 1, 1],
  ] as const) {
    const parts = energySplit(sumNutrition([dish(500, p, f, c)]));
    assert.equal(parts.protein + parts.fat + parts.carbs, 100, `${p}/${f}/${c}`);
  }
  // Nothing to divide: no split rather than a division by zero.
  assert.deepEqual(energySplit(sumNutrition([dish(0)])), { protein: 0, fat: 0, carbs: 0 });
});

test('nutrition: a large order is named as such, a small one is not', () => {
  const heavy = adviceFor(sumNutrition([dish(1500, 50, 60, 150)]));
  assert.ok(heavy.some((a) => a.code === 'advice.heavyOrder' && a.severity === 'warning'));

  const light = adviceFor(sumNutrition([dish(200, 5, 4, 30)]));
  assert.ok(light.some((a) => a.code === 'advice.lightOrder'));
  assert.ok(!light.some((a) => a.code === 'advice.heavyOrder'));
});

test('nutrition: the advice describes the balance, and says where the numbers came from', () => {
  // Mostly fat: 50 g fat is 450 of 700 kcal.
  const fatty = adviceFor(sumNutrition([dish(700, 10, 50, 50)]));
  assert.ok(fatty.some((a) => a.code === 'advice.highFat'));

  // Mostly sugar, almost no protein.
  const sugary = adviceFor(sumNutrition([dish(600, 2, 2, 140)]));
  assert.ok(sugary.some((a) => a.code === 'advice.lowProtein'));

  // A balanced plate says so rather than saying nothing.
  const balanced = adviceFor(sumNutrition([dish(600, 35, 18, 70)]));
  assert.ok(balanced.some((a) => a.code === 'advice.balanced'));

  // Every piece of advice carries the numbers it was based on, so the page can
  // say it in any language without the server choosing words.
  const first = fatty[0];
  assert.equal(first.code, 'advice.shareOfDay');
  assert.equal(typeof first.values.percent, 'number');
  assert.equal(first.values.day, REFERENCE_DAY.calories);
});

test('nutrition: an empty basket produces no claims at all', () => {
  const summary = summarise([]);
  assert.equal(summary.caloriesKcal, 0);
  assert.deepEqual(summary.advice, []);
  assert.equal(summary.incomplete, false);
});

test('nutrition: the summary carries the totals, the split, the share and the advice together', () => {
  const summary = summarise([dish(600, 35, 18, 70), dish(45, 0, 0, 11)]);
  assert.equal(summary.caloriesKcal, 645);
  assert.equal(summary.shareOfDayPercent, shareOfDay(summary));
  assert.equal(summary.energySplit.protein + summary.energySplit.fat + summary.energySplit.carbs, 100);
  assert.equal(summary.referenceDay.calories, 2000);
  assert.ok(summary.advice.length > 0);
});
