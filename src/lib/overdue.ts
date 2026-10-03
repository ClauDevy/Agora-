// Overdue / missed-task detection (deterministic, no cron — AGENTS.md §10).
//
// For each active patient, finds care-plan tasks whose scheduled time has
// already passed today but for which no session recorded activity. This powers
// the "missed medicine / passed deadline" warning on the professional side.
//
// SAFETY: the message is honest — "no confirmation recorded", NOT "patient is
// in danger". Timezone defaults to Asia/Manila per the spec.

import { getSupabaseServer } from './supabase';

const TZ = 'Asia/Manila';

export interface OverdueItem {
  patientId: string;
  patientName: string;
  taskLabel: string;
  taskType: string;
  time: string; // HH:MM
  minutesLate: number;
}

/** Current HH:MM in the patient timezone, as minutes since midnight. */
function nowMinutesInTz(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function startOfTodayIsoInTz(): string {
  // Midnight today in the patient timezone, as an ISO instant (approx; good
  // enough for a demo "today" window).
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${dateStr}T00:00:00+08:00`).toISOString();
}

function taskLabel(type: string, config: Record<string, unknown>): string {
  if (type === 'confirm') return String(config.text ?? 'Reminder');
  if (type === 'coach') return 'Instructional task';
  return 'Check-in';
}

/**
 * Compute overdue tasks across all active patients. A task is overdue when:
 *   - its scheduled time (today) is in the past by > graceMinutes, and
 *   - no session for that patient started today (i.e. no activity recorded).
 * This is intentionally simple and honest for the MVP.
 */
export async function getOverdueItems(
  graceMinutes = 15,
): Promise<OverdueItem[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  const nowMin = nowMinutesInTz();
  const todayStart = startOfTodayIsoInTz();

  const { data: patients } = await db
    .from('patients')
    .select('id, name');
  if (!patients) return [];

  const overdue: OverdueItem[] = [];

  for (const p of patients as { id: string; name: string }[]) {
    const { data: plan } = await db
      .from('care_plans')
      .select('id')
      .eq('patient_id', p.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!plan?.id) continue;

    const { data: tasks } = await db
      .from('plan_tasks')
      .select('type, time, config')
      .eq('plan_id', plan.id);
    if (!tasks || tasks.length === 0) continue;

    // Did the patient have ANY session today? (activity proxy for the demo)
    const { count: sessionsToday } = await db
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', p.id)
      .gte('started_at', todayStart);

    if ((sessionsToday ?? 0) > 0) continue; // had activity today -> not flagged

    for (const t of tasks as {
      type: string;
      time: string;
      config: Record<string, unknown>;
    }[]) {
      const taskMin = hhmmToMinutes(t.time);
      const late = nowMin - taskMin;
      if (late > graceMinutes) {
        overdue.push({
          patientId: p.id,
          patientName: p.name,
          taskLabel: taskLabel(t.type, t.config),
          taskType: t.type,
          time: t.time,
          minutesLate: late,
        });
      }
    }
  }

  // Most overdue first.
  overdue.sort((a, b) => b.minutesLate - a.minutesLate);
  return overdue;
}
