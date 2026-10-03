// Today's task status per patient — for the professional's logs feed.
// Lists each active patient's scheduled tasks for today with time, label, and
// whether it has been confirmed done (from task_completions). Honest, simple.

import { getSupabaseServer } from './supabase';

const TYPE_LABEL: Record<string, string> = {
  confirm: 'Reminder',
  coach: 'Instructional',
  checkin: 'Check-in',
};

function manilaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export interface TaskStatus {
  blockKey: string;
  time: string;
  type: string;
  typeLabel: string;
  label: string;
  done: boolean;
  doneAt: string | null;
}

export interface PatientTaskStatus {
  patientId: string;
  patientName: string;
  tasks: TaskStatus[];
}

function taskLabel(type: string, config: Record<string, unknown>): string {
  if (type === 'confirm') return String(config.text ?? 'Reminder');
  if (type === 'coach') return 'Instructional task';
  return 'Check-in';
}

export async function getTodaysTaskStatus(): Promise<PatientTaskStatus[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  const today = manilaDate();
  const { data: patients } = await db.from('patients').select('id, name');
  if (!patients) return [];

  const out: PatientTaskStatus[] = [];

  for (const p of patients as { id: string; name: string }[]) {
    const { data: plan } = await db
      .from('care_plans')
      .select('id')
      .eq('patient_id', p.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!plan?.id) continue;

    const [{ data: taskRows }, { data: completions }] = await Promise.all([
      db
        .from('plan_tasks')
        .select('block_key, type, time, config, sort_order')
        .eq('plan_id', plan.id)
        .order('sort_order', { ascending: true }),
      db
        .from('task_completions')
        .select('block_key, done_at')
        .eq('patient_id', p.id)
        .eq('done_date', today),
    ]);

    if (!taskRows || taskRows.length === 0) continue;

    const doneMap = new Map(
      (completions ?? []).map((c: { block_key: string; done_at: string }) => [
        c.block_key,
        c.done_at,
      ]),
    );

    const tasks: TaskStatus[] = (taskRows as {
      block_key: string;
      type: string;
      time: string;
      config: Record<string, unknown>;
    }[]).map((t) => ({
      blockKey: t.block_key,
      time: t.time,
      type: t.type,
      typeLabel: TYPE_LABEL[t.type] ?? t.type,
      label: taskLabel(t.type, t.config),
      done: doneMap.has(t.block_key),
      doneAt: doneMap.get(t.block_key) ?? null,
    }));

    out.push({ patientId: p.id, patientName: p.name, tasks });
  }

  return out;
}
