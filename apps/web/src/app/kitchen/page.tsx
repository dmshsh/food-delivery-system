'use client';

import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { errorMessage, formatDateTime, formatDelivery } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { useOrdersQuery, useSetStatusMutation } from '@/store/api';
import { useState } from 'react';

// The only step the kitchen may take from each status (the server enforces this too).
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  CONFIRMED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'DELIVERED', label: 'Mark delivered' },
};

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'CONFIRMED', title: 'New' },
  { status: 'PREPARING', title: 'Preparing' },
  { status: 'READY', title: 'Ready for pickup' },
];

export default function KitchenPage() {
  return (
    <RequireRole roles={['KITCHEN']}>
      <Kitchen />
    </RequireRole>
  );
}

function Kitchen() {
  const { data, isLoading, error } = useOrdersQuery(undefined, { pollingInterval: 5000 });
  const [setStatus, { isLoading: saving }] = useSetStatusMutation();
  const [message, setMessage] = useState('');
  const orders = data?.orders ?? []; // oldest first

  async function advance(order: Order) {
    const step = NEXT[order.status];
    if (!step) return;
    setMessage('');
    try {
      await setStatus({ id: order.id, status: step.to }).unwrap();
    } catch (e) {
      setMessage(`Order #${order.id}: ${errorMessage(e)}`);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Kitchen queue</h1>
      <p className="mt-1 text-sm text-stone-600">Paid orders, oldest first. This page refreshes every few seconds.</p>
      {isLoading && <p className="mt-4 text-stone-500">Loading…</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{errorMessage(error)}</p>}
      {message && <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{message}</p>}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`}>
              <h2 id={`col-${col.status}`} className="mb-2 font-medium">{col.title} <span className="text-stone-500">({list.length})</span></h2>
              <ul className="space-y-3">
                {list.length === 0 && <li className="text-sm text-stone-500">Nothing here.</li>}
                {list.map((o) => (
                  <li key={o.id} className="card">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{o.id}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">Paid {formatDateTime(o.createdAt)} · Deliver: {formatDelivery(o.deliveryTime)}</p>
                    <ul className="mt-2 text-sm">
                      {o.items.map((i) => <li key={i.itemId}><strong>{i.quantity}</strong> × {i.name}</li>)}
                    </ul>
                    {o.notes && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">Note: {o.notes}</p>}
                    <button className="btn-primary mt-3 w-full" disabled={saving} onClick={() => advance(o)}>{NEXT[o.status]?.label}</button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-stone-600">Delivered ({orders.filter((o) => o.status === 'DELIVERED').length})</summary>
        <ul className="mt-2 space-y-1 text-sm text-stone-600">
          {orders.filter((o) => o.status === 'DELIVERED').map((o) => (
            <li key={o.id}>#{o.id} · {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
