'use client';

import { useState } from 'react';
import { useContent } from '@/i18n/content';
import { useI18n } from '@/i18n/I18nProvider';
import { formatKzt } from '@/lib/format';
import type { MenuItem } from '@/lib/types';
import {
  MAX_PARTICIPANTS,
  assignLine,
  clearParticipants,
  namedParticipants,
  setParticipants,
  splitOne,
  type CartLine,
} from '@/store/cartSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

/**
 * Ordering together: one delivery, one bill, split between the people in it.
 *
 * The split is shown while the order is still being built, not after it is
 * placed. "Who owes what" is the question the table actually has, and answering
 * it at the end, when the money has already left one person's account, is too
 * late to be useful.
 *
 * Bonus points are not split. They are the discount of whoever placed the
 * order, earned by their own past orders; spreading them over the table would
 * quietly hand away something one person earned.
 */
export default function GroupOrder({
  lines,
  frozen,
  payableTiyn,
}: {
  lines: { line: CartLine; item: MenuItem }[];
  frozen: boolean;
  payableTiyn: number;
}) {
  const dispatch = useAppDispatch();
  const participants = useAppSelector((s) => s.cart.participants);
  const { t, lang } = useI18n();
  const c = useContent();
  const [draftName, setDraftName] = useState('');

  const on = participants.length > 0;

  function addPerson() {
    const name = draftName.trim();
    if (!name || participants.length >= MAX_PARTICIPANTS) return;
    if (namedParticipants(participants).some((p) => p.toLowerCase() === name.toLowerCase())) return;
    // Fill the first empty slot before growing the list.
    const empty = participants.findIndex((p) => !p.trim());
    const next = [...participants];
    if (empty >= 0) next[empty] = name;
    else next.push(name);
    dispatch(setParticipants(next));
    setDraftName('');
  }

  if (!on) {
    return (
      <section className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">{t('group.title')}</h2>
            <p className="text-sm text-stone-600">{t('group.hint')}</p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={frozen}
            // Two empty names to begin with: a group order needs at least two
            // people, and starting with the shape of the answer is clearer than
            // starting with nothing and explaining the rule afterwards.
            onClick={() => dispatch(setParticipants(['', '']))}
          >
            {t('group.enable')}
          </button>
        </div>
      </section>
    );
  }

  const named = namedParticipants(participants);
  const totals = new Map<string, { itemCount: number; totalTiyn: number }>();
  for (const name of named) totals.set(name, { itemCount: 0, totalTiyn: 0 });
  let unassignedTiyn = 0;
  for (const { line, item } of lines) {
    const amount = line.quantity * item.priceTiyn;
    const person = line.participant ? totals.get(line.participant) : undefined;
    if (!person) {
      unassignedTiyn += amount;
      continue;
    }
    person.itemCount += line.quantity;
    person.totalTiyn += amount;
  }

  return (
    <section className="card mt-4" aria-labelledby="group-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="group-h" className="font-medium">
            {t('group.title')}
          </h2>
          <p className="text-sm text-stone-600">{t('group.hint')}</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={frozen}
          onClick={() => dispatch(clearParticipants())}
        >
          {t('group.disable')}
        </button>
      </div>

      {/* The people */}
      <div className="mt-4">
        <p className="label">{t('group.people')}</p>
        <ul className="space-y-2">
          {participants.map((name, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                className="input"
                maxLength={40}
                disabled={frozen}
                placeholder={t('group.personPlaceholder')}
                aria-label={`${t('group.personName')} ${index + 1}`}
                value={name}
                onChange={(e) => {
                  const next = [...participants];
                  next[index] = e.target.value;
                  dispatch(setParticipants(next));
                }}
              />
              <button
                type="button"
                className="btn-secondary px-3"
                disabled={frozen}
                aria-label={t('group.remove', { name: name || String(index + 1) })}
                onClick={() => dispatch(setParticipants(participants.filter((_, i) => i !== index)))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {participants.length < MAX_PARTICIPANTS && (
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              maxLength={40}
              disabled={frozen}
              placeholder={t('group.personPlaceholder')}
              aria-label={t('group.addPerson')}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPerson();
                }
              }}
            />
            <button type="button" className="btn-secondary" disabled={frozen} onClick={addPerson}>
              {t('group.addPerson')}
            </button>
          </div>
        )}
        {named.length < 2 && <p className="mt-2 text-sm text-amber-800">{t('group.needTwo')}</p>}
      </div>

      {/* Who each dish is for */}
      {named.length >= 2 && (
        <div className="mt-5">
          <p className="label">{t('group.forWhom')}</p>
          <ul className="space-y-2">
            {lines.map(({ line, item }) => (
              <li
                key={`${line.itemId}|${line.participant}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 p-2 text-sm"
              >
                <span className="min-w-[8rem] flex-1">
                  {line.quantity} × {c.dish(item.name)}
                </span>
                <select
                  className="input w-auto py-1"
                  disabled={frozen}
                  aria-label={t('group.forWhom')}
                  value={line.participant}
                  onChange={(e) =>
                    dispatch(assignLine({ itemId: line.itemId, from: line.participant, to: e.target.value }))
                  }
                >
                  <option value="">{t('group.nobody')}</option>
                  {named.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {/*
                  Splitting matters when two people want the same dish: without
                  it the only way to give one portion each is to remove the line
                  and add it twice.
                */}
                {line.quantity > 1 && (
                  <select
                    className="input w-auto py-1"
                    disabled={frozen}
                    aria-label={t('group.split')}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      dispatch(splitOne({ itemId: line.itemId, from: line.participant, to: e.target.value }));
                    }}
                  >
                    <option value="">− 1 →</option>
                    {named
                      .filter((name) => name !== line.participant)
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The bill */}
      {named.length >= 2 && (
        <div className="mt-5">
          <p className="label">{t('group.split')}</p>
          <ul className="space-y-1 text-sm">
            {named.map((name) => {
              const share = totals.get(name) ?? { itemCount: 0, totalTiyn: 0 };
              return (
                <li key={name} className="flex justify-between gap-3">
                  <span>
                    {t('group.owes', { name, amount: formatKzt(share.totalTiyn, lang) })}
                    <span className="ml-2 text-stone-500">{t('group.itemsFor', { count: share.itemCount })}</span>
                  </span>
                </li>
              );
            })}
            {unassignedTiyn > 0 && (
              <li className="text-amber-800">
                {t('group.unassigned', { amount: formatKzt(unassignedTiyn, lang) })}
              </li>
            )}
          </ul>
          <p className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-sm font-medium">
            <span>{t('checkout.toPay')}</span>
            <span>{formatKzt(payableTiyn, lang)}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">{t('group.discountNote')}</p>
        </div>
      )}
    </section>
  );
}
