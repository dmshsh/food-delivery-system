'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DishFilters, { EMPTY_FILTER, type FilterState } from '@/components/DishFilters';
import EmptyState from '@/components/EmptyState';
import NutritionBadge from '@/components/NutritionBadge';
import { SkeletonMenu } from '@/components/Skeleton';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import { formatKzt, translateError } from '@/lib/format';
import { MAX_QUANTITY, cartCount, quantityOfDish, setQuantity } from '@/store/cartSlice';
import { useMenuQuery } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export default function MenuPage() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const { t, lang } = useI18n();
  const c = useContent();

  const [form, setForm] = useState<FilterState>(EMPTY_FILTER);
  // The text box is debounced so typing an ingredient does not fire a request
  // per keystroke. Everything else applies at once: a click is a finished
  // thought, and waiting for it feels like the page is broken.
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTER);
  useEffect(() => {
    const delay = form.search === applied.search ? 0 : 300;
    const timer = setTimeout(() => setApplied(form), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const { data, isLoading, isError, error, refetch, isFetching } = useMenuQuery(applied);
  const [category, setCategory] = useState('All');

  const items = data?.items ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const visible = category === 'All' ? items : items.filter((i) => i.category === category);

  const count = cartCount(cart);
  // A filtered menu may not hold every dish that is in the cart, so this total
  // covers what is on screen; the checkout is the one place that states the
  // real one, from the server's own prices.
  const total = useMemo(
    () =>
      Object.values(cart.lines).reduce((sum, line) => {
        const item = items.find((i) => i.id === line.itemId);
        return sum + (item ? item.priceTiyn * line.quantity : 0);
      }, 0),
    [cart.lines, items],
  );

  const filtering =
    Boolean(applied.search) ||
    Boolean(applied.maxPriceTiyn) ||
    Boolean(applied.maxCalories) ||
    applied.tags.length > 0 ||
    applied.withoutTags.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('menu.title')}</h1>
      <p className="mt-1 text-stone-600">{t('menu.subtitle')}</p>

      <DishFilters
        value={form}
        onChange={setForm}
        bounds={data?.bounds}
        availableTags={data?.availableTags}
        resultCount={items.length}
      />

      {!isLoading && categories.length > 2 && (
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label={t('menu.categories')}>
          {categories.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={cat === category}
              onClick={() => setCategory(cat)}
              className={cat === category ? 'btn-primary' : 'btn-secondary'}
            >
              {cat === 'All' ? t('common.all') : c.category(cat)}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="mt-5">
          <SkeletonMenu />
        </div>
      )}

      {isError && (
        <div className="mt-6">
          <EmptyState
            kind="error"
            title={t('menu.loadFailed')}
            description={translateError(error, t)}
            onAction={() => refetch()}
            actionLabel={t('common.retry')}
          />
        </div>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <div className="mt-6">
          <EmptyState
            kind={filtering ? 'noMatch' : 'empty'}
            title={filtering ? t('filters.noMatch') : t('admin.emptyMenu')}
            description={filtering ? t('filters.noMatchHint') : undefined}
            onAction={filtering ? () => setForm(EMPTY_FILTER) : undefined}
            actionLabel={filtering ? t('filters.clear') : undefined}
          />
        </div>
      )}

      <ul className={`mt-5 grid gap-4 sm:grid-cols-2 ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        {visible.map((item) => {
          const qty = quantityOfDish(cart, item.id);
          return (
            <li key={item.id} className="card flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-medium">{c.dish(item.name)}</h2>
                  <span className="whitespace-nowrap font-medium text-emerald-800">
                    {formatKzt(item.priceTiyn, lang)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-600">{c.description(item.name, item.description)}</p>
                <NutritionBadge item={item} />
              </div>
              {qty === 0 ? (
                <button
                  className="btn-primary self-start"
                  onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: 1 }))}
                >
                  {t('menu.add')}
                </button>
              ) : (
                <div className="flex items-center gap-3 self-start">
                  <button
                    className="btn-secondary"
                    aria-label={t('menu.removeOne', { name: c.dish(item.name) })}
                    onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: qty - 1 }))}
                  >
                    −
                  </button>
                  <span className="w-6 text-center" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    className="btn-secondary"
                    aria-label={t('menu.addOne', { name: c.dish(item.name) })}
                    disabled={qty >= MAX_QUANTITY}
                    onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: qty + 1 }))}
                  >
                    +
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {count > 0 && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-4 rounded-xl bg-emerald-800 px-5 py-3 text-white shadow-lg">
          <span className="text-sm sm:text-base">
            {t('menu.itemsInCart', { count, total: formatKzt(total, lang) })}
          </span>
          <Link
            href="/checkout"
            className="whitespace-nowrap rounded-lg bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
          >
            {t('menu.goToCheckout')}
          </Link>
        </div>
      )}
    </div>
  );
}
