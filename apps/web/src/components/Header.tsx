'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import LanguageSwitch from '@/i18n/LanguageSwitch';
import { useT } from '@/i18n/I18nProvider';
import { roleKey } from '@/lib/format';
import type { MessageKey } from '@/i18n/dictionaries';
import { api, useLogoutMutation } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
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
  const cartCount = useAppSelector((s) => Object.values(s.cart.quantities).reduce((a, b) => a + b, 0));

  // Moving to another page closes the panel; leaving it open over the new page
  // would hide the thing the person just asked for.
  useEffect(() => setOpen(false), [pathname]);

  const links: { href: string; label: string }[] = [{ href: '/', label: t('nav.menu') }];
  if (!user || user.role === 'CUSTOMER') {
    links.push({ href: '/checkout', label: cartCount ? `${t('nav.checkout')} (${cartCount})` : t('nav.checkout') });
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
    `rounded-md px-3 py-2 ${
      pathname === href ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-stone-700 hover:bg-stone-100'
    }`;

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-emerald-800">
          {t('nav.title')}
        </Link>

        {/* Wide screens: the links sit in the bar. */}
        <nav className="hidden flex-wrap gap-1 text-sm md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {user && profile && (
            <Link
              href="/bonus"
              className="hidden rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 sm:inline-block"
              title={t('nav.bonus')}
            >
              {profile.bonusPoints} pts
            </Link>
          )}
          <LanguageSwitch className="hidden sm:flex" />
          {user ? (
            <>
              <span className="hidden text-stone-600 lg:inline">
                {user.fullName} · {t(roleKey(user.role) as MessageKey)}
              </span>
              <button onClick={signOut} className="btn-secondary hidden md:inline-flex">
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary hidden md:inline-flex">
                {t('nav.signIn')}
              </Link>
              <Link href="/register" className="btn-primary hidden md:inline-flex">
                {t('nav.register')}
              </Link>
            </>
          )}

          {/* Narrow screens: one button that opens the same list. */}
          <button
            type="button"
            className="btn-secondary px-3 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" className="text-lg leading-none">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-stone-200 bg-white px-4 py-3 md:hidden" aria-label="Main">
          <div className="flex flex-col gap-1 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
            <LanguageSwitch />
            {user ? (
              <>
                <span className="text-sm text-stone-600">
                  {user.fullName} · {t(roleKey(user.role) as MessageKey)}
                </span>
                <button onClick={signOut} className="btn-secondary ml-auto">
                  {t('nav.signOut')}
                </button>
              </>
            ) : (
              <div className="ml-auto flex gap-2">
                <Link href="/login" className="btn-secondary">{t('nav.signIn')}</Link>
                <Link href="/register" className="btn-primary">{t('nav.register')}</Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
