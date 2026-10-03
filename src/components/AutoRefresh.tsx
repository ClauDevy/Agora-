'use client';

// Periodically refreshes the current route's server data so the professional's
// logs update live without a manual reload.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
