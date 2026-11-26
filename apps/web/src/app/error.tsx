'use client';

import { useEffect } from 'react';
import EmptyState from '@/components/EmptyState';
import { useT } from '@/i18n/I18nProvider';

/**
 * The screen for an error a page did not expect.
 *
 * `reset` re-renders the part of the tree that failed, which is worth offering
 * first: most of these are a request that failed once, and trying again is
 * genuinely likely to work. The message itself is never shown — it is written
 * for whoever reads the console, not for the person trying to order lunch.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled error on this page:', error);
  }, [error]);

  const t = useT();
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        kind="error"
        title={t('error.unexpectedTitle')}
        description={t('error.unexpectedText')}
        onAction={reset}
        actionLabel={t('common.retry')}
        action={{ href: '/', label: t('error.backToMenu') }}
      />
      {error.digest && <p className="mt-3 text-center text-xs text-stone-500">{t('error.reference', { id: error.digest })}</p>}
    </div>
  );
}
