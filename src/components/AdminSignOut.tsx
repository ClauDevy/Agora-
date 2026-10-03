'use client';

import { useRouter } from 'next/navigation';

export function AdminSignOut() {
  const router = useRouter();
  async function signOut() {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => {});
    router.push('/admin/login');
    router.refresh();
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
