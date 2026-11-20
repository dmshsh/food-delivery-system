'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/components/useSession';
import { useSetLanguageMutation } from '@/store/api';
import { useI18n } from './I18nProvider';
import { LANGUAGES, LANGUAGE_NAMES, type Language } from './dictionaries';

/**
 * Keeps the account's language and this browser's choice in step.
 *
 * On signing in, the account's setting wins once: it is the choice the person
 * made deliberately, and it should follow them to a new device. After that,
 * switching here saves back to the account, so the next device sees it too.
 */
function useLanguageSync() {
  const { user } = useSession();
  const { lang, setLang } = useI18n();
  const [save] = useSetLanguageMutation();
  const appliedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      appliedFor.current = null;
      return;
    }
    // Only once per sign-in, otherwise it would fight every switch the person makes.
    if (appliedFor.current === user.id) return;
    appliedFor.current = user.id;
    const stored = user.language;
    if (stored && stored !== lang && (LANGUAGES as readonly string[]).includes(stored)) {
      setLang(stored as Language);
    }
  }, [user, lang, setLang]);

  return (next: Language) => {
    setLang(next);
    // Saving is a convenience, not a requirement: a failure here must not stop
    // the page from switching language.
    if (user) void save({ language: next }).unwrap().catch(() => undefined);
  };
}

export default function LanguageSwitch({ className = '' }: { className?: string }) {
  const { lang, t } = useI18n();
  const choose = useLanguageSync();

  return (
    <label className={`flex items-center gap-1 ${className}`}>
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-700 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        value={lang}
        onChange={(e) => choose(e.target.value as Language)}
        aria-label={t('common.language')}
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
