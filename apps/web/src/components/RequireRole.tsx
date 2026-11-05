'use client';

import Link from 'next/link';
import type { Role } from '@/lib/types';
import { useSession } from './useSession';

/** Shows its children only to the listed roles. (The server enforces the same rules; this is just the friendly part.) */
export default function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!user) {
    return (
      <div className="card max-w-md">
        <p className="mb-3">Please sign in to continue.</p>
        <Link href="/login" className="btn-primary">Sign in</Link>
      </div>
    );
  }
  if (!roles.includes(user.role)) {
    return (
      <div className="card max-w-md" role="alert">
        Your role ({user.role.toLowerCase()}) cannot open this page.
      </div>
    );
  }
  return <>{children}</>;
}
