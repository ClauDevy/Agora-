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
    kind?: 'no_response' | 'late' | 'done';
  };
  const db = getSupabaseServer();
  if (!db || !body.patient_id || !body.block_key || !body.kind) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Record a marker row in task_completions:
  //   done        -> done_at set, late/no_response false
  //   late        -> done_at set, late true
  //   no_response -> done_at null, no_response true
  await db.from('task_completions').upsert(
    {
      patient_id: body.patient_id,
      plan_id: body.plan_id ?? null,
      session_id: body.session_id ?? null,
      block_key: body.block_key,
      done_date: manilaDate(),
      done_at: body.kind === 'no_response' ? null : new Date().toISOString(),
      late: body.kind === 'late',
      no_response: body.kind === 'no_response',
    },
    { onConflict: 'patient_id,block_key,done_date' },
  );

  return NextResponse.json({ ok: true });
}

// Reset today's completion log so a task can fire / be confirmed again.
//   DELETE ?patient=<id>              -> clears ALL of today's completions
//   DELETE ?patient=<id>&block=<key>  -> clears only that task's completion
// Used by the clinician "Reset" button and after a task's time changes.
export async function DELETE(request: NextRequest) {
  const patientId = request.nextUrl.searchParams.get('patient');
  const blockKey = request.nextUrl.searchParams.get('block');
  const db = getSupabaseServer();
  if (!db || !patientId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let q = db
    .from('task_completions')
    .delete()
    .eq('patient_id', patientId)
    .eq('done_date', manilaDate());
  if (blockKey) q = q.eq('block_key', blockKey);

  const { error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reset: blockKey ?? 'all' });
}
