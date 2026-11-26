'use client';

import { useT } from '@/i18n/I18nProvider';
import { THEMES, type ThemeChoice, useTheme } from './ThemeProvider';

const ICON: Record<ThemeChoice, string> = {
  light: '☀',
  dark: '☾',
  system: '◐',
};

/**
 * Three states, one control.
 *
 * A two-state toggle cannot express "follow my computer", which is what most
 * people actually want, so this cycles through all three and says which one it
 * is on. The label is text as well as an icon: a moon on its own does not say
 * whether it means "dark mode is on" or "press for dark mode".
 */
export default function ThemeSwitch({ className = '' }: { className?: string }) {
  const t = useT();
  const { choice, setChoice } = useTheme();

  const next = THEMES[(THEMES.indexOf(choice) + 1) % THEMES.length];
  const label = t(`theme.${choice}` as 'theme.light');

  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      className={`inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-sm text-stone-700 transition hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${className}`}
      aria-label={t('theme.switchTo', { theme: t(`theme.${next}` as 'theme.light') })}
      title={t('theme.switchTo', { theme: t(`theme.${next}` as 'theme.light') })}
    >
      <span aria-hidden="true">{ICON[choice]}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
