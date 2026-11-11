'use client';

import Link from 'next/link';
import RequireRole from '@/components/RequireRole';
import { errorMessage, formatDateTime, formatKzt, formatPoints } from '@/lib/format';
import { useBonusQuery } from '@/store/api';

export default function BonusPage() {
  return (
    <RequireRole roles={['CUSTOMER']}>
      <Bonus />
    </RequireRole>
  );
}

function Bonus() {
  const { data, isLoading, error } = useBonusQuery();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Bonus points</h1>
      {isLoading && <p className="mt-4 text-stone-500">Loading…</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{errorMessage(error)}</p>}

      {data && (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="card">
              <dt className="text-sm text-stone-600">Balance</dt>
              <dd className="text-2xl font-semibold">{data.balance}</dd>
              <dd className="text-xs text-stone-500">worth {formatKzt(data.balance * data.rules.pointTiyn)}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">Earned in total</dt>
              <dd className="text-2xl font-semibold text-emerald-800">{data.totals.earned}</dd>
            </div>
            <div className="card">
              <dt className="text-sm text-stone-600">Spent in total</dt>
              <dd className="text-2xl font-semibold text-amber-800">{data.totals.spent}</dd>
            </div>
          </dl>

          <div className="card mt-4 text-sm text-stone-700">
            <h2 className="font-medium">How it works</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>One point is {formatKzt(data.rules.pointTiyn)}.</li>
              <li>An approved payment earns {data.rules.earnPercent}% of the money you paid back as points.</li>
              <li>Points can cover up to {data.rules.maxRedeemPercent}% of an order, chosen at checkout.</li>
              <li>Points leave your balance only when a payment is approved: a rejected or expired order costs nothing.</li>
            </ul>
            <Link href="/" className="btn-primary mt-3">Order something</Link>
          </div>

          <h2 className="mt-6 text-lg font-medium">History</h2>
          {data.history.length === 0 ? (
            <div className="card mt-2 text-sm text-stone-600">
              Nothing here yet. Your first approved payment will earn points.
            </div>
          ) : (
            <div className="card mt-2 overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-stone-100 text-left text-stone-700">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">What</th>
                    <th className="px-4 py-2 text-right">Points</th>
                    <th className="px-4 py-2 text-right">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.id} className="border-t border-stone-100">
                      <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-2">
                        {row.note}
                        {row.orderId && (
                          <span className="ml-1 text-stone-500">(order #{row.orderId})</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${row.points > 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {row.points > 0 ? '+' : ''}{row.points}
                      </td>
                      <td className="px-4 py-2 text-right">{row.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-stone-500">Showing up to the last 50 changes · {formatPoints(data.balance)} available now.</p>
        </>
      )}
    </div>
  );
}
