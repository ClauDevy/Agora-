// Patient-side reminder support (used by the open voice session, not admin).
//   GET  ?patient=<id>  -> { completed: ["t1", ...] }  today's done block_keys
//   POST { patient_id, block_key, kind:'no_response'|'late', session_id? }
//        -> logs a no-response/late marker for the professional's logs.
//
// Authorized loosely for the demo (patient sessions have no login). Returns only
// the patient's own completion keys, no other data.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

function manilaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  const patientId = request.nextUrl.searchParams.get('patient');
  const db = getSupabaseServer();
  if (!db || !patientId) return NextResponse.json({ completed: [] });

  const { data } = await db
    .from('task_completions')
    .select('block_key, late')
    .eq('patient_id', patientId)
    .eq('done_date', manilaDate());

  return NextResponse.json({
    completed: (data ?? []).map((r: { block_key: string }) => r.block_key),
    late: (data ?? [])
      .filter((r: { late?: boolean }) => r.late)
      .map((r: { block_key: string }) => r.block_key),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    patient_id?: string;
    plan_id?: string;
    session_id?: string;
    block_key?: string;
    kind?: 'no_response' | 'late';
  };
  const db = getSupabaseServer();
  if (!db || !body.patient_id || !body.block_key || !body.kind) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Record a marker row in task_completions: for 'late', mark done+late; for
  // 'no_response', record a non-done marker so logs can show "didn't respond".
  await db.from('task_completions').upsert(
    {
      patient_id: body.patient_id,
      plan_id: body.plan_id ?? null,
      session_id: body.session_id ?? null,
      block_key: body.block_key,
      done_date: manilaDate(),
      done_at: body.kind === 'late' ? new Date().toISOString() : null,
      late: body.kind === 'late',
      no_response: body.kind === 'no_response',
    },
    { onConflict: 'patient_id,block_key,done_date' },
  );

  return NextResponse.json({ ok: true });
}
