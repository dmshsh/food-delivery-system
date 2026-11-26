'use client';

import { SkeletonCards } from '@/components/Skeleton';

/** Shown by Next.js while a route segment is still being fetched. */
export default function RouteLoading() {
  return <SkeletonCards count={3} />;
}
