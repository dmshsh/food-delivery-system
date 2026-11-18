'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateTime, stars, translateError } from '@/lib/format';
import { useFeedbackListQuery, useReplyToFeedbackMutation } from '@/store/api';

export default function FeedbackTab() {
  const { t, lang } = useI18n();
  const [rating, setRating] = useState<number | ''>('');
  const { data, isLoading, error } = useFeedbackListQuery({ rating });
  const [replyTo, reply] = useReplyToFeedbackMutation();
  const [openId, setOpenId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (openId === null) return;
    setMessage('');
    try {
      await replyTo({ id: openId, reply: text.trim() }).unwrap();
      setOpenId(null);
      setText('');
      setMessage(t('admin.replySent'));
    } catch (err) {
      setMessage(translateError(err, t));
    }
  }

  if (isLoading) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (error != null) return <p role="alert" className="text-red-700">{translateError(error, t)}</p>;

  const summary = data?.summary;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{t('admin.tab.feedback')}</h2>
          <p className="text-sm text-stone-600">{t('admin.reviewsHint')}</p>
        </div>
        <div>
          <label htmlFor="rating" className="label">{t('admin.ratingFilter')}</label>
          <select id="rating" className="input" value={rating} onChange={(e) => setRating(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('common.all')}</option>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{t('review.stars', { count: r })}</option>)}
          </select>
        </div>
      </div>

      {summary && (
        <div className="card mt-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-3xl font-semibold">{summary.count ? summary.average : '—'}</p>
              <p className="text-amber-600">{summary.count ? stars(summary.average) : t('accounting.noReviews')}</p>
              <p className="text-xs text-stone-500">
                {t('admin.reviewCount', { count: summary.count })} · {t('admin.reviewsWithout', { count: summary.unanswered })}
              </p>
            </div>
            <ul className="flex-1 space-y-1 text-sm">
              {[5, 4, 3, 2, 1].map((star) => {
                const n = summary.byRating[String(star)] ?? 0;
                const share = summary.count ? Math.round((n / summary.count) * 100) : 0;
                return (
                  <li key={star} className="flex items-center gap-2">
                    <span className="w-10 text-right text-stone-600">{star} ★</span>
                    <span className="h-2 flex-1 rounded-full bg-stone-200">
                      <span className="block h-2 rounded-full bg-amber-400" style={{ width: `${share}%` }} />
                    </span>
                    <span className="w-10 text-right text-stone-600">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">{message}</p>
      )}

      <ul className="mt-4 space-y-3">
        {(data?.feedback ?? []).length === 0 && <li className="card text-stone-500">{t('admin.noReviews')}</li>}
        {(data?.feedback ?? []).map((f) => (
          <li key={f.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-amber-600" aria-label={t('review.stars', { count: f.rating })}>{stars(f.rating)}</span>
              <span className="text-sm text-stone-500">
                {t('checkout.orderNumber', { id: f.orderId })} · {f.customerName} · {formatDateTime(f.createdAt, lang)}
              </span>
            </div>
            {f.comment && <p className="mt-2 italic text-stone-700">“{f.comment}”</p>}

            {f.reply ? (
              <p className="mt-2 border-l-2 border-emerald-400 pl-3 text-sm text-stone-700">
                <strong>{t('admin.replied')}</strong>
                {f.repliedByName && <>{t('admin.repliedBy', { name: f.repliedByName })}</>}
                {f.repliedAt && <>{t('admin.repliedOn', { date: formatDateTime(f.repliedAt, lang) })}</>}: {f.reply}
              </p>
            ) : openId === f.id ? (
              <form onSubmit={send} className="mt-3">
                <label htmlFor={`reply-${f.id}`} className="label">{t('admin.yourReply')}</label>
                <textarea id={`reply-${f.id}`} rows={2} maxLength={500} required className="input" value={text}
                  onChange={(e) => setText(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" disabled={reply.isLoading}>{reply.isLoading ? t('review.sending') : t('admin.sendReply')}</button>
                  <button type="button" className="btn-secondary" onClick={() => { setOpenId(null); setText(''); }}>{t('common.cancel')}</button>
                </div>
              </form>
            ) : (
              <button className="btn-secondary mt-3" onClick={() => { setOpenId(f.id); setText(''); }}>{t('admin.reply')}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
