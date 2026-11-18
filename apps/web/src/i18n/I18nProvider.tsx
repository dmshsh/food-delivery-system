'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, type Language, type MessageKey, translate } from './dictionaries';

const STORAGE_KEY = 'food-delivery-language';

interface I18nValue {
  lang: Language;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLang: (lang: Language) => void;
  /** True until the stored choice has been read, so the first paint is not the wrong language. */
  ready: boolean;
}

const I18nContext = createContext<I18nValue | null>(null);

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** What the browser is set to, if it is one of ours. */
function fromBrowser(): Language | null {
  if (typeof navigator === 'undefined') return null;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
    if (base === 'kz') return 'kk'; // kz is the country, kk is the language
  }
  return null;
}

/**
 * Which language the site speaks.
 *
 * The choice is looked for in this order: what this browser last chose, what the
 * browser itself is set to, and English. A signed-in person's own setting
 * overrides all of it — see `useLanguageSync` below — so the language follows
 * the account to any device.
 *
 * The first render is always English, because the server rendering the page has
 * no access to localStorage and a mismatch between the two would be a hydration
 * error. The stored choice is applied immediately afterwards.
 */
export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let chosen: Language | null = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLanguage(saved)) chosen = saved;
    } catch {
      /* storage blocked: fall through to the browser's own setting */
    }
    setLangState(chosen ?? fromBrowser() ?? 'en');
    setReady(true);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies to this tab */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      ready,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/** The common case: just the translate function. */
export function useT() {
  return useI18n().t;
}
