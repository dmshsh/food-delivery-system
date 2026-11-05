'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import RequireRole from '@/components/RequireRole';
import StatusBadge from '@/components/StatusBadge';
import { useSession } from '@/components/useSession';
import { errorCode, errorMessage, formatDelivery, formatKzt, isNetworkError } from '@/lib/format';
import type { CheckoutOutcome, Order } from '@/lib/types';
import { useCheckoutMutation, useCreateOrderMutation, useMenuQuery, useOrdersQuery } from '@/store/api';
import { clearCart, clearDraft, draftSaved, MAX_QUANTITY, setField, setQuantity, startDraft } from '@/store/cartSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export default function CheckoutPage() {
  return (
    <RequireRole roles={['CUSTOMER']}>
      <Checkout />
    </RequireRole>
  );
}

function newAttemptId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Seconds left until `expiresAt`, ticking once a second. `now` is returned so callers can react to each tick. */
function useCountdown(expiresAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const remaining = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0;
  return { remaining, now };
}

function Checkout() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const { profile } = useSession();
  const menu = useMenuQuery();
  const [createOrder, create] = useCreateOrderMutation();
  const [checkout, payment] = useCheckoutMutation();

  const [error, setError] = useState('');
  const [retryNote, setRetryNote] = useState('');
  const [done, setDone] = useState<Order | null>(null);

  const draft = cart.draft;
  const orders = useOrdersQuery(undefined, { skip: !draft?.orderId });
  const order = draft?.orderId ? orders.data?.orders.find((o) => o.id === draft.orderId) : undefined;
  const { remaining, now } = useCountdown(order?.status === 'PENDING' ? order.expiresAt : undefined);

  // Pre-fill the address from the profile, once.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !cart.hydrated) return;
    prefilled.current = true;
    if (!cart.deliveryAddress && profile?.address) dispatch(setField({ field: 'deliveryAddress', value: profile.address }));
  }, [cart.hydrated, cart.deliveryAddress, profile, dispatch]);

  // Time limit: when the countdown hits zero, ask the server; it marks the order as expired.
  useEffect(() => {
    if (order?.status === 'PENDING' && remaining === 0) orders.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // The order reached a final state (paid, rejected or expired): show the result and unlock the form.
  useEffect(() => {
    if (order && order.status !== 'PENDING') {
      setDone(order);
      setRetryNote('');
      dispatch(order.status === 'CONFIRMED' ? clearCart() : clearDraft());
    }
  }, [order, dispatch]);

  const lines = useMemo(
    () =>
      (menu.data?.items ?? [])
        .filter((item) => cart.quantities[item.id])
        .map((item) => ({ item, quantity: cart.quantities[item.id] })),
    [menu.data, cart.quantities],
  );
  const total = lines.reduce((sum, l) => sum + l.quantity * l.item.priceTiyn, 0);
  const frozen = Boolean(draft); // details cannot change while an attempt is in flight

  async function placeOrder() {
    setError('');
    let d = cart.draft;
    if (!d) {
      if (!cart.deliveryAddress.trim()) return setError('Enter a delivery address.');
      d = {
        attemptId: newAttemptId(),
        payload: {
          deliveryAddress: cart.deliveryAddress.trim(),
          deliveryTime: cart.deliveryTime ? new Date(cart.deliveryTime).toISOString() : 'ASAP',
          notes: cart.notes.trim(),
          items: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
        },
      };
      dispatch(startDraft(d));
    }
    try {
      const result = await createOrder({ attemptId: d.attemptId, ...d.payload }).unwrap();
      dispatch(draftSaved(result.order.id));
    } catch (e) {
      setError(errorMessage(e));
      // Network failure: keep the draft, so "Retry" sends the SAME attempt. The server answered "no": nothing was saved.
      if (!isNetworkError(e)) dispatch(clearDraft());
    }
  }

  async function pay(outcome: CheckoutOutcome) {
    if (!order) return;
    setError('');
    setRetryNote('');
    try {
      await checkout({ id: order.id, outcome }).unwrap();
    } catch (e) {
      if (errorCode(e) === 'confirmation_lost' || isNetworkError(e)) {
        setRetryNote(errorMessage(e));
      } else {
        setError(errorMessage(e));
      }
    }
  }

  // ---------------------------------------------------------------- views

  const resultBanner = done && (
    <div
      role="status"
      className={`card mb-6 ${done.status === 'CONFIRMED' ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Order #{done.id}</h2>
        <StatusBadge status={done.status} />
      </div>
      <p className="mt-2 text-sm">
        {done.status === 'CONFIRMED' && 'Thank you! Your demo payment was approved and the kitchen can see your order.'}
        {done.status === 'PAYMENT_REJECTED' && 'The demo payment was rejected. Nothing was charged. Your cart is still here: you can try again.'}
        {done.status === 'EXPIRED' && 'The 2-minute checkout time limit passed. Nothing was charged. Your cart is still here: you can try again.'}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href="/orders" className="btn-primary">My orders</Link>
        <button className="btn-secondary" onClick={() => setDone(null)}>Dismiss</button>
      </div>
    </div>
  );

  // Step 2: the order is saved and waiting for the (simulated) payment.
  if (draft?.orderId && order?.status === 'PENDING') {
    return (
      <div className="mx-auto max-w-2xl">
        {resultBanner}
        <h1 className="text-2xl font-semibold">Payment</h1>
        <div className="card mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Order #{order.id}</h2>
            <StatusBadge status={order.status} />
          </div>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {order.items.map((i) => (
              <li key={i.itemId} className="flex justify-between py-1.5">
                <span>{i.quantity} × {i.name}</span>
                <span>{formatKzt((i.unitPriceTiyn ?? 0) * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between font-medium"><span>Total</span><span>{formatKzt(order.totalTiyn ?? 0)}</span></p>
          <p className="mt-2 text-sm text-stone-600">Delivery: {formatDelivery(order.deliveryTime)} · {order.deliveryAddress}</p>
          <p className="mt-3 text-sm" aria-live="polite">
            Time left to pay: <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong>
          </p>
        </div>

        <div className="card mt-4">
          <p className="text-sm text-stone-600">Demo payment: no real money moves. Choose what the bank answers:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={payment.isLoading} onClick={() => pay('success')}>Approve payment</button>
            <button className="btn-danger" disabled={payment.isLoading} onClick={() => pay('rejected')}>Reject payment</button>
            <button className="btn-secondary" disabled={payment.isLoading} onClick={() => pay('timeout')}>Simulate time limit</button>
            <button className="btn-secondary" disabled={payment.isLoading} onClick={() => pay('lost_reply')}>Approve, then lose the confirmation</button>
          </div>
          {retryNote && (
            <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p>{retryNote}</p>
              <button className="btn-primary mt-2" disabled={payment.isLoading} onClick={() => pay('success')}>Retry same checkout</button>
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    );
  }

  // Step 1: cart, delivery details, place the order.
  if (lines.length === 0 && !draft) {
    return (
      <div className="mx-auto max-w-2xl">
        {resultBanner}
        <div className="card">
          <p>Your cart is empty.</p>
          <Link href="/" className="btn-primary mt-3">Browse the menu</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {resultBanner}
      <h1 className="text-2xl font-semibold">Checkout</h1>

      <section className="card mt-4" aria-labelledby="cart-h">
        <h2 id="cart-h" className="font-medium">Your order</h2>
        <ul className="mt-2 divide-y divide-stone-100">
          {lines.map(({ item, quantity }) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex-1">{item.name}</span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary px-2 py-1" disabled={frozen} aria-label={`Remove one ${item.name}`} onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: quantity - 1 }))}>−</button>
                <span className="w-5 text-center">{quantity}</span>
                <button className="btn-secondary px-2 py-1" disabled={frozen || quantity >= MAX_QUANTITY} aria-label={`Add one ${item.name}`} onClick={() => dispatch(setQuantity({ itemId: item.id, quantity: quantity + 1 }))}>+</button>
              </div>
              <span className="w-24 text-right">{formatKzt(quantity * item.priceTiyn)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-stone-200 pt-3 font-medium"><span>Total</span><span>{formatKzt(total)}</span></p>
      </section>

      <section className="card mt-4 space-y-4" aria-labelledby="delivery-h">
        <h2 id="delivery-h" className="font-medium">Delivery</h2>
        <div>
          <label htmlFor="address" className="label">Delivery address</label>
          <input id="address" className="input" disabled={frozen} maxLength={240} value={cart.deliveryAddress}
            onChange={(e) => dispatch(setField({ field: 'deliveryAddress', value: e.target.value }))} />
        </div>
        <fieldset disabled={frozen}>
          <legend className="label">Delivery time</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="when" checked={cart.deliveryTime === ''} onChange={() => dispatch(setField({ field: 'deliveryTime', value: '' }))} />
              As soon as possible
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="when" checked={cart.deliveryTime !== ''} onChange={() => dispatch(setField({ field: 'deliveryTime', value: toLocalInput(new Date(Date.now() + 3600 * 1000)) }))} />
              Choose a time
            </label>
            {cart.deliveryTime !== '' && (
              <input type="datetime-local" aria-label="Requested delivery time" className="input w-auto" value={cart.deliveryTime}
                min={toLocalInput(new Date())} max={toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000))}
                onChange={(e) => dispatch(setField({ field: 'deliveryTime', value: e.target.value }))} />
            )}
          </div>
        </fieldset>
        <div>
          <label htmlFor="notes" className="label">Note for the kitchen or courier (optional)</label>
          <textarea id="notes" rows={2} maxLength={300} className="input" disabled={frozen} value={cart.notes}
            onChange={(e) => dispatch(setField({ field: 'notes', value: e.target.value }))} />
        </div>
      </section>

      {draft && !draft.orderId && (
        <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          The last attempt may not have reached the server. Press Retry: it sends the same order again, and the server
          never creates a duplicate.
          <button className="ml-3 underline" onClick={() => dispatch(clearDraft())}>Discard attempt and edit</button>
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      <button className="btn-primary mt-4 w-full" disabled={create.isLoading || lines.length === 0} onClick={placeOrder}>
        {create.isLoading ? 'Saving order…' : draft ? 'Retry same order' : `Continue to payment · ${formatKzt(total)}`}
      </button>
    </div>
  );
}

/** <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
