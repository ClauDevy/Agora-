'use client';

// Periodically refreshes the current route's server data so the professional's
// logs update live — WITHOUT making the UI feel laggy.
//
// - Uses React startTransition so the refresh is non-blocking (interactions
//   stay responsive while new server data streams in).
// - Pauses while the tab is hidden (no pointless background fetches).
// - Refreshes once immediately when the tab becomes visible again.

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());

    const start = () => {
      if (timer.current) return;
      timer.current = setInterval(() => {
        if (document.visibilityState === 'visible') refresh();
      }, seconds * 1000);
    };
    const stop = () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh(); // catch up immediately
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [router, seconds, startTransition]);

  return null;
}
