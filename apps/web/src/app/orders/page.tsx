'use client';

import Link from 'next/link';
import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { ALL_STATUSES, STATUS_LABEL, errorMessage, formatDateTime, formatDelivery, formatKzt } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';
import { useOrdersQuery } from '@/store/api';

export default function OrdersPage() {
  return (
    <RequireRole roles={['CUSTOMER']}>
      <MyOrders />
    </RequireRole>
  );
}

function MyOrders() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const { data, isLoading, error } = useOrdersQuery({ status }, { pollingInterval: 10000 });
  const orders = [...(data?.orders ?? [])].reverse(); // newest first

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">My orders</h1>
        <div>
          <label htmlFor="filter" className="label">Status</label>
          <select id="filter" className="input" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">All</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {isLoading && <p className="mt-4 text-stone-500">Loading…</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{errorMessage(error)}</p>}
      {data && orders.length === 0 && (
        <div className="card mt-4">No orders yet. <Link href="/" className="underline">Browse the menu</Link></div>
      )}

      <ul className="mt-4 space-y-3">
        {orders.map((o) => (
          <li key={o.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Order #{o.id}</h2>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-1 text-sm text-stone-600">Placed {formatDateTime(o.createdAt)} · Delivery: {formatDelivery(o.deliveryTime)}</p>
            <p className="text-sm text-stone-600">{o.deliveryAddress}</p>
            <ul className="mt-2 text-sm">
              {o.items.map((i) => <li key={i.itemId}>{i.quantity} × {i.name}</li>)}
            </ul>
            {o.notes && <p className="mt-1 text-sm italic text-stone-600">“{o.notes}”</p>}
            <p className="mt-2 text-right font-medium">{formatKzt(o.totalTiyn ?? 0)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
