// DB health check — confirms Supabase connectivity and whether the schema/seed
// are in place. Safe to call anytime; returns no secrets and no patient data
// beyond counts. Useful right after running the migration/seed SQL.
//
// GET /api/health

import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export async function GET() {
  const db = getSupabaseServer();

  if (!db) {
    return NextResponse.json(
      {
        ok: false,
        supabase: 'not_configured',
        detail:
          'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and a key.',
      },
      { status: 200 },
    );
  }

  // Probe a few tables. If the migration has not been run, these error.
  const checks: Record<string, { ok: boolean; count?: number; error?: string }> =
    {};

  for (const table of ['patients', 'care_plans', 'plan_tasks', 'plan_rules']) {
    // A real (non-head) select surfaces "table not found" errors that a
    // head-only count can mask. Limit 1 keeps it cheap.
    const { data, error } = await db.from(table).select('id').limit(1);
    checks[table] = error
      ? { ok: false, error: error.message }
      : { ok: true, count: data?.length ?? 0 };
  }

  const schemaReady = Object.values(checks).every((c) => c.ok);
  const seeded = (checks.patients?.count ?? 0) > 0;

  return NextResponse.json({
    ok: schemaReady,
    supabase: 'connected',
    schemaReady,
    seeded,
    checks,
    hint: !schemaReady
      ? 'Run supabase/migrations/0001_init.sql in the Supabase SQL editor.'
      : !seeded
        ? 'Schema present but empty. Run supabase/seed/0001_demo_patient.sql.'
        : 'Schema and seed look good.',
  });
}
