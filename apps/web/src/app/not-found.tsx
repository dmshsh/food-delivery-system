'use client';

import EmptyState from '@/components/EmptyState';
import { useT } from '@/i18n/I18nProvider';

/**
 * The 404 page.
 *
 * Next.js shows this for any address that matches no route, and for anything a
 * page reports as missing with `notFound()`. It is a dead end by definition, so
 * the one thing it owes the reader is a way out that is not the back button.
 */
export default function NotFound() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        icon="🧭"
        title={t('error.notFoundTitle')}
        description={t('error.notFoundText')}
        action={{ href: '/', label: t('error.backToMenu') }}
      />
    </div>
  );
}
