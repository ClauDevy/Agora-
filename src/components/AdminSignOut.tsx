'use client';

import { useRouter } from 'next/navigation';

export function AdminSignOut() {
  const router = useRouter();
  function signOut() {
    // Optimistic: go to the login screen immediately; clear the cookie in the
    // background and refresh once it's done so server state stays correct.
    router.push('/admin/login');
    void fetch('/api/admin/login', { method: 'DELETE' })
      .catch(() => {})
      .finally(() => router.refresh());
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-[color:var(--surface)] hover:text-foreground"
    >
      Sign out
    </button>
  );
}
