'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import LanguageSwitch from '@/i18n/LanguageSwitch';
import ThemeSwitch from './ThemeSwitch';
import { useT } from '@/i18n/I18nProvider';
import { roleKey } from '@/lib/format';
import type { MessageKey } from '@/i18n/dictionaries';
import { api, useLogoutMutation } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { cartCount } from '@/store/cartSlice';
import { useSession } from './useSession';

/**
 * The site header.
 *
 * On a phone the navigation does not fit beside the name and the account, so it
 * collapses behind a button and opens as a panel underneath. The same links,
 * the same order — only the shape changes, so there is one list to maintain
 * rather than two that drift apart.
 */
export default function Header() {
  const { user, profile } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const t = useT();
  const [logout] = useLogoutMutation();
  const [open, setOpen] = useState(false);
  const count = useAppSelector((s) => cartCount(s.cart));

  // Moving to another page closes the panel; leaving it open over the new page
  // would hide the thing the person just asked for.
  useEffect(() => setOpen(false), [pathname]);

  const links: { href: string; label: string }[] = [{ href: '/', label: t('nav.menu') }];
  if (!user || user.role === 'CUSTOMER') {
    links.push({ href: '/checkout', label: count ? `${t('nav.checkout')} (${count})` : t('nav.checkout') });
  }
  if (user?.role === 'CUSTOMER') {
    links.push({ href: '/orders', label: t('nav.orders') });
    links.push({ href: '/bonus', label: t('nav.bonus') });
  }
  if (user?.role === 'KITCHEN') links.push({ href: '/kitchen', label: t('nav.kitchen') });
  if (user?.role === 'ACCOUNTANT') links.push({ href: '/accounting', label: t('nav.accounting') });
  if (user?.role === 'ADMIN') {
    links.push({ href: '/accounting', label: t('nav.accounting') });
    links.push({ href: '/admin', label: t('nav.admin') });
  }
  if (user) links.push({ href: '/profile', label: t('nav.profile') });

  async function signOut() {
    await logout().unwrap().catch(() => undefined);
    dispatch(api.util.resetApiState()); // forget everything the previous user could see
    router.push('/');
  }

  const linkClass = (href: string) =>
    `inline-flex h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
      pathname === href
        ? 'bg-emerald-50 font-medium text-emerald-900'
        : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
    }`;

  const roleLabel = user ? t(roleKey(user.role) as MessageKey) : '';

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="shrink-0 whitespace-nowrap text-lg font-semibold text-emerald-800">
          {t('nav.title')}
        </Link>

        {/* Wide screens: the links sit in the bar, on one line. */}
        <nav className="hidden min-w-0 items-center gap-1 lg:flex" aria-label={t('nav.main')}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={linkClass(l.href)}
              aria-current={pathname === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user && profile && (
            <Link
              href="/bonus"
              className="hidden h-9 items-center whitespace-nowrap rounded-full bg-amber-100 px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 sm:inline-flex"
              title={t('nav.bonus')}
            >
              {t('nav.pointsBadge', { count: profile.bonusPoints })}
            </Link>
          )}
          <ThemeSwitch className="hidden sm:inline-flex" />
          <LanguageSwitch className="hidden sm:flex" />
          {user ? (
            <>
              <div className="hidden max-w-[11rem] flex-col leading-tight xl:flex" title={`${user.fullName} · ${roleLabel}`}>
                <span className="truncate text-sm font-medium text-stone-800">{user.fullName}</span>
                <span className="truncate text-xs text-stone-500">{roleLabel}</span>
              </div>
              <button type="button" onClick={signOut} className="btn-secondary hidden h-9 whitespace-nowrap py-0 lg:inline-flex">
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary hidden h-9 whitespace-nowrap py-0 lg:inline-flex">
                {t('nav.signIn')}
              </Link>
              <Link href="/register" className="btn-primary hidden h-9 whitespace-nowrap py-0 lg:inline-flex">
                {t('nav.register')}
              </Link>
            </>
          )}

          {/* Narrower screens: one button that opens the same list. */}
          <button
            type="button"
            className="btn-secondary h-9 w-9 p-0 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setOpen((v) => !v)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-stone-200 bg-white px-4 py-3 lg:hidden" aria-label={t('nav.main')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={linkClass(l.href)}
                aria-current={pathname === l.href ? 'page' : undefined}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
            {user && profile && (
              <Link
                href="/bonus"
                className="inline-flex h-9 items-center rounded-full bg-amber-100 px-3 text-xs font-medium text-amber-900 sm:hidden"
              >
                {t('nav.pointsBadge', { count: profile.bonusPoints })}
              </Link>
            )}
            <ThemeSwitch />
            <LanguageSwitch className="sm:hidden" />
            {user ? (
              <>
                <span className="text-sm text-stone-600">
                  {user.fullName} · {roleLabel}
                </span>
                <button type="button" onClick={signOut} className="btn-secondary ml-auto h-9 py-0">
                  {t('nav.signOut')}
                </button>
              </>
            ) : (
              <div className="ml-auto flex gap-2">
                <Link href="/login" className="btn-secondary h-9 py-0">{t('nav.signIn')}</Link>
                <Link href="/register" className="btn-primary h-9 py-0">{t('nav.register')}</Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
