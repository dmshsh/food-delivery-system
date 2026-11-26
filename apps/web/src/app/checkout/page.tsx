'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import GroupOrder from '@/components/GroupOrder';
import NutritionPanel from '@/components/NutritionPanel';
import RequireRole from '@/components/RequireRole';
import { SkeletonForm } from '@/components/Skeleton';
import StatusBadge from '@/components/StatusBadge';
import { useSession } from '@/components/useSession';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import { errorCode, formatKzt, formatPoints, isNetworkError, translateError } from '@/lib/format';
import type { CheckoutOutcome, Order } from '@/lib/types';
import {
  useBonusQuery,
  useCheckoutMutation,
  useCreateOrderMutation,
  useMenuQuery,
  useNutritionQuery,
  useOrdersQuery,
} from '@/store/api';
import {
  MAX_QUANTITY,
  cartLines,
  clearCart,
  clearDraft,
  draftSaved,
  setBonusPoints,
  setField,
  setQuantity,
  startDraft,
} from '@/store/cartSlice';
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
  const { t, lang } = useI18n();
  const c = useContent();
  const menu = useMenuQuery();
  const bonus = useBonusQuery();
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
    if (!cart.deliveryAddress && profile?.address) {
      dispatch(setField({ field: 'deliveryAddress', value: profile.address }));
    }
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

  const items = menu.data?.items ?? [];
  const lines = useMemo(
    () =>
      cartLines(cart)
        .map((line) => ({ line, item: items.find((i) => i.id === line.itemId) }))
        .filter((entry): entry is { line: (typeof entry)['line']; item: NonNullable<(typeof entry)['item']> } =>
          Boolean(entry.item),
        )
        .sort((a, b) => a.item.name.localeCompare(b.item.name) || a.line.participant.localeCompare(b.line.participant)),
    [cart, items],
  );

  const total = lines.reduce((sum, l) => sum + l.line.quantity * l.item.priceTiyn, 0);
  const frozen = Boolean(draft); // details cannot change while an attempt is in flight

  // What the basket adds up to. Asked of the server, because the figures belong
  // to the dishes and not to the browser.
  const nutritionItems = useMemo(
    () => lines.map(({ line }) => ({ itemId: line.itemId, quantity: line.quantity })),
    [lines],
  );
  const nutrition = useNutritionQuery(nutritionItems, { skip: nutritionItems.length === 0 });

  // ---- bonus points. The same two limits the server applies, shown before it has to say no.
  const balance = bonus.data?.balance ?? profile?.bonusPoints ?? 0;
  const pointTiyn = bonus.data?.rules.pointTiyn ?? 100;
  const earnPercent = bonus.data?.rules.earnPercent ?? 5;
  const maxSharePercent = bonus.data?.rules.maxRedeemPercent ?? 30;
  const maxPoints = Math.max(0, Math.min(balance, Math.floor((total * (maxSharePercent / 100)) / pointTiyn)));
  const usedPoints = Math.min(cart.bonusPoints, maxPoints);
  const discount = usedPoints * pointTiyn;
  const payable = Math.max(0, total - discount);
  const willEarn = Math.floor((payable * (earnPercent / 100)) / pointTiyn);
  const points = (n: number) => formatPoints(n, lang, t('common.points'));

  const unassigned = cart.participants.length > 0 && lines.some(({ line }) => !line.participant);

  useEffect(() => {
    if (!frozen && cart.bonusPoints > maxPoints) dispatch(setBonusPoints(maxPoints));
  }, [cart.bonusPoints, maxPoints, frozen, dispatch]);

  async function placeOrder() {
    setError('');
    let d = cart.draft;
    if (!d) {
      if (!cart.deliveryAddress.trim()) return setError(t('checkout.needAddress'));
      if (unassigned) return setError(t('group.assignAll'));
      d = {
        attemptId: newAttemptId(),
        payload: {
          deliveryAddress: cart.deliveryAddress.trim(),
          deliveryTime: cart.deliveryTime ? new Date(cart.deliveryTime).toISOString() : 'ASAP',
          notes: cart.notes.trim(),
          bonusPoints: usedPoints,
          participants: cart.participants,
          items: lines.map(({ line }) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            participant: line.participant,
          })),
        },
      };
      dispatch(startDraft(d));
    }
    try {
      const result = await createOrder({ attemptId: d.attemptId, ...d.payload }).unwrap();
      dispatch(draftSaved(result.order.id));
    } catch (e) {
      setError(translateError(e, t));
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
        setRetryNote(translateError(e, t));
      } else {
        setError(translateError(e, t));
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
        <h2 className="text-lg font-semibold">{t('checkout.orderNumber', { id: done.id })}</h2>
        <StatusBadge status={done.status} />
      </div>
      <p className="mt-2 text-sm">
        {done.status === 'CONFIRMED' && t('checkout.resultConfirmed')}
        {done.status === 'PAYMENT_REJECTED' && t('checkout.resultRejected')}
        {done.status === 'EXPIRED' && t('checkout.resultExpired')}
      </p>
      {done.status === 'CONFIRMED' && (Boolean(done.bonusSpent) || Boolean(done.bonusEarned)) && (
        <p className="mt-2 text-sm text-emerald-900">
          {Boolean(done.bonusSpent) &&
            `${t('checkout.paidWithPoints', {
              amount: formatKzt(done.discountTiyn ?? 0, lang),
              points: points(done.bonusSpent ?? 0),
            })} `}
          {Boolean(done.bonusEarned) && t('checkout.earnedPoints', { points: points(done.bonusEarned ?? 0) })}
        </p>
      )}
      {done.status === 'CONFIRMED' && done.confirmationCode && (
        <div className="mt-3 rounded-lg border border-emerald-400 bg-white p-3">
          <p className="text-sm font-medium">{t('confirm.title')}</p>
          <p className="mt-1 font-mono text-3xl tracking-[0.3em] text-emerald-900">{done.confirmationCode}</p>
          <p className="mt-1 text-xs text-stone-600">{t('confirm.showAtDoor')}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/orders/${done.id}`} className="btn-primary">
          {t('order.open')}
        </Link>
        <Link href="/orders" className="btn-secondary">
          {t('checkout.myOrders')}
        </Link>
        <button className="btn-secondary" onClick={() => setDone(null)}>
          {t('checkout.dismiss')}
        </button>
      </div>
    </div>
  );

  // Step 2: the order is saved and waiting for the (simulated) payment.
  if (draft?.orderId && order?.status === 'PENDING') {
    return (
      <div className="mx-auto max-w-2xl">
        {resultBanner}
        <h1 className="text-2xl font-semibold">{t('checkout.paymentTitle')}</h1>
        <div className="card mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">{t('checkout.orderNumber', { id: order.id })}</h2>
            <StatusBadge status={order.status} />
          </div>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {order.items.map((i) => (
              <li key={`${i.itemId}|${i.participant ?? ''}`} className="flex justify-between gap-3 py-1.5">
                <span>
                  {i.quantity} × {c.dish(i.name)}
                  {i.participant && <span className="ml-2 text-stone-500">· {i.participant}</span>}
                </span>
                <span className="whitespace-nowrap">{formatKzt((i.unitPriceTiyn ?? 0) * i.quantity, lang)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between text-sm">
            <span>{t('checkout.items')}</span>
            <span>{formatKzt(order.totalTiyn ?? 0, lang)}</span>
          </p>
          {Boolean(order.bonusRequested) && (
            <p className="flex justify-between text-sm text-amber-800">
              <span>
                {t('checkout.bonusTitle')} ({points(order.bonusRequested ?? 0)})
              </span>
              <span>−{formatKzt(order.discountTiyn ?? 0, lang)}</span>
            </p>
          )}
          <p className="mt-1 flex justify-between border-t border-stone-200 pt-2 font-medium">
            <span>{t('checkout.toPay')}</span>
            <span>{formatKzt(order.payableTiyn ?? order.totalTiyn ?? 0, lang)}</span>
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {t('checkout.delivery')}:{' '}
            {order.deliveryTime ? new Date(order.deliveryTime).toLocaleString(lang) : t('checkout.asap')} ·{' '}
            {order.deliveryAddress}
          </p>
          <p className="mt-3 text-sm" aria-live="polite">
            {t('checkout.timeLeft')}{' '}
            <strong>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </strong>
          </p>
        </div>

        <div className="card mt-4">
          <p className="text-sm text-stone-600">{t('checkout.paymentIntro')}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button className="btn-primary" disabled={payment.isLoading} onClick={() => pay('success')}>
              {t('checkout.approve')}
            </button>
            <button className="btn-danger" disabled={payment.isLoading} onClick={() => pay('rejected')}>
              {t('checkout.reject')}
            </button>
            <button className="btn-secondary" disabled={payment.isLoading} onClick={() => pay('timeout')}>
              {t('checkout.timeout')}
            </button>
            <button className="btn-secondary" disabled={payment.isLoading} onClick={() => pay('lost_reply')}>
              {t('checkout.lostReply')}
            </button>
          </div>
          {retryNote && (
            <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p>{retryNote}</p>
              <button className="btn-primary mt-2" disabled={payment.isLoading} onClick={() => pay('success')}>
                {t('checkout.retryCheckout')}
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (menu.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">{t('checkout.title')}</h1>
        <div className="mt-4">
          <SkeletonForm fields={5} />
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
          <p>{t('checkout.empty')}</p>
          <Link href="/" className="btn-primary mt-3">
            {t('checkout.browseMenu')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {resultBanner}
      <h1 className="text-2xl font-semibold">{t('checkout.title')}</h1>

      <section className="card mt-4" aria-labelledby="cart-h">
        <h2 id="cart-h" className="font-medium">
          {t('checkout.yourOrder')}
        </h2>
        <ul className="mt-2 divide-y divide-stone-100">
          {lines.map(({ line, item }) => (
            <li key={`${line.itemId}|${line.participant}`} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-[8rem] flex-1">
                  {c.dish(item.name)}
                  {line.participant && (
                    <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                      {line.participant}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-secondary px-3 py-1"
                    disabled={frozen}
                    aria-label={t('menu.removeOne', { name: c.dish(item.name) })}
                    onClick={() =>
                      dispatch(
                        setQuantity({
                          itemId: line.itemId,
                          participant: line.participant,
                          quantity: line.quantity - 1,
                        }),
                      )
                    }
                  >
                    −
                  </button>
                  <span className="w-5 text-center">{line.quantity}</span>
                  <button
                    className="btn-secondary px-3 py-1"
                    disabled={frozen || line.quantity >= MAX_QUANTITY}
                    aria-label={t('menu.addOne', { name: c.dish(item.name) })}
                    onClick={() =>
                      dispatch(
                        setQuantity({
                          itemId: line.itemId,
                          participant: line.participant,
                          quantity: line.quantity + 1,
                        }),
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <span className="w-24 text-right">{formatKzt(line.quantity * item.priceTiyn, lang)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-stone-200 pt-3 text-sm">
          <span>{t('checkout.items')}</span>
          <span>{formatKzt(total, lang)}</span>
        </p>
        {usedPoints > 0 && (
          <p className="flex justify-between text-sm text-amber-800">
            <span>{t('checkout.bonusTitle')}</span>
            <span>−{formatKzt(discount, lang)}</span>
          </p>
        )}
        <p className="mt-1 flex justify-between font-medium">
          <span>{t('checkout.toPay')}</span>
          <span>{formatKzt(payable, lang)}</span>
        </p>
      </section>

      <GroupOrder lines={lines} frozen={frozen} payableTiyn={payable} />

      {nutrition.data && (
        <div className="mt-4">
          <NutritionPanel summary={nutrition.data.summary} />
        </div>
      )}

      <section className="card mt-4" aria-labelledby="bonus-h">
        <h2 id="bonus-h" className="font-medium">
          {t('checkout.bonusTitle')}
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          {t('checkout.bonusHave', { points: points(balance), value: formatKzt(pointTiyn, lang) })}{' '}
          {t('checkout.bonusRules', { share: maxSharePercent, earn: earnPercent })}
        </p>
        {maxPoints === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            {balance === 0 ? t('checkout.bonusNone') : t('checkout.bonusTooSmall')}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="points" className="label">
                {t('checkout.bonusUse', { max: maxPoints })}
              </label>
              <input
                id="points"
                type="number"
                inputMode="numeric"
                className="input w-40"
                min={0}
                max={maxPoints}
                step={1}
                disabled={frozen}
                value={cart.bonusPoints}
                onChange={(e) => dispatch(setBonusPoints(Math.min(Number(e.target.value), maxPoints)))}
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={frozen}
              onClick={() => dispatch(setBonusPoints(maxPoints))}
            >
              {t('checkout.bonusMax')}
            </button>
            {cart.bonusPoints > 0 && (
              <button type="button" className="btn-secondary" disabled={frozen} onClick={() => dispatch(setBonusPoints(0))}>
                {t('checkout.bonusZero')}
              </button>
            )}
          </div>
        )}
        <p className="mt-3 text-sm text-emerald-800">{t('checkout.bonusWillEarn', { points: points(willEarn) })}</p>
      </section>

      <section className="card mt-4 space-y-4" aria-labelledby="delivery-h">
        <h2 id="delivery-h" className="font-medium">
          {t('checkout.delivery')}
        </h2>
        <div>
          <label htmlFor="address" className="label">
            {t('checkout.address')}
          </label>
          <input
            id="address"
            className="input"
            disabled={frozen}
            maxLength={240}
            value={cart.deliveryAddress}
            onChange={(e) => dispatch(setField({ field: 'deliveryAddress', value: e.target.value }))}
          />
        </div>
        <fieldset disabled={frozen}>
          <legend className="label">{t('checkout.time')}</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="when"
                checked={cart.deliveryTime === ''}
                onChange={() => dispatch(setField({ field: 'deliveryTime', value: '' }))}
              />
              {t('checkout.asap')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="when"
                checked={cart.deliveryTime !== ''}
                onChange={() =>
                  dispatch(setField({ field: 'deliveryTime', value: toLocalInput(new Date(Date.now() + 3600 * 1000)) }))
                }
              />
              {t('checkout.chooseTime')}
            </label>
            {cart.deliveryTime !== '' && (
              <input
                type="datetime-local"
                aria-label={t('checkout.requestedTime')}
                className="input w-auto"
                value={cart.deliveryTime}
                min={toLocalInput(new Date())}
                max={toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000))}
                onChange={(e) => dispatch(setField({ field: 'deliveryTime', value: e.target.value }))}
              />
            )}
          </div>
        </fieldset>
        <div>
          <label htmlFor="notes" className="label">
            {t('checkout.notes')}
          </label>
          <textarea
            id="notes"
            rows={2}
            maxLength={300}
            className="input"
            disabled={frozen}
            value={cart.notes}
            onChange={(e) => dispatch(setField({ field: 'notes', value: e.target.value }))}
          />
        </div>
      </section>

      {draft && !draft.orderId && (
        <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          {t('checkout.retryNotice')}
          <button className="ml-3 underline" onClick={() => dispatch(clearDraft())}>
            {t('checkout.discardAttempt')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        className="btn-primary mt-4 w-full"
        disabled={create.isLoading || lines.length === 0}
        onClick={placeOrder}
      >
        {create.isLoading
          ? t('checkout.savingOrder')
          : draft
            ? t('checkout.retrySame')
            : t('checkout.continue', { total: formatKzt(payable, lang) })}
      </button>
    </div>
  );
}

/** <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
