'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import EmptyState from '@/components/EmptyState';
import FeedbackForm from '@/components/FeedbackForm';
import NutritionPanel from '@/components/NutritionPanel';
import RequireRole from '@/components/RequireRole';
import { SkeletonCards } from '@/components/Skeleton';
import StatusBadge from '@/components/StatusBadge';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateTime, formatKzt, formatPoints, translateError } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { useOrdersQuery } from '@/store/api';

/**
 * One order, after it has been placed.
 *
 * The checkout page answers "did that work?" and then gets out of the way. This
 * page answers everything that comes afterwards: where the order has got to,
 * what the delivery code is, who owes what if it was shared, what it adds up
 * to, and — once it arrives — what the customer thought of it.
 */
export default function OrderPage() {
  return (
    <RequireRole roles={['CUSTOMER']}>
      <OrderDetail />
    </RequireRole>
  );
}

/** The steps an order goes through, and which status marks each one done. */
const STEPS: { key: string; done: OrderStatus[] }[] = [
  { key: 'order.step.placed', done: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] },
  { key: 'order.step.paid', done: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] },
  { key: 'order.step.preparing', done: ['PREPARING', 'READY', 'DELIVERED'] },
  { key: 'order.step.ready', done: ['READY', 'DELIVERED'] },
  { key: 'order.step.delivered', done: ['DELIVERED'] },
];

function OrderDetail() {
  const { t, lang } = useI18n();
  const c = useContent();
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  // The list is what the rest of the site already holds, and it refreshes on a
  // timer: a page that watches an order being cooked should not need reloading.
  const { data, isLoading, error } = useOrdersQuery(undefined, { pollingInterval: 10000 });
  const order = data?.orders.find((o) => o.id === id);

  if (isLoading) return <SkeletonCards count={2} lines={5} />;
  if (error != null) {
    return <EmptyState kind="error" title={t('common.error')} description={translateError(error, t)} />;
  }
  if (!Number.isInteger(id) || !order) {
    return (
      <EmptyState
        title={t('error.orderNotFound')}
        description={t('error.orderNotFoundText')}
        action={{ href: '/orders', label: t('order.backToOrders') }}
      />
    );
  }

  const finished = ['PAYMENT_REJECTED', 'EXPIRED', 'CANCELLED'].includes(order.status);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('order.title', { id: order.id })}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {t('order.placedAt')} {formatDateTime(order.createdAt, lang)}
      </p>

      {/* The delivery code: the thing the customer actually needs at the door. */}
      {order.status !== 'DELIVERED' && !finished && (
        <section className="card mt-4 border-emerald-300 bg-emerald-50">
          <h2 className="font-medium">{t('confirm.title')}</h2>
          {order.confirmationCode ? (
            <>
              <p className="mt-2 font-mono text-4xl tracking-[0.35em] text-emerald-900">{order.confirmationCode}</p>
              <p className="mt-2 text-sm text-stone-700">{t('confirm.showAtDoor')}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-600">{t('confirm.waiting')}</p>
          )}
        </section>
      )}

      {order.status === 'DELIVERED' && (
        <p className="card mt-4 border-emerald-300 bg-emerald-50 text-sm">
          {t('confirm.delivered')}
          {order.confirmedAt && ` · ${t('confirm.confirmedAt', { date: formatDateTime(order.confirmedAt, lang) })}`}
        </p>
      )}

      {/* Where it has got to. */}
      {!finished && (
        <section className="card mt-4" aria-labelledby="timeline-h">
          <h2 id="timeline-h" className="font-medium">
            {t('order.timeline')}
          </h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((step) => {
              const done = step.done.includes(order.status);
              return (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                      done ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-500'
                    }`}
                  >
                    {done ? '✓' : '·'}
                  </span>
                  <span className={done ? 'text-stone-900' : 'text-stone-500'}>
                    {t(step.key as 'order.step.placed')}
                  </span>
                  {!done && <span className="text-xs text-stone-400">{t('order.stepWaiting')}</span>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* What is in it. */}
      <section className="card mt-4" aria-labelledby="items-h">
        <h2 id="items-h" className="font-medium">
          {t('checkout.yourOrder')}
        </h2>
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {order.items.map((item) => (
            <li key={`${item.itemId}|${item.participant ?? ''}`} className="flex justify-between gap-3 py-1.5">
              <span>
                {item.quantity} × {c.dish(item.name)}
                {item.participant && <span className="ml-2 text-stone-500">· {item.participant}</span>}
              </span>
              <span className="whitespace-nowrap">{formatKzt((item.unitPriceTiyn ?? 0) * item.quantity, lang)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-stone-200 pt-3 text-sm">
          <span>{t('checkout.items')}</span>
          <span>{formatKzt(order.totalTiyn ?? 0, lang)}</span>
        </p>
        {Boolean(order.discountTiyn) && (
          <p className="flex justify-between text-sm text-amber-800">
            <span>{t('checkout.bonusTitle')}</span>
            <span>−{formatKzt(order.discountTiyn ?? 0, lang)}</span>
          </p>
        )}
        <p className="mt-1 flex justify-between font-medium">
          <span>{t('checkout.toPay')}</span>
          <span>{formatKzt(order.payableTiyn ?? order.totalTiyn ?? 0, lang)}</span>
        </p>
        {Boolean(order.bonusEarned) && (
          <p className="mt-1 text-sm text-emerald-800">
            {t('orders.earned', { points: formatPoints(order.bonusEarned ?? 0, lang, t('common.points')) })}
          </p>
        )}
        <p className="mt-3 text-sm text-stone-600">
          {t('order.deliveryTo')}: {order.deliveryAddress}
        </p>
        {order.notes && <p className="mt-1 text-sm italic text-stone-600">“{order.notes}”</p>}
      </section>

      {/* Who owes what, when it was shared. */}
      {order.isGroup && order.split && (
        <section className="card mt-4" aria-labelledby="split-h">
          <h2 id="split-h" className="font-medium">
            {t('group.split')}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {order.split.shares.map((share) => (
              <li key={share.name} className="flex flex-wrap justify-between gap-2">
                <span>{t('group.owes', { name: share.name, amount: formatKzt(share.totalTiyn, lang) })}</span>
                <span className="text-stone-500">{t('group.itemsFor', { count: share.itemCount })}</span>
              </li>
            ))}
            {order.split.unassignedTiyn > 0 && (
              <li className="text-amber-800">
                {t('group.unassigned', { amount: formatKzt(order.split.unassignedTiyn, lang) })}
              </li>
            )}
          </ul>
          {Boolean(order.discountTiyn) && <p className="mt-2 text-xs text-stone-500">{t('group.discountNote')}</p>}
        </section>
      )}

      {order.nutrition && (
        <div className="mt-4">
          <NutritionPanel summary={order.nutrition} />
        </div>
      )}

      <div className="mt-4">
        <FeedbackForm order={order as Order} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/orders" className="btn-secondary">
          {t('order.backToOrders')}
        </Link>
        <Link href="/" className="btn-secondary">
          {t('error.backToMenu')}
        </Link>
      </div>
    </div>
  );
}
