'use client';

import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionaries';
import type { NutritionSummary } from '@/lib/types';

const SEVERITY_STYLE: Record<string, string> = {
  info: 'bg-stone-100 text-stone-700',
  note: 'bg-amber-50 text-amber-900',
  warning: 'bg-red-50 text-red-800',
};

/**
 * What an order adds up to, and what can honestly be said about it.
 *
 * Every sentence comes from the server as a key and a set of numbers, so the
 * wording lives in the dictionary and the arithmetic lives in one place. The
 * note at the bottom is not decoration: this is a reference-day calculation,
 * not advice for a particular person, and saying so is the difference between
 * information and a claim nobody here is qualified to make.
 */
export default function NutritionPanel({
  summary,
  title,
  compact = false,
}: {
  summary: NutritionSummary;
  title?: string;
  compact?: boolean;
}) {
  const t = useI18n().t;
  if (!summary) return null;

  const { energySplit: split } = summary;
  const nothingKnown = summary.caloriesKcal === 0 && summary.incomplete;

  return (
    <section className="card" aria-labelledby="nutrition-h">
      <h2 id="nutrition-h" className="font-medium">
        {title ?? t('nutrition.title')}
      </h2>

      {nothingKnown ? (
        <p className="mt-2 text-sm text-stone-600">{t('nutrition.unknown')}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-stone-600">{t('nutrition.calories')}</dt>
              <dd className="text-lg font-semibold">{t('nutrition.kcal', { value: summary.caloriesKcal })}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">{t('nutrition.protein')}</dt>
              <dd className="text-lg font-semibold">{t('nutrition.grams', { value: summary.proteinG })}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">{t('nutrition.fat')}</dt>
              <dd className="text-lg font-semibold">{t('nutrition.grams', { value: summary.fatG })}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-600">{t('nutrition.carbs')}</dt>
              <dd className="text-lg font-semibold">{t('nutrition.grams', { value: summary.carbsG })}</dd>
            </div>
          </dl>

          {!compact && summary.caloriesKcal > 0 && (
            <div className="mt-4">
              <p className="label">{t('nutrition.energySplit')}</p>
              {/*
                One bar rather than three numbers: the question is how the energy
                divides, and a divided bar answers it without arithmetic. The
                figures stay in the labels underneath for anyone who wants them.
              */}
              <div
                className="flex h-3 overflow-hidden rounded-full bg-stone-200"
                role="img"
                aria-label={`${t('nutrition.protein')} ${split.protein}%, ${t('nutrition.fat')} ${split.fat}%, ${t('nutrition.carbs')} ${split.carbs}%`}
              >
                <span className="bg-emerald-500" style={{ width: `${split.protein}%` }} />
                <span className="bg-amber-400" style={{ width: `${split.fat}%` }} />
                <span className="bg-sky-900/70" style={{ width: `${split.carbs}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  {t('nutrition.protein')} {split.protein}%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                  {t('nutrition.fat')} {split.fat}%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-900/70" aria-hidden="true" />
                  {t('nutrition.carbs')} {split.carbs}%
                </span>
              </p>
            </div>
          )}
        </>
      )}

      {summary.advice.length > 0 && (
        <ul className="mt-4 space-y-2">
          {summary.advice.map((advice) => (
            <li
              key={advice.code}
              className={`rounded-lg px-3 py-2 text-sm ${SEVERITY_STYLE[advice.severity] ?? SEVERITY_STYLE.info}`}
            >
              {t(advice.code as MessageKey, advice.values)}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-stone-500">{t('nutrition.disclaimer')}</p>
    </section>
  );
}
