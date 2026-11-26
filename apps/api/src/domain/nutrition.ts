// What an order adds up to, and what can honestly be said about it.
//
// Like every file in `domain/`, this imports nothing but Node built-ins, so the
// tests run it straight from the source.
//
// A word on what this is not. The advice here is arithmetic against a published
// reference diet, not a medical opinion: it says "this order is 60% of a 2000
// kcal day", never "you should eat this". Nobody's age, weight, activity or
// condition is known to this system, and a system that does not know them has
// no business telling anyone what to eat.

/** Energy in one gram of each macronutrient, in kcal. */
export const KCAL_PER_GRAM = { protein: 4, fat: 9, carbs: 4 } as const;

/**
 * A reference day, for putting one order in proportion.
 *
 * These are the round figures used on food labels (a 2000 kcal day), not a
 * recommendation for any particular person.
 */
export const REFERENCE_DAY = {
  calories: 2000,
  protein: 50,
  fat: 70,
  carbs: 260,
} as const;

export interface Nutrition {
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
}

export interface NutritionLine extends Nutrition {
  quantity: number;
}

export interface NutritionTotals {
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Dishes in the order whose nutrition nobody has filled in yet. */
  unknownDishes: number;
  /** True when at least one dish is missing figures, so the total understates the order. */
  incomplete: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Adds an order up.
 *
 * A dish with no figures contributes nothing and is counted separately, rather
 * than being guessed at: a total that silently treats unknown as zero would
 * report a 900 kcal order as 300 and call it light.
 */
export function sumNutrition(lines: readonly NutritionLine[]): NutritionTotals {
  let caloriesKcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  let unknownDishes = 0;

  for (const line of lines) {
    const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 0;
    if (line.caloriesKcal === null || line.caloriesKcal === undefined) {
      unknownDishes += 1;
      continue;
    }
    caloriesKcal += line.caloriesKcal * quantity;
    proteinG += (line.proteinG ?? 0) * quantity;
    fatG += (line.fatG ?? 0) * quantity;
    carbsG += (line.carbsG ?? 0) * quantity;
  }

  return {
    caloriesKcal: Math.round(caloriesKcal),
    proteinG: round1(proteinG),
    fatG: round1(fatG),
    carbsG: round1(carbsG),
    unknownDishes,
    incomplete: unknownDishes > 0,
  };
}

/** What share of a reference day this order is, as a whole percent. */
export function shareOfDay(totals: NutritionTotals): number {
  return Math.round((totals.caloriesKcal / REFERENCE_DAY.calories) * 100);
}

/**
 * Where the energy comes from, as percentages that add to 100.
 *
 * Worked out from the macronutrients rather than from the stated calories: the
 * two can disagree by a few percent, and the split has to add up.
 */
export function energySplit(totals: NutritionTotals): { protein: number; fat: number; carbs: number } {
  const fromProtein = totals.proteinG * KCAL_PER_GRAM.protein;
  const fromFat = totals.fatG * KCAL_PER_GRAM.fat;
  const fromCarbs = totals.carbsG * KCAL_PER_GRAM.carbs;
  const total = fromProtein + fromFat + fromCarbs;
  if (total <= 0) return { protein: 0, fat: 0, carbs: 0 };

  const protein = Math.round((fromProtein / total) * 100);
  const fat = Math.round((fromFat / total) * 100);
  // The last one takes the remainder, so rounding never makes the three add to 99 or 101.
  return { protein, fat, carbs: Math.max(0, 100 - protein - fat) };
}

export type AdviceSeverity = 'info' | 'note' | 'warning';

export interface Advice {
  /** A key the website translates; the numbers travel beside it. */
  code: string;
  severity: AdviceSeverity;
  values: Record<string, number>;
}

/**
 * What can be said about this order.
 *
 * Every line is a statement of arithmetic with its numbers attached, so the
 * website can say it in any language without the server choosing words. The
 * order is deliberate: the share of the day first, because it is the one figure
 * that is always true and always useful.
 */
export function adviceFor(totals: NutritionTotals): Advice[] {
  const advice: Advice[] = [];

  if (totals.caloriesKcal > 0) {
    advice.push({
      code: 'advice.shareOfDay',
      severity: 'info',
      values: { percent: shareOfDay(totals), calories: totals.caloriesKcal, day: REFERENCE_DAY.calories },
    });
  }

  // More than two thirds of a day's energy in a single order is worth naming,
  // not because it is wrong, but because it is easy not to notice.
  if (totals.caloriesKcal >= REFERENCE_DAY.calories * 0.66) {
    advice.push({
      code: 'advice.heavyOrder',
      severity: 'warning',
      values: { percent: shareOfDay(totals) },
    });
  } else if (totals.caloriesKcal > 0 && totals.caloriesKcal <= REFERENCE_DAY.calories * 0.15) {
    advice.push({ code: 'advice.lightOrder', severity: 'info', values: { calories: totals.caloriesKcal } });
  }

  const split = energySplit(totals);
  if (totals.caloriesKcal > 0) {
    // The usual reference ranges on a food label: 10–35% protein, 20–35% fat.
    if (split.fat >= 40) {
      advice.push({ code: 'advice.highFat', severity: 'note', values: { percent: split.fat } });
    }
    if (split.protein < 10 && totals.caloriesKcal >= 400) {
      advice.push({ code: 'advice.lowProtein', severity: 'note', values: { percent: split.protein } });
    } else if (split.protein >= 25) {
      advice.push({ code: 'advice.goodProtein', severity: 'info', values: { percent: split.protein } });
    }
    if (split.fat <= 35 && split.protein >= 10 && split.protein <= 35) {
      advice.push({ code: 'advice.balanced', severity: 'info', values: {} });
    }
  }

  // Said last and said plainly: everything above describes only the dishes that
  // have figures, and the reader has to know that.
  if (totals.incomplete) {
    advice.push({
      code: 'advice.incomplete',
      severity: 'warning',
      values: { dishes: totals.unknownDishes },
    });
  }

  return advice;
}

/** The whole picture for one cart or one order. */
export interface NutritionSummary extends NutritionTotals {
  shareOfDayPercent: number;
  energySplit: { protein: number; fat: number; carbs: number };
  advice: Advice[];
  referenceDay: typeof REFERENCE_DAY;
}

export function summarise(lines: readonly NutritionLine[]): NutritionSummary {
  const totals = sumNutrition(lines);
  return {
    ...totals,
    shareOfDayPercent: shareOfDay(totals),
    energySplit: energySplit(totals),
    advice: adviceFor(totals),
    referenceDay: REFERENCE_DAY,
  };
}
