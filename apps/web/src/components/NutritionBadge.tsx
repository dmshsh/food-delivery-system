'use client';

import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionaries';
import type { DietTag, MenuItem } from '@/lib/types';

/** How a label is coloured: a warning reads differently from a preference. */
const TAG_STYLE: Record<DietTag, string> = {
  vegetarian: 'bg-emerald-50 text-emerald-900',
  vegan: 'bg-emerald-50 text-emerald-900',
  'gluten-free': 'bg-sky-100 text-sky-900',
  'dairy-free': 'bg-sky-100 text-sky-900',
  halal: 'bg-violet-100 text-violet-900',
  spicy: 'bg-amber-100 text-amber-900',
  // Not a preference but an allergy warning, so it is the one that stands out.
  'contains-nuts': 'bg-red-100 text-red-900',
};

/**
 * The line under a dish: what it carries, and what it is made of.
 *
 * A dish nobody has measured says so rather than showing a zero. "0 kcal" and
 * "we have not weighed this" are different facts, and only one of them is true.
 */
export default function NutritionBadge({ item }: { item: MenuItem }) {
  const t = useI18n().t;
  const tags = item.tags ?? [];

  return (
    <div className="mt-2 space-y-1.5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        {item.caloriesKcal === null ? (
          <span>{t('nutrition.unknown')}</span>
        ) : (
          <>
            <span className="font-medium text-stone-700">{t('nutrition.kcal', { value: item.caloriesKcal })}</span>
            {item.proteinG !== null && (
              <span>
                {t('nutrition.protein')} {t('nutrition.grams', { value: item.proteinG })}
              </span>
            )}
            {item.fatG !== null && (
              <span>
                {t('nutrition.fat')} {t('nutrition.grams', { value: item.fatG })}
              </span>
            )}
            {item.carbsG !== null && (
              <span>
                {t('nutrition.carbs')} {t('nutrition.grams', { value: item.carbsG })}
              </span>
            )}
          </>
        )}
      </p>

      {tags.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${TAG_STYLE[tag] ?? 'bg-stone-200 text-stone-800'}`}>
              {t(`tag.${tag}` as MessageKey)}
            </span>
          ))}
        </p>
      )}

      {item.ingredients && <p className="text-xs italic text-stone-500">{item.ingredients}</p>}
    </div>
  );
}
