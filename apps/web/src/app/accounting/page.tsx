'use client';

import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { ALL_STATUSES, STATUS_LABEL, errorMessage, formatDateTime, formatKzt } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { useReportQuery } from '@/store/api';

export default function AccountingPage() {
  return (
    <RequireRole roles={['ACCOUNTANT']}>
      <Accounting />
    </RequireRole>
  );
}

function Accounting() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const { data, isLoading, error } = useReportQuery({ status }, { pollingInterval: 15000 });
  const csvUrl = `/api/reports/export.csv${status ? `?status=${status}` : ''}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Order accounting</h1>
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="filter" className="label">Status</label>
            <select id="filter" className="input" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
              <option value="">All</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <a className="btn-secondary" href={csvUrl} download>Download CSV</a>
        </div>
      </div>

      {isLoading && <p className="mt-4 text-stone-500">Loading…</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{errorMessage(error)}</p>}

      {data && (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="card"><dt className="text-sm text-stone-600">Orders in this view</dt><dd className="text-2xl font-semibold">{data.summary.orderCount}</dd></div>
            <div className="card"><dt className="text-sm text-stone-600">Approved payments</dt><dd className="text-2xl font-semibold">{data.summary.approvedOrderCount}</dd></div>
            <div className="card"><dt className="text-sm text-stone-600">Approved total</dt><dd className="text-2xl font-semibold">{formatKzt(data.summary.approvedTotalTiyn)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-stone-500">Rejected and expired checkouts are listed but never added to the approved total.</p>

          <div className="card mt-4 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-left text-stone-700">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Items</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Payment</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-stone-500">No orders for this filter.</td></tr>}
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-t border-stone-100">
                    <td className="px-4 py-2">#{o.id}</td>
                    <td className="px-4 py-2">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-2"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2 text-right">{o.itemCount}</td>
                    <td className="px-4 py-2 text-right">{formatKzt(o.totalTiyn)}</td>
                    <td className="px-4 py-2">{o.paymentOutcome.replace('_', ' ').toLowerCase()}</td>
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
