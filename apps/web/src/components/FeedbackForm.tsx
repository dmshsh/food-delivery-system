'use client';

import { useState } from 'react';
import { errorMessage, stars } from '@/lib/format';
import type { Order } from '@/lib/types';
import { useLeaveFeedbackMutation } from '@/store/api';

/**
 * The review under a delivered order: five stars and an optional comment.
 * Once a review exists it is shown instead of the form, together with the
 * restaurant's answer if one has been written.
 */
export default function FeedbackForm({ order }: { order: Order }) {
  const [leaveFeedback, { isLoading }] = useLeaveFeedbackMutation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  if (order.feedback) {
    return (
      <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
        <p className="text-amber-700" aria-label={`Rated ${order.feedback.rating} out of 5`}>
          {stars(order.feedback.rating)} <span className="text-stone-600">· your review</span>
        </p>
        {order.feedback.comment && <p className="mt-1 italic text-stone-700">“{order.feedback.comment}”</p>}
        {order.feedback.reply && (
          <p className="mt-2 border-l-2 border-emerald-400 pl-3 text-stone-700">
            <strong>The restaurant replied:</strong> {order.feedback.reply}
          </p>
        )}
      </div>
    );
  }

  if (order.status !== 'DELIVERED') return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (rating === 0) return setError('Choose a rating from 1 to 5 stars.');
    try {
      await leaveFeedback({ id: order.id, rating, comment: comment.trim() }).unwrap();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <fieldset>
        <legend className="label">How was this order?</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              className={`rounded px-1.5 text-2xl leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                value <= rating ? 'text-amber-500' : 'text-stone-300 hover:text-amber-300'
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`comment-${order.id}`} className="label mt-3">Comment (optional)</label>
      <textarea
        id={`comment-${order.id}`}
        rows={2}
        maxLength={500}
        className="input"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What went well, what could be better?"
      />
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary mt-3" disabled={isLoading}>
        {isLoading ? 'Sending…' : 'Send review'}
      </button>
    </form>
  );
}
