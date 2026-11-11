'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, useLogoutMutation } from '@/store/api';
import { ROLE_LABEL } from '@/lib/format';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useSession } from './useSession';

export default function Header() {
  const { user, profile } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const [logout] = useLogoutMutation();
  const cartCount = useAppSelector((s) => Object.values(s.cart.quantities).reduce((a, b) => a + b, 0));

  const links: { href: string; label: string }[] = [{ href: '/', label: 'Menu' }];
  if (!user || user.role === 'CUSTOMER') {
    links.push({ href: '/checkout', label: cartCount ? `Checkout (${cartCount})` : 'Checkout' });
  }
  if (user?.role === 'CUSTOMER') {
    links.push({ href: '/orders', label: 'My orders' });
    links.push({ href: '/bonus', label: 'Bonus points' });
  }
  if (user?.role === 'KITCHEN') links.push({ href: '/kitchen', label: 'Kitchen' });
  if (user?.role === 'ACCOUNTANT') links.push({ href: '/accounting', label: 'Accounting' });
  if (user?.role === 'ADMIN') links.push({ href: '/admin', label: 'Admin panel' });

  async function signOut() {
    await logout().unwrap().catch(() => undefined);
    dispatch(api.util.resetApiState()); // forget everything the previous user could see
    router.push('/');
  }

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-emerald-800">Food Delivery</Link>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 ${
                pathname === l.href ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              {profile && (
                <Link
                  href="/bonus"
                  className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
                  title="Your bonus points"
                >
                  {profile.bonusPoints} pts
                </Link>
              )}
              <span className="text-stone-600">
                {user.fullName} · {ROLE_LABEL[user.role] ?? user.role.toLowerCase()}
              </span>
              <button onClick={signOut} className="btn-secondary">Sign out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">Sign in</Link>
              <Link href="/register" className="btn-primary">Register</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
