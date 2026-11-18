'use client';

import Link from 'next/link';
import { useT } from '@/i18n/I18nProvider';
import { roleKey } from '@/lib/format';
import type { Role } from '@/lib/types';
import { useSession } from './useSession';

/** Shows its children only to the listed roles. (The server enforces the same rules; this is just the friendly part.) */
export default function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useSession();
  const t = useT();

  if (loading) return <p className="text-stone-500">{t('common.loading')}</p>;
  if (!user) {
    return (
      <div className="card max-w-md">
        <p className="mb-3">{t('access.signInFirst')}</p>
        <Link href="/login" className="btn-primary">{t('nav.signIn')}</Link>
      </div>
    );
  }
  if (!roles.includes(user.role)) {
    return (
      <div className="card max-w-md" role="alert">
        {t('access.roleDenied', { role: t(roleKey(user.role)) })}
      </div>
    );
  }
  return <>{children}</>;
}
