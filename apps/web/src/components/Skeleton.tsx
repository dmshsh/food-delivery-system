'use client';

import { useT } from '@/i18n/I18nProvider';

/**
 * What a page shows while it is waiting.
 *
 * A skeleton is a promise about the shape of what is coming, so each one here
 * matches the real thing it stands in for. A generic grey box that turns into a
 * table makes the page jump; one that is already table-shaped does not.
 *
 * All of them are hidden from screen readers and announced once, in words, by
 * the region that holds them: a reader does not want eleven grey rectangles
 * read out, it wants "loading".
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

/** Wraps a set of skeletons and says what is loading, once. */
export function Loading({ label, children }: { label?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {children}
    </div>
  );
}

/** A line of text. Widths vary so a paragraph does not look like a barcode. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-11/12', 'w-10/12', 'w-9/12', 'w-8/12'];
  return (
    <span className={`block space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${widths[i % widths.length]}`} />
      ))}
    </span>
  );
}

/** The menu: a grid of dish cards. */
export function SkeletonMenu({ count = 6 }: { count?: number }) {
  return (
    <Loading>
      <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="card">
            <div className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-20" />
            </div>
            <SkeletonText lines={2} className="mt-3" />
            <Skeleton className="mt-4 h-9 w-24 rounded-lg" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/** A list of cards: orders, reviews, addresses. */
export function SkeletonCards({ count = 3, lines = 3 }: { count?: number; lines?: number }) {
  return (
    <Loading>
      <ul className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="card">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <SkeletonText lines={lines} className="mt-3" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/** A table, with its header already in place. */
export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <Loading>
      <div className="card overflow-hidden p-0">
        <div className="flex gap-4 border-b border-stone-200 bg-stone-100 px-4 py-2" aria-hidden="true">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex gap-4 border-b border-stone-100 px-4 py-3" aria-hidden="true">
            {Array.from({ length: columns }, (_, i) => (
              <Skeleton key={i} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A row of summary figures. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <Loading>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="card">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A chart: the plot area and an axis. */
export function SkeletonChart() {
  return (
    <Loading>
      <div className="card">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-48 w-full rounded-lg" />
        <div className="mt-3 flex gap-4" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-2 flex-1" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

/** A form. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <Loading>
      <div className="card space-y-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </Loading>
  );
}
