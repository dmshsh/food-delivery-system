'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEMES)[number];

const STORAGE_KEY = 'food-delivery-theme';

interface ThemeValue {
  /** What the person chose, which may be "follow the system". */
  choice: ThemeChoice;
  /** What is actually on screen right now. */
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function isChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Light, dark, or whatever the computer is set to.
 *
 * "System" is the default and a real option rather than a starting value: many
 * people switch their whole machine at sunset and expect this to follow. It is
 * also why the choice is stored as the word "system" and not resolved once —
 * resolving it at the time of choosing would freeze it to whatever it was that
 * evening.
 *
 * Nothing is written to <html> on the server. The script in the document head
 * applies the stored choice before the first paint, so there is no flash of the
 * wrong theme, and this provider only keeps it in step afterwards.
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('system');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isChoice(saved)) setChoiceState(saved);
    } catch {
      /* storage blocked: the system preference is a fine default */
    }
    setSystemDark(systemPrefersDark());

    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') {
      // Removed rather than set, so the stylesheet's own "follow the system"
      // rule takes over and the two can never disagree.
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', choice);
    }
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies to this tab */
    }
  }, []);

  const value = useMemo<ThemeValue>(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

/**
 * Runs before the page is painted, so the right theme is on screen from the
 * first frame. It has to be inline and blocking: anything loaded later happens
 * after the first paint, which is exactly the flash this avoids.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('${STORAGE_KEY}');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {}
})();
`;
