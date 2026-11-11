'use client';

import { useState } from 'react';
import { errorMessage, formatDateTime, stars } from '@/lib/format';
import { useFeedbackListQuery, useReplyToFeedbackMutation } from '@/store/api';

export default function FeedbackTab() {
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
      setMessage('Your reply is now shown to the customer under their order.');
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  if (error != null) return <p role="alert" className="text-red-700">{errorMessage(error)}</p>;

  const summary = data?.summary;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Customer reviews</h2>
          <p className="text-sm text-stone-600">One review per delivered order. A reply appears under the order the customer sees.</p>
        </div>
        <div>
          <label htmlFor="rating" className="label">Rating</label>
          <select id="rating" className="input" value={rating} onChange={(e) => setRating(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All</option>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} star{r === 1 ? '' : 's'}</option>)}
          </select>
        </div>
      </div>

      {summary && (
        <div className="card mt-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-3xl font-semibold">{summary.count ? summary.average : '—'}</p>
              <p className="text-amber-600">{summary.count ? stars(summary.average) : 'no reviews yet'}</p>
              <p className="text-xs text-stone-500">{summary.count} review{summary.count === 1 ? '' : 's'} · {summary.unanswered} without a reply</p>
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
        {(data?.feedback ?? []).length === 0 && <li className="card text-stone-500">No reviews for this filter.</li>}
        {(data?.feedback ?? []).map((f) => (
          <li key={f.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-amber-600" aria-label={`${f.rating} out of 5`}>{stars(f.rating)}</span>
              <span className="text-sm text-stone-500">
                Order #{f.orderId} · {f.customerName} · {formatDateTime(f.createdAt)}
              </span>
            </div>
            {f.comment && <p className="mt-2 italic text-stone-700">“{f.comment}”</p>}

            {f.reply ? (
              <p className="mt-2 border-l-2 border-emerald-400 pl-3 text-sm text-stone-700">
                <strong>Replied</strong>
                {f.repliedByName && <> by {f.repliedByName}</>}
                {f.repliedAt && <> on {formatDateTime(f.repliedAt)}</>}: {f.reply}
              </p>
            ) : openId === f.id ? (
              <form onSubmit={send} className="mt-3">
                <label htmlFor={`reply-${f.id}`} className="label">Your reply</label>
                <textarea id={`reply-${f.id}`} rows={2} maxLength={500} required className="input" value={text}
                  onChange={(e) => setText(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" disabled={reply.isLoading}>{reply.isLoading ? 'Sending…' : 'Send reply'}</button>
                  <button type="button" className="btn-secondary" onClick={() => { setOpenId(null); setText(''); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button className="btn-secondary mt-3" onClick={() => { setOpenId(f.id); setText(''); }}>Reply</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
