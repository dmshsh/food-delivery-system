'use client';

import StatusBadge from '@/components/StatusBadge';
import { useI18n } from '@/i18n/I18nProvider';
import { formatKzt, stars, statusKey, translateError } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { useAdminOverviewQuery } from '@/store/api';

export default function OverviewTab() {
  const { t, lang } = useI18n();
  const { data, isLoading, error } = useAdminOverviewQuery(undefined, { pollingInterval: 15000 });

  if (isLoading) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (error != null) return <p role="alert" className="text-red-700">{translateError(error, t)}</p>;
  if (!data) return null;

  const statuses = Object.keys(data.orders.byStatus) as OrderStatus[];

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <dt className="text-sm text-stone-600">{t('admin.accounts')}</dt>
          <dd className="text-2xl font-semibold">{data.users.total}</dd>
          <dd className="text-xs text-stone-500">
            {t('admin.blockedByAdmin', { disabled: data.users.disabled, locked: data.users.blocked })}
          </dd>
        </div>
        <div className="card">
          <dt className="text-sm text-stone-600">{t('admin.ordersTotal')}</dt>
          <dd className="text-2xl font-semibold">{data.orders.total}</dd>
          <dd className="text-xs text-stone-500">{t('admin.ofThemPaid', { count: data.money.approvedPayments })}</dd>
        </div>
        <div className="card">
          <dt className="text-sm text-stone-600">{t('admin.moneyReceived')}</dt>
          <dd className="text-xl font-semibold">{formatKzt(data.money.approvedTotalTiyn, lang)}</dd>
          <dd className="text-xs text-stone-500">{t('admin.approvedOnly')}</dd>
        </div>
        <div className="card">
          <dt className="text-sm text-stone-600">{t('accounting.averageRating')}</dt>
          <dd className="text-2xl font-semibold">{data.feedback.count ? data.feedback.average : '—'}</dd>
          <dd className="text-xs text-amber-600">
            {data.feedback.count
              ? t('accounting.fromCount', { stars: stars(data.feedback.average), count: data.feedback.count })
              : t('accounting.noReviews')}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <h2 className="font-medium">{t('admin.ordersByStatus')}</h2>
          {statuses.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">{t('admin.noOrders')}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {statuses.map((s) => (
                <li key={s} className="flex items-center justify-between gap-3">
                  <StatusBadge status={s} />
                  <span className="hidden text-stone-600 sm:inline">{t(statusKey(s))}</span>
                  <span className="ml-auto font-medium">{data.orders.byStatus[s]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="card">
            <h2 className="font-medium">{t('admin.pointsInCirculation')}</h2>
            <p className="mt-1 text-2xl font-semibold">{data.bonus.outstandingPoints}</p>
            <p className="text-xs text-stone-500">
              {t('admin.pointsWorth', { amount: formatKzt(data.bonus.outstandingPoints * 100, lang) })}
            </p>
          </div>
          <div className={`card ${data.security.criticalLast24h > 0 ? 'border-red-300 bg-red-50' : ''}`}>
            <h2 className="font-medium">{t('admin.criticalEvents')}</h2>
            <p className="mt-1 text-2xl font-semibold">{data.security.criticalLast24h}</p>
            <p className="text-xs text-stone-600">
              {data.security.criticalLast24h > 0 ? t('admin.criticalSome') : t('admin.criticalNone')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
