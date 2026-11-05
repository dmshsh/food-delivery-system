'use client';

import { useMeQuery } from '@/store/api';

/** Who is signed in? `user` is null for guests (the /auth/me request answers 401). */
export function useSession() {
  const query = useMeQuery();
  const user = query.isError ? null : (query.data?.user ?? null);
  return { user, profile: query.isError ? null : (query.data?.profile ?? null), loading: query.isLoading };
}
