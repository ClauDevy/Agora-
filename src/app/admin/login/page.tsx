'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Login failed.');
        return;
      }
      router.push('/clinician');
      router.refresh();
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="animate-fade-up w-full max-w-sm rounded-[20px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/80 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur"
      >
        <h1 className="text-2xl font-bold text-foreground">Professional sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the shared password to manage patients and care plans.
        </p>

        <label className="mt-6 block text-sm font-medium text-foreground">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-2 w-full rounded-lg border border-[color:var(--card-border)] bg-background/60 px-3 py-2 text-foreground outline-none focus:border-[color:var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/40"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm text-[color:var(--destructive)]" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 w-full rounded-lg bg-[color:var(--primary)] px-4 py-2.5 font-semibold text-[color:var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-xs text-muted-foreground">
          Hackathon demo: single shared password. Real per-user accounts are
          roadmap.
        </p>
      </form>
    </main>
  );
}
