'use client';

import Link from 'next/link';
import RequireRole from '@/components/RequireRole';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateTime, formatKzt, formatPoints, translateError } from '@/lib/format';
import { useBonusQuery } from '@/store/api';

export default function BonusPage() {
  return (
    <RequireRole roles={['CUSTOMER']}>
      <Bonus />
    </RequireRole>
  );
}

function Bonus() {
  const { t, lang } = useI18n();
  const c = useContent();
  const { data, isLoading, error } = useBonusQuery();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{t('bonus.title')}</h1>
      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}

      {data && (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="card">
              <dt className="text-sm text-stone-600">{t('bonus.balance')}</dt>
              <dd className="text-2xl font-semibold">{data.balance}</dd>
              <dd className="text-xs text-stone-500">
                {t('bonus.worth', { amount: formatKzt(data.balance * data.rules.pointTiyn, lang) })}
              </dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('bonus.earnedTotal')}</dt>
              <dd className="text-2xl font-semibold text-emerald-800">{data.totals.earned}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">{t('bonus.spentTotal')}</dt>
              <dd className="text-2xl font-semibold text-amber-800">{data.totals.spent}</dd>
            </div>
          </dl>

          <div className="card mt-4 text-sm text-stone-700">
            <h2 className="font-medium">{t('bonus.howTitle')}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t('bonus.how1', { value: formatKzt(data.rules.pointTiyn, lang) })}</li>
              <li>{t('bonus.how2', { percent: data.rules.earnPercent })}</li>
              <li>{t('bonus.how3', { percent: data.rules.maxRedeemPercent })}</li>
              <li>{t('bonus.how4')}</li>
            </ul>
            <Link href="/" className="btn-primary mt-3">{t('bonus.orderSomething')}</Link>
          </div>

          <h2 className="mt-6 text-lg font-medium">{t('bonus.history')}</h2>
          {data.history.length === 0 ? (
            <div className="card mt-2 text-sm text-stone-600">{t('bonus.historyEmpty')}</div>
          ) : (
            <>
              {/* Phones: one card per change. The same rows as the table below. */}
              <ul className="mt-2 space-y-2 sm:hidden">
                {data.history.map((row) => (
                  <li key={row.id} className="card text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-stone-600">{formatDateTime(row.createdAt, lang)}</span>
                      <span className={`font-medium ${row.points > 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {row.points > 0 ? '+' : ''}
                        {row.points}
                      </span>
                    </div>
                    <p className="mt-1">
                      {c.note(row.note)} {row.orderId && <span className="text-stone-500">{t('bonus.forOrder', { id: row.orderId })}</span>}
                    </p>
                    <p className="text-xs text-stone-500">
                      {t('bonus.balanceAfter')}: {row.balanceAfter}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="card mt-2 hidden overflow-x-auto p-0 sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-stone-100 text-left text-stone-700">
                    <tr>
                      <th className="px-4 py-2">{t('bonus.when')}</th>
                      <th className="px-4 py-2">{t('bonus.what')}</th>
                      <th className="px-4 py-2 text-right">{t('bonus.pointsColumn')}</th>
                      <th className="px-4 py-2 text-right">{t('bonus.balanceAfter')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((row) => (
                      <tr key={row.id} className="border-t border-stone-100">
                        <td className="whitespace-nowrap px-4 py-2">{formatDateTime(row.createdAt, lang)}</td>
                        <td className="px-4 py-2">
                          {c.note(row.note)}
                          {row.orderId && <span className="ml-1 text-stone-500">{t('bonus.forOrder', { id: row.orderId })}</span>}
                        </td>
                        <td className={`px-4 py-2 text-right font-medium ${row.points > 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                          {row.points > 0 ? '+' : ''}
                          {row.points}
                        </td>
                        <td className="px-4 py-2 text-right">{row.balanceAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-stone-500">{formatPoints(data.balance, lang, t('common.points'))}</p>
        </>
      )}
    </div>
  );
}
