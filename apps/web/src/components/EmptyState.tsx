'use client';

import Link from 'next/link';

/**
 * What a page shows when there is nothing to show.
 *
 * Three different situations wear the same clothes elsewhere and should not:
 *
 *   empty    nothing here yet, and that is normal — a new customer with no
 *            orders. It says what would put something here.
 *   noMatch  there is something, but not under these filters. It offers to
 *            widen them, because the data is there and the question was narrow.
 *   error    something went wrong. It offers to try again.
 *
 * Telling a first-time visitor "nothing matches your filters" when they have no
 * filters, or telling someone whose network dropped that they have no orders,
 * are both ways of blaming the reader for the page's own state.
 */
export default function EmptyState({
  kind = 'empty',
  icon,
  title,
  description,
  action,
  onAction,
  actionLabel,
}: {
  kind?: 'empty' | 'noMatch' | 'error';
  icon?: string;
  title: string;
  description?: string;
  /** A link, when the next step is somewhere else. */
  action?: { href: string; label: string };
  /** A button, when the next step is here — retrying, clearing a filter. */
  onAction?: () => void;
  actionLabel?: string;
}) {
  const tone =
    kind === 'error'
      ? 'border-red-300 bg-red-50'
      : kind === 'noMatch'
        ? 'border-amber-300 bg-amber-50'
        : 'border-stone-200 bg-white';

  return (
    <div
      className={`rounded-xl border p-8 text-center shadow-sm ${tone}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <p className="text-3xl" aria-hidden="true">
        {icon ?? (kind === 'error' ? '⚠' : kind === 'noMatch' ? '🔍' : '🍽')}
      </p>
      <h2 className="mt-3 text-lg font-medium text-stone-900">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">{description}</p>}

      {(action || onAction) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {action && (
            <Link href={action.href} className="btn-primary">
              {action.label}
            </Link>
          )}
          {onAction && actionLabel && (
            <button type="button" className={action ? 'btn-secondary' : 'btn-primary'} onClick={onAction}>
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
