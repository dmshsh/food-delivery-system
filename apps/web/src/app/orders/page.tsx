'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import FeedbackForm from '@/components/FeedbackForm';
import { SkeletonCards } from '@/components/Skeleton';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import {
  ALL_STATUSES,
  formatDateTime,
  formatKzt,
  formatPoints,
  statusKey,
  translateError,
} from '@/lib/format';
import type { Order, OrderStatus, RepeatOrder } from '@/lib/types';
import { useLazyRepeatOrderQuery, useOrdersQuery } from '@/store/api';
import { clearCart, setQuantity } from '@/store/cartSlice';
import { useAppDispatch } from '@/store/hooks';

export default function OrdersPage() {
  return (
    <RequireRole roles={['CUSTOMER']}>
      <MyOrders />
    </RequireRole>
  );
}

const EMPTY = { status: '' as OrderStatus | '', search: '', from: '', to: '' };

function MyOrders() {
  const { t, lang } = useI18n();
  const [form, setForm] = useState(EMPTY);
  // What is actually sent. The text box is debounced so a search does not fire
  // a request for every keystroke.
  const [applied, setApplied] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setApplied(form), 300);
    return () => clearTimeout(timer);
  }, [form]);

  const { data, isLoading, isFetching, error } = useOrdersQuery(applied, { pollingInterval: 15000 });
  const orders = useMemo(() => [...(data?.orders ?? [])].reverse(), [data]); // newest first
  const filtering = Boolean(applied.status || applied.search || applied.from || applied.to);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('orders.title')}</h1>
        <button type="button" className="btn-secondary sm:hidden" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? t('orders.hideFilters') : t('orders.showFilters')}
        </button>
      </div>

      {/* Filters: always open from the small-tablet width up, foldable on a phone. */}
      <section className={`card mt-4 ${showFilters ? '' : 'hidden'} sm:block`} aria-label={t('orders.filters')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="search" className="label">{t('orders.searchLabel')}</label>
            <input
              id="search"
              type="search"
              className="input"
              placeholder={t('orders.searchPlaceholder')}
              maxLength={60}
              value={form.search}
              onChange={(e) => setForm({ ...form, search: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="filter" className="label">{t('common.status')}</label>
            <select
              id="filter"
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus | '' })}
            >
              <option value="">{t('common.all')}</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{t(statusKey(s))}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="from" className="label">{t('common.from')}</label>
              <input id="from" type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </div>
            <div>
              <label htmlFor="to" className="label">{t('common.to')}</label>
              <input id="to" type="date" className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </div>
          </div>
        </div>
        {filtering && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-stone-600">
            <span aria-live="polite">{t('orders.resultCount', { count: orders.length })}</span>
            <button type="button" className="underline" onClick={() => setForm(EMPTY)}>
              {t('orders.clearFilters')}
            </button>
          </div>
        )}
      </section>

      {isLoading && (
        <div className="mt-4">
          <SkeletonCards count={3} lines={4} />
        </div>
      )}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}
      {data && orders.length === 0 && (
        <div className="mt-4">
          <EmptyState
            kind={filtering ? 'noMatch' : 'empty'}
            title={filtering ? t('orders.noMatches') : t('orders.none')}
            description={filtering ? t('filters.noMatchHint') : undefined}
            action={filtering ? undefined : { href: '/', label: t('checkout.browseMenu') }}
            onAction={filtering ? () => setForm(EMPTY) : undefined}
            actionLabel={filtering ? t('orders.clearFilters') : undefined}
          />
        </div>
      )}

      <ul className={`mt-4 space-y-3 ${isFetching && !isLoading ? 'opacity-70' : ''}`}>
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} lang={lang} />
        ))}
      </ul>
    </div>
  );
}

function OrderCard({ order: o, lang }: { order: Order; lang: string }) {
  const { t } = useI18n();
  const c = useContent();

  return (
    <li className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          <Link href={`/orders/${o.id}`} className="hover:underline">
            {t('checkout.orderNumber', { id: o.id })}
          </Link>
        </h2>
        <div className="flex items-center gap-2">
          {o.isGroup && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{t('group.title')}</span>
          )}
          <StatusBadge status={o.status} />
        </div>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {t('orders.placed', { date: formatDateTime(o.createdAt, lang) })} · {t('orders.deliverTo')}{' '}
        {o.deliveryTime ? formatDateTime(o.deliveryTime, lang) : t('checkout.asap')}
      </p>
      <p className="text-sm text-stone-600">{o.deliveryAddress}</p>
      <ul className="mt-2 text-sm">
        {o.items.map((i) => (
          <li key={i.itemId}>
            {i.quantity} × {c.dish(i.name)}
          </li>
        ))}
      </ul>
      {o.notes && <p className="mt-1 text-sm italic text-stone-600">“{o.notes}”</p>}

      <div className="mt-2 text-right text-sm">
        {Boolean(o.discountTiyn) && (
          <p className="text-stone-600">
            {t('orders.paidWithPoints', {
              total: formatKzt(o.totalTiyn ?? 0, lang),
              discount: formatKzt(o.discountTiyn ?? 0, lang),
              points: formatPoints(o.bonusSpent || o.bonusRequested || 0, lang, t('common.points')),
            })}
          </p>
        )}
        <p className="font-medium">{formatKzt(o.payableTiyn ?? o.totalTiyn ?? 0, lang)}</p>
        {Boolean(o.bonusEarned) && (
          <p className="text-emerald-800">
            {t('orders.earned', { points: formatPoints(o.bonusEarned ?? 0, lang, t('common.points')) })}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/orders/${o.id}`} className="btn-secondary">
          {t('order.open')}
        </Link>
      </div>
      <RepeatOrderButton orderId={o.id} lang={lang} />
      <FeedbackForm order={o} />
    </li>
  );
}

/**
 * "Order this again."
 *
 * The cart is not filled straight away: the menu may have changed since, so the
 * server is asked what is still orderable and at what price, and the person
 * sees that before anything replaces what is in their cart.
 */
function RepeatOrderButton({ orderId, lang }: { orderId: number; lang: string }) {
  const { t } = useI18n();
  const c = useContent();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [ask, { data, isFetching, error }] = useLazyRepeatOrderQuery();
  const [open, setOpen] = useState(false);

  function start() {
    setOpen(true);
    void ask(orderId);
  }

  function fill(result: RepeatOrder) {
    dispatch(clearCart());
    for (const item of result.items) {
      dispatch(setQuantity({ itemId: item.itemId, quantity: item.quantity }));
    }
    setOpen(false);
    router.push('/checkout');
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary mt-3" onClick={start}>
        {t('orders.repeat')}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm" role="status">
      <h3 className="font-medium">{t('orders.repeatTitle', { id: orderId })}</h3>

      {isFetching && <p className="mt-1 text-stone-600">{t('orders.repeatChecking')}</p>}
      {error != null && <p role="alert" className="mt-1 text-red-700">{translateError(error, t)}</p>}

      {data && !isFetching && (
        <>
          <p className="mt-1 text-stone-700">{t('orders.repeatWas', { total: formatKzt(data.previousTotalTiyn, lang) })}</p>
          {data.items.length > 0 && (
            <p className="text-stone-700">{t('orders.repeatNow', { total: formatKzt(data.totalTiyn, lang) })}</p>
          )}
          {data.unavailable.length > 0 && (
            <p className="mt-1 text-amber-800">{t('orders.repeatUnavailable', { names: data.unavailable.map(c.dish).join(', ') })}</p>
          )}
          {data.repricedCount > 0 && (
            <p className="text-amber-800">{t('orders.repeatRepriced', { count: data.repricedCount })}</p>
          )}
          {data.items.length === 0 ? (
            <p className="mt-2 text-red-700">{t('orders.repeatNothing')}</p>
          ) : (
            <p className="mt-2 text-xs text-stone-600">{t('orders.repeatReplaces')}</p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {data && !isFetching && data.items.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => fill(data)}>
            {t('orders.repeatConfirm')}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
