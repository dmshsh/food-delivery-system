'use client';

import StatusBadge from '@/components/StatusBadge';
import { STATUS_LABEL, errorMessage, formatKzt, stars } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { useAdminOverviewQuery } from '@/store/api';

export default function OverviewTab() {
  const { data, isLoading, error } = useAdminOverviewQuery(undefined, { pollingInterval: 15000 });

  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  if (error != null) return <p role="alert" className="text-red-700">{errorMessage(error)}</p>;
  if (!data) return null;

  const statuses = Object.keys(data.orders.byStatus) as OrderStatus[];

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <dt className="text-sm text-stone-600">Accounts</dt>
          <dd className="text-2xl font-semibold">{data.users.total}</dd>
          <dd className="text-xs text-stone-500">
            {data.users.disabled} blocked by an admin · {data.users.blocked} temporarily locked out
          </dd>
        </div>
        <div className="card">
          <dt className="text-sm text-stone-600">Orders</dt>
          <dd className="text-2xl font-semibold">{data.orders.total}</dd>
          <dd className="text-xs text-stone-500">{data.money.approvedPayments} of them paid</dd>
        </div>
        <div className="card">
          <dt className="text-sm text-stone-600">Money received</dt>
          <dd className="text-2xl font-semibold">{formatKzt(data.money.approvedTotalTiyn)}</dd>
          <dd className="text-xs text-stone-500">approved payments only</dd>
        </div>
        <div className="card">
          <dt className="text-sm text-stone-600">Average rating</dt>
          <dd className="text-2xl font-semibold">
            {data.feedback.count ? data.feedback.average : '—'}
          </dd>
          <dd className="text-xs text-amber-600">
            {data.feedback.count ? `${stars(data.feedback.average)} from ${data.feedback.count} review${data.feedback.count === 1 ? '' : 's'}` : 'no reviews yet'}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <h2 className="font-medium">Orders by status</h2>
          {statuses.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">No orders yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {statuses.map((s) => (
                <li key={s} className="flex items-center justify-between gap-3">
                  <StatusBadge status={s} />
                  <span className="text-stone-600">{STATUS_LABEL[s]}</span>
                  <span className="ml-auto font-medium">{data.orders.byStatus[s]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="card">
            <h2 className="font-medium">Bonus points in circulation</h2>
            <p className="mt-1 text-2xl font-semibold">{data.bonus.outstandingPoints}</p>
            <p className="text-xs text-stone-500">
              points customers still hold, worth {formatKzt(data.bonus.outstandingPoints * 100)} in future discounts
            </p>
          </div>
          <div className={`card ${data.security.criticalLast24h > 0 ? 'border-red-300 bg-red-50' : ''}`}>
            <h2 className="font-medium">Serious security events (24h)</h2>
            <p className="mt-1 text-2xl font-semibold">{data.security.criticalLast24h}</p>
            <p className="text-xs text-stone-600">
              {data.security.criticalLast24h > 0
                ? 'Blocked accounts and sign-in attempts against them. Open the security journal.'
                : 'Nothing out of the ordinary.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
