'use client';

import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionaries';
import { ALL_STATUSES, formatDate, formatDateTime, formatKzt, stars, statusKey, translateError } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { useCustomerReportQuery, useDailyReportQuery, useDishReportQuery, useReportQuery } from '@/store/api';

const TABS = [
  { id: 'orders', label: 'accounting.tab.orders' },
  { id: 'daily', label: 'accounting.tab.daily' },
  { id: 'dishes', label: 'accounting.tab.dishes' },
  { id: 'customers', label: 'accounting.tab.customers' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AccountingPage() {
  return (
    <RequireRole roles={['ACCOUNTANT', 'ADMIN']}>
      <Accounting />
    </RequireRole>
  );
}

function Accounting() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('orders');

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('accounting.title')}</h1>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-stone-200 pb-3" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={tab === item.id ? 'btn-primary' : 'btn-secondary'}
          >
            {t(item.label as MessageKey)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'orders' && <OrdersReport />}
        {tab === 'daily' && <DailyReport />}
        {tab === 'dishes' && <DishReport />}
        {tab === 'customers' && <CustomerReport />}
      </div>
    </div>
  );
}

/** The date range the three newer reports share. */
function RangePicker({
  range,
  onChange,
  csvUrl,
}: {
  range: { from: string; to: string };
  onChange: (next: { from: string; to: string }) => void;
  csvUrl: string;
}) {
  const { t } = useI18n();
  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="from" className="label">{t('common.from')}</label>
        <input id="from" type="date" className="input" value={range.from} onChange={(e) => onChange({ ...range, from: e.target.value })} />
      </div>
      <div>
        <label htmlFor="to" className="label">{t('common.to')}</label>
        <input id="to" type="date" className="input" value={range.to} onChange={(e) => onChange({ ...range, to: e.target.value })} />
      </div>
      {(range.from || range.to) && (
        <button type="button" className="btn-secondary" onClick={() => onChange({ from: '', to: '' })}>
          {t('common.clear')}
        </button>
      )}
      <a className="btn-secondary ml-auto" href={csvUrl} download>
        {t('accounting.downloadCsv')}
      </a>
    </div>
  );
}

function rangeQuery(range: { from: string; to: string }): string {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

// ------------------------------------------------------------- orders tab

function OrdersReport() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const { data, isLoading, error } = useReportQuery({ status }, { pollingInterval: 15000 });
  const csvUrl = `/api/reports/export.csv${status ? `?status=${status}` : ''}`;

  return (
    <div>
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="filter" className="label">{t('common.status')}</label>
          <select
            id="filter"
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
          >
            <option value="">{t('common.all')}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{t(statusKey(s))}</option>
            ))}
          </select>
        </div>
        <a className="btn-secondary ml-auto" href={csvUrl} download>{t('accounting.downloadCsv')}</a>
      </div>

      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}

      {data && (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.inView')}</dt>
              <dd className="text-2xl font-semibold">{data.summary.orderCount}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.approved')}</dt>
              <dd className="text-2xl font-semibold">{data.summary.approvedOrderCount}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.approvedTotal')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.approvedTotalTiyn, lang)}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.received')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.approvedPaidTiyn, lang)}</dd>
              <dd className="text-xs text-stone-500">
                {t('accounting.ofItPoints', { amount: formatKzt(data.summary.bonusDiscountTiyn, lang) })}
              </dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.averageRating')}</dt>
              <dd className="text-2xl font-semibold">
                {data.summary.ratedOrderCount ? data.summary.averageRating : '—'}
              </dd>
              <dd className="text-xs text-amber-600">
                {data.summary.ratedOrderCount
                  ? t('accounting.fromCount', {
                      stars: stars(data.summary.averageRating),
                      count: data.summary.ratedOrderCount,
                    })
                  : t('accounting.noReviews')}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-stone-500">{t('accounting.footnote')}</p>

          <div className="card mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-stone-100 text-left text-stone-700">
                <tr>
                  <th className="px-4 py-2">{t('accounting.order')}</th>
                  <th className="px-4 py-2">{t('accounting.created')}</th>
                  <th className="px-4 py-2">{t('common.status')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.itemsColumn')}</th>
                  <th className="px-4 py-2 text-right">{t('common.total')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.bonusColumn')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.paidColumn')}</th>
                  <th className="px-4 py-2">{t('accounting.paymentColumn')}</th>
                  <th className="px-4 py-2">{t('accounting.ratingColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-stone-500">{t('accounting.noOrders')}</td>
                  </tr>
                )}
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-t border-stone-100">
                    <td className="px-4 py-2">#{o.id}</td>
                    <td className="whitespace-nowrap px-4 py-2">{formatDateTime(o.createdAt, lang)}</td>
                    <td className="px-4 py-2"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2 text-right">{o.itemCount}</td>
                    <td className="px-4 py-2 text-right">{formatKzt(o.totalTiyn, lang)}</td>
                    <td className="px-4 py-2 text-right text-amber-800">
                      {o.discountTiyn ? `−${formatKzt(o.discountTiyn, lang)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">{formatKzt(o.paidTiyn, lang)}</td>
                    <td className="px-4 py-2">{o.paymentOutcome.replace('_', ' ').toLowerCase()}</td>
                    <td className="px-4 py-2 text-amber-600">{o.rating ? stars(o.rating) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------- daily tab

function DailyReport() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading, error } = useDailyReportQuery(range);

  return (
    <div>
      <RangePicker range={range} onChange={setRange} csvUrl={`/api/reports/daily/export.csv${rangeQuery(range)}`} />
      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}

      {data && (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.daysWithTrade')}</dt>
              <dd className="text-2xl font-semibold">{data.summary.dayCount}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.received')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.paidTiyn, lang)}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.averageOrder')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.averageOrderTiyn, lang)}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.bestDay')}</dt>
              <dd className="text-xl font-semibold">
                {data.summary.bestDay ? formatDate(data.summary.bestDay.day, lang) : '—'}
              </dd>
              {data.summary.bestDay && (
                <dd className="text-xs text-stone-500">{formatKzt(data.summary.bestDay.paidTiyn, lang)}</dd>
              )}
            </div>
          </dl>

          {data.days.length === 0 ? (
            <div className="card mt-4 text-stone-500">{t('accounting.noDays')}</div>
          ) : (
            <div className="card mt-4 overflow-x-auto p-0">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-stone-100 text-left text-stone-700">
                  <tr>
                    <th className="px-4 py-2">{t('accounting.day')}</th>
                    <th className="px-4 py-2 text-right">{t('accounting.ordersColumn')}</th>
                    <th className="px-4 py-2 text-right">{t('accounting.customersColumn')}</th>
                    <th className="px-4 py-2 text-right">{t('accounting.received')}</th>
                    <th className="px-4 py-2 text-right">{t('accounting.bonusColumn')}</th>
                    <th className="px-4 py-2 text-right">{t('accounting.averageOrder')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.day} className="border-t border-stone-100">
                      <td className="whitespace-nowrap px-4 py-2">{formatDate(d.day, lang)}</td>
                      <td className="px-4 py-2 text-right">{d.orders}</td>
                      <td className="px-4 py-2 text-right">{d.customers}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatKzt(d.paidTiyn, lang)}</td>
                      <td className="px-4 py-2 text-right text-amber-800">
                        {d.discountTiyn ? `−${formatKzt(d.discountTiyn, lang)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">{formatKzt(d.averageOrderTiyn, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- dishes tab

function DishReport() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading, error } = useDishReportQuery(range);

  return (
    <div>
      <RangePicker range={range} onChange={setRange} csvUrl={`/api/reports/dishes/export.csv${rangeQuery(range)}`} />
      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}

      {data && (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.revenue')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.revenueTiyn, lang)}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.sold')}</dt>
              <dd className="text-2xl font-semibold">{data.summary.totalQuantity}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.dish')}</dt>
              <dd className="text-2xl font-semibold">
                {data.summary.soldCount} / {data.summary.dishCount}
              </dd>
            </div>
          </dl>

          {data.summary.neverOrdered.length > 0 && (
            <p className="mt-2 text-xs text-stone-500">
              {t('accounting.neverOrdered', { names: data.summary.neverOrdered.join(', ') })}
            </p>
          )}

          <div className="card mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-stone-100 text-left text-stone-700">
                <tr>
                  <th className="px-4 py-2">{t('accounting.dish')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.sold')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.ordersColumn')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.revenue')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.share')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.currentPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {data.dishes.map((d) => (
                  <tr key={d.id} className="border-t border-stone-100">
                    <td className="px-4 py-2">
                      {d.name}
                      {!d.available && (
                        <span className="ml-2 rounded bg-stone-200 px-2 py-0.5 text-xs">{t('accounting.hidden')}</span>
                      )}
                      <div className="text-xs text-stone-500">{d.category}</div>
                    </td>
                    <td className="px-4 py-2 text-right">{d.quantity}</td>
                    <td className="px-4 py-2 text-right">{d.orders}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatKzt(d.revenueTiyn, lang)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-16 rounded-full bg-stone-200 sm:inline-block">
                          <span className="block h-1.5 rounded-full bg-emerald-500" style={{ width: `${d.sharePercent}%` }} />
                        </span>
                        {d.sharePercent}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">{formatKzt(d.currentPriceTiyn, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------- customers tab

function CustomerReport() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading, error } = useCustomerReportQuery(range);

  return (
    <div>
      <RangePicker range={range} onChange={setRange} csvUrl={`/api/reports/customers/export.csv${rangeQuery(range)}`} />
      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}

      {data && (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.activeCustomers')}</dt>
              <dd className="text-2xl font-semibold">
                {data.summary.activeCount} / {data.summary.customerCount}
              </dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.returning')}</dt>
              <dd className="text-2xl font-semibold">{data.summary.returningCount}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.received')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.paidTiyn, lang)}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('accounting.perCustomer')}</dt>
              <dd className="text-xl font-semibold">{formatKzt(data.summary.averagePerCustomerTiyn, lang)}</dd>
            </div>
          </dl>

          <div className="card mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-stone-100 text-left text-stone-700">
                <tr>
                  <th className="px-4 py-2">{t('accounting.customer')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.ordersColumn')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.spent')}</th>
                  <th className="px-4 py-2 text-right">{t('accounting.averageOrder')}</th>
                  <th className="px-4 py-2 text-right">{t('profile.bonus')}</th>
                  <th className="px-4 py-2">{t('accounting.ratingColumn')}</th>
                  <th className="px-4 py-2">{t('accounting.lastOrder')}</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.id} className="border-t border-stone-100">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.fullName}</div>
                      <div className="text-xs text-stone-500">{c.email}</div>
                    </td>
                    <td className="px-4 py-2 text-right">{c.orders}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatKzt(c.paidTiyn, lang)}</td>
                    <td className="px-4 py-2 text-right">{formatKzt(c.averageOrderTiyn, lang)}</td>
                    <td className="px-4 py-2 text-right">{c.bonusPoints}</td>
                    <td className="px-4 py-2 text-amber-600">
                      {c.averageRating ? `${stars(c.averageRating)} (${c.reviews})` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {c.lastOrderAt ? formatDateTime(c.lastOrderAt, lang) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
