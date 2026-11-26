'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionaries';
import { formatKzt } from '@/lib/format';
import type { DietTag } from '@/lib/types';

export interface FilterState {
  search: string;
  maxPriceTiyn: number | '';
  maxCalories: number | '';
  tags: DietTag[];
  withoutTags: DietTag[];
  sort: 'menu' | 'price' | 'calories';
}

export const EMPTY_FILTER: FilterState = {
  search: '',
  maxPriceTiyn: '',
  maxCalories: '',
  tags: [],
  withoutTags: [],
  sort: 'menu',
};

/**
 * Finding a dish by what is in it, what it costs, and how much energy it carries.
 *
 * Each label is a three-state control rather than a checkbox: "must be",
 * "must not be", or "do not care". Two separate lists of checkboxes — one to
 * require and one to exclude — take twice the space and let somebody tick the
 * same label in both, which can never match anything.
 */
export default function DishFilters({
  value,
  onChange,
  bounds,
  availableTags,
  resultCount,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  bounds?: { minPriceTiyn: number; maxPriceTiyn: number; minCalories: number; maxCalories: number; total: number };
  availableTags?: DietTag[];
  resultCount: number;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  const tags = availableTags ?? [];
  const active =
    Boolean(value.search) ||
    value.maxPriceTiyn !== '' ||
    value.maxCalories !== '' ||
    value.tags.length > 0 ||
    value.withoutTags.length > 0 ||
    value.sort !== 'menu';

  /** do not care -> must be -> must not be -> do not care */
  function cycleTag(tag: DietTag) {
    if (value.tags.includes(tag)) {
      onChange({ ...value, tags: value.tags.filter((x) => x !== tag), withoutTags: [...value.withoutTags, tag] });
    } else if (value.withoutTags.includes(tag)) {
      onChange({ ...value, withoutTags: value.withoutTags.filter((x) => x !== tag) });
    } else {
      onChange({ ...value, tags: [...value.tags, tag] });
    }
  }

  function tagState(tag: DietTag): 'required' | 'excluded' | 'off' {
    if (value.tags.includes(tag)) return 'required';
    if (value.withoutTags.includes(tag)) return 'excluded';
    return 'off';
  }

  return (
    <section className="mt-4" aria-labelledby="filters-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="filters-h" className="font-medium">
            {t('filters.title')}
          </h2>
          <p className="text-sm text-stone-600">{t('filters.hint')}</p>
        </div>
        <button type="button" className="btn-secondary sm:hidden" onClick={() => setOpen((v) => !v)}>
          {open ? t('filters.hide') : t('filters.show')}
        </button>
      </div>

      <div className={`card mt-3 ${open ? '' : 'hidden'} sm:block`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="dish-search" className="label">
              {t('filters.search')}
            </label>
            <input
              id="dish-search"
              type="search"
              className="input"
              maxLength={60}
              placeholder={t('filters.searchPlaceholder')}
              value={value.search}
              onChange={(e) => onChange({ ...value, search: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="budget" className="label">
              {t('filters.budget')}
            </label>
            <select
              id="budget"
              className="input"
              value={value.maxPriceTiyn}
              onChange={(e) =>
                onChange({ ...value, maxPriceTiyn: e.target.value === '' ? '' : Number(e.target.value) })
              }
            >
              <option value="">{t('filters.anyBudget')}</option>
              {budgetSteps(bounds?.maxPriceTiyn ?? 0).map((step) => (
                <option key={step} value={step}>
                  ≤ {formatKzt(step, lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="calories" className="label">
              {t('filters.maxCalories')}
            </label>
            <select
              id="calories"
              className="input"
              value={value.maxCalories}
              onChange={(e) => onChange({ ...value, maxCalories: e.target.value === '' ? '' : Number(e.target.value) })}
            >
              <option value="">{t('filters.anyCalories')}</option>
              {calorieSteps(bounds?.maxCalories ?? 0).map((step) => (
                <option key={step} value={step}>
                  ≤ {step} kcal
                </option>
              ))}
            </select>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-4">
            <p className="label">
              {t('filters.tags')} / {t('filters.without')}
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const state = tagState(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => cycleTag(tag)}
                    aria-pressed={state !== 'off'}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      state === 'required'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : state === 'excluded'
                          ? 'border-red-300 bg-red-50 text-red-800 line-through'
                          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {state === 'required' ? '✓ ' : state === 'excluded' ? '✕ ' : ''}
                    {t(`tag.${tag}` as MessageKey)}
                  </button>
                );
              })}
            </div>
            {value.withoutTags.length > 0 && (
              <p className="mt-2 text-xs text-stone-500">{t('filters.unlabelledExcluded')}</p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sort" className="label">
              {t('filters.sort')}
            </label>
            <select
              id="sort"
              className="input"
              value={value.sort}
              onChange={(e) => onChange({ ...value, sort: e.target.value as FilterState['sort'] })}
            >
              <option value="menu">{t('filters.sortMenu')}</option>
              <option value="price">{t('filters.sortPrice')}</option>
              <option value="calories">{t('filters.sortCalories')}</option>
            </select>
          </div>

          <p className="ml-auto text-sm text-stone-600" aria-live="polite">
            {t('filters.found', { count: resultCount, total: bounds?.total ?? resultCount })}
          </p>
          {active && (
            <button type="button" className="btn-secondary" onClick={() => onChange(EMPTY_FILTER)}>
              {t('filters.clear')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Round budget steps up to the dearest dish.
 *
 * A free-typed number would be exact and useless — nobody thinks "dishes under
 * 1,437 tenge" — and a slider needs a drag to say something a list says in one
 * tap, which matters more on a phone.
 */
function budgetSteps(maxPriceTiyn: number): number[] {
  if (maxPriceTiyn <= 0) return [];
  const steps: number[] = [];
  for (const kzt of [500, 1000, 1500, 2000, 3000, 5000]) {
    const tiyn = kzt * 100;
    if (tiyn < maxPriceTiyn) steps.push(tiyn);
  }
  return steps;
}

function calorieSteps(maxCalories: number): number[] {
  if (maxCalories <= 0) return [];
  return [100, 200, 300, 500, 700, 1000].filter((step) => step < maxCalories);
}
