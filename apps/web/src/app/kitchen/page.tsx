'use client';

import { useState } from 'react';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionaries';
import { formatDateTime, translateError } from '@/lib/format';
import { readDragPayload, setDragPayload } from '@/lib/dnd';
import type { Order, OrderStatus } from '@/lib/types';
import { useOrdersQuery, useSetStatusMutation } from '@/store/api';

// The only step the kitchen may take from each status (the server enforces this too).
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: MessageKey }>> = {
  CONFIRMED: { to: 'PREPARING', label: 'kitchen.startPreparing' },
  PREPARING: { to: 'READY', label: 'kitchen.markReady' },
  READY: { to: 'DELIVERED', label: 'kitchen.markDelivered' },
};

const COLUMNS: { status: OrderStatus; title: MessageKey; hint: MessageKey }[] = [
  { status: 'CONFIRMED', title: 'kitchen.new', hint: 'kitchen.hintNew' },
  { status: 'PREPARING', title: 'kitchen.preparing', hint: 'kitchen.hintPreparing' },
  { status: 'READY', title: 'kitchen.ready', hint: 'kitchen.hintReady' },
  { status: 'DELIVERED', title: 'kitchen.delivered', hint: 'kitchen.hintDelivered' },
];

export default function KitchenPage() {
  return (
    <RequireRole roles={['KITCHEN']}>
      <Kitchen />
    </RequireRole>
  );
}

function Kitchen() {
  const { t, lang } = useI18n();
  const c = useContent();
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
      const column = COLUMNS.find((c) => c.status === NEXT[order.status]?.to);
      setMessage(t('kitchen.onlyNext', { id: order.id, column: column ? t(column.title) : '—' }));
      return;
    }
    try {
      await setStatus({ id: order.id, status: target }).unwrap();
    } catch (e) {
      setMessage(`#${order.id}: ${translateError(e, t)}`);
    }
  }

  function advance(order: Order) {
    const step = NEXT[order.status];
    if (step) void move(order, step.to);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('kitchen.title')}</h1>
      <p className="mt-1 text-sm text-stone-600">{t('kitchen.subtitle')}</p>
      {isLoading && <p className="mt-4 text-stone-500">{t('common.loading')}</p>}
      {error != null && <p role="alert" className="mt-4 text-red-700">{translateError(error, t)}</p>}
      {message && (
        <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      )}

      {/* One column per status on a phone, four side by side from a wide screen up. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                {t(col.title)} <span className="text-stone-500">({list.length})</span>
              </h2>
              <p className="mb-2 text-xs text-stone-500">{t(col.hint)}</p>
              <ul className="space-y-3">
                {list.length === 0 && <li className="text-sm text-stone-500">{t('kitchen.nothing')}</li>}
                {list.map((o) => (
                  <li
                    key={o.id}
                    draggable={Boolean(NEXT[o.status])}
                    aria-label={NEXT[o.status] ? t('kitchen.dragHint', { id: o.id }) : undefined}
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
                      {t('kitchen.paid', { date: formatDateTime(o.createdAt, lang) })} ·{' '}
                      {o.deliveryTime ? formatDateTime(o.deliveryTime, lang) : t('checkout.asap')}
                    </p>
                    <ul className="mt-2 text-sm">
                      {o.items.map((i) => (
                        <li key={i.itemId}>
                          <strong>{i.quantity}</strong> × {c.dish(i.name)}
                        </li>
                      ))}
                    </ul>
                    {o.notes && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">{t('kitchen.note', { text: o.notes })}</p>}
                    {NEXT[o.status] && (
                      // The button is not there for niceness: dragging is impossible
                      // with a keyboard or a touch screen, and the kitchen still has
                      // to work on both.
                      <button className="btn-primary mt-3 w-full" disabled={saving} onClick={() => advance(o)}>
                        {t(NEXT[o.status]!.label)}
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
