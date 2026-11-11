'use client';

import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { errorMessage, formatDateTime, formatDelivery } from '@/lib/format';
import { readDragPayload, setDragPayload } from '@/lib/dnd';
import type { Order, OrderStatus } from '@/lib/types';
import { useOrdersQuery, useSetStatusMutation } from '@/store/api';

// The only step the kitchen may take from each status (the server enforces this too).
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  CONFIRMED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'DELIVERED', label: 'Mark delivered' },
};

const COLUMNS: { status: OrderStatus; title: string; hint: string }[] = [
  { status: 'CONFIRMED', title: 'New', hint: 'Paid and waiting to be started' },
  { status: 'PREPARING', title: 'Preparing', hint: 'Being cooked right now' },
  { status: 'READY', title: 'Ready for pickup', hint: 'Waiting for the courier' },
  { status: 'DELIVERED', title: 'Delivered', hint: 'Finished today' },
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
  const [dragging, setDragging] = useState<Order | null>(null);
  const [hovered, setHovered] = useState<OrderStatus | null>(null);
  const orders = data?.orders ?? []; // oldest first

  /** Moving a card one column to the right is exactly the step the server allows. */
  async function move(order: Order, target: OrderStatus) {
    setMessage('');
    if (NEXT[order.status]?.to !== target) {
      setMessage(`Order #${order.id} can only move to “${COLUMNS.find((c) => c.status === NEXT[order.status]?.to)?.title ?? 'the next step'}”.`);
      return;
    }
    try {
      await setStatus({ id: order.id, status: target }).unwrap();
    } catch (e) {
      setMessage(`Order #${order.id}: ${errorMessage(e)}`);
    }
  }

  function advance(order: Order) {
    const step = NEXT[order.status];
    if (step) void move(order, step.to);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Kitchen queue</h1>
      <p className="mt-1 text-sm text-stone-600">
        Paid orders, oldest first. Drag a card to the next column, or use the button on the card. The page refreshes
        every few seconds.
      </p>
      {isLoading && <p className="mt-4 text-stone-500">Loading…</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{errorMessage(error)}</p>}
      {message && (
        <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{message}</p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          // While a card is in the air, only the one column it may land in stays open.
          const accepts = dragging ? NEXT[dragging.status]?.to === col.status : false;
          const refuses = Boolean(dragging) && !accepts;
          return (
            <section
              key={col.status}
              aria-labelledby={`col-${col.status}`}
              onDragOver={(e) => {
                if (!accepts) return;
                e.preventDefault(); // "preventDefault" is what tells the browser a drop is allowed here
                e.dataTransfer.dropEffect = 'move';
                setHovered(col.status);
              }}
              onDragLeave={() => setHovered((h) => (h === col.status ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                setHovered(null);
                const id = Number(readDragPayload(e));
                const order = orders.find((o) => o.id === id);
                setDragging(null);
                if (order) void move(order, col.status);
              }}
              className={`rounded-xl border-2 border-dashed p-2 transition ${
                hovered === col.status
                  ? 'border-emerald-500 bg-emerald-50'
                  : accepts
                    ? 'border-emerald-300 bg-emerald-50/40'
                    : refuses
                      ? 'border-stone-200 bg-stone-100/60 opacity-60'
                      : 'border-transparent'
              }`}
            >
              <h2 id={`col-${col.status}`} className="mb-1 font-medium">
                {col.title} <span className="text-stone-500">({list.length})</span>
              </h2>
              <p className="mb-2 text-xs text-stone-500">{col.hint}</p>
              <ul className="space-y-3">
                {list.length === 0 && <li className="text-sm text-stone-500">Nothing here.</li>}
                {list.map((o) => (
                  <li
                    key={o.id}
                    draggable={Boolean(NEXT[o.status])}
                    onDragStart={(e) => {
                      setDragPayload(e, o.id);
                      setDragging(o);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setHovered(null);
                    }}
                    className={`card ${NEXT[o.status] ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      dragging?.id === o.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{o.id}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      Paid {formatDateTime(o.createdAt)} · Deliver: {formatDelivery(o.deliveryTime)}
                    </p>
                    <ul className="mt-2 text-sm">
                      {o.items.map((i) => (
                        <li key={i.itemId}><strong>{i.quantity}</strong> × {i.name}</li>
                      ))}
                    </ul>
                    {o.notes && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">Note: {o.notes}</p>}
                    {NEXT[o.status] && (
                      // The button is not a fallback for nicety: dragging is impossible with a
                      // keyboard or a screen reader, and the kitchen still has to work there.
                      <button className="btn-primary mt-3 w-full" disabled={saving} onClick={() => advance(o)}>
                        {NEXT[o.status]?.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
