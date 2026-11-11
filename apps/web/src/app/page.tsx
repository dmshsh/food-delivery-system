'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatKzt } from '@/lib/format';
import { MAX_QUANTITY, setQuantity } from '@/store/cartSlice';
import { useMenuQuery } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export default function MenuPage() {
  const { data, isLoading, isError, refetch } = useMenuQuery();
  const quantities = useAppSelector((s) => s.cart.quantities);
  const dispatch = useAppDispatch();
  const [category, setCategory] = useState('All');

  const items = data?.items ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const visible = category === 'All' ? items : items.filter((i) => i.category === category);
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const total = items.reduce((sum, i) => sum + (quantities[i.id] ?? 0) * i.priceTiyn, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Make time for lunch</h1>
      <p className="mt-1 text-stone-600">Choose your dishes. We keep your order together until you check out.</p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Menu categories">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            onClick={() => setCategory(c)}
            className={c === category ? 'btn-primary' : 'btn-secondary'}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-stone-500">Loading menu…</p>}
      {isError && (
        <div className="card mt-6" role="alert">
          The menu could not be loaded. <button className="underline" onClick={() => refetch()}>Try again</button>
        </div>
      )}

      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {visible.map((item) => {
          const qty = quantities[item.id] ?? 0;
          return (
            <li key={item.id} className="card flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-medium">{item.name}</h2>
                  <span className="whitespace-nowrap font-medium text-emerald-800">{formatKzt(item.priceTiyn)}</span>
                </div>
                <p className="mt-1 text-sm text-stone-600">{item.description}</p>
              </div>
              {qty === 0 ? (
                <button className="btn-primary self-start" onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: 1 }))}>
                  Add
                </button>
              ) : (
                <div className="flex items-center gap-3 self-start">
                  <button className="btn-secondary" aria-label={`Remove one ${item.name}`} onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: qty - 1 }))}>−</button>
                  <span className="w-6 text-center" aria-live="polite">{qty}</span>
                  <button className="btn-secondary" aria-label={`Add one ${item.name}`} disabled={qty >= MAX_QUANTITY} onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: qty + 1 }))}>+</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {count > 0 && (
        <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-4 rounded-xl bg-emerald-800 px-5 py-3 text-white shadow-lg">
          <span>{count} item{count === 1 ? '' : 's'} · {formatKzt(total)}</span>
          <Link href="/checkout" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50">
            Go to checkout
          </Link>
        </div>
      )}
    </div>
  );
}
