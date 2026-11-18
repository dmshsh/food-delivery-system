'use client';

import { useT } from '@/i18n/I18nProvider';

export default function Footer() {
  const t = useT();
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 pb-8 pt-4 text-xs text-stone-500">{t('footer.note')}</footer>
  );
}
