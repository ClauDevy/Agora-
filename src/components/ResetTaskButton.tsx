'use client';

// Clinician control: reset a task's completion for today so it can fire / be
// confirmed again. Calls DELETE /api/patient-status, then refreshes the route.
// Shown on the logs feed next to tasks that already have an outcome recorded.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function ResetTaskButton({
  patientId,
  blockKey,
  label = 'Reset',
}: {
  patientId: string;
  blockKey: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function reset() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(
        `/api/patient-status?patient=${encodeURIComponent(
          patientId,
        )}&block=${encodeURIComponent(blockKey)}`,
        { method: 'DELETE' },
      );
      startTransition(() => router.refresh());
    } catch {
      /* non-fatal; the clinician can retry */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={busy}
      className="rounded border border-[color:var(--card-border)] px-2 py-0.5 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
      aria-label={`Reset ${blockKey} for today`}
      title="Clear today's log so this task can run again"
    >
      {busy ? '…' : label}
    </button>
  );
}
