// Admin data-access: create/list patients and author their care plans.
// Writes to the SAME model the voice session + rules engine already read
// (patients, care_plans, plan_tasks, plan_rules, emergency_contacts), so what
// the clinician authors is exactly what the agent runs. Server-side only.

import { randomBytes } from 'node:crypto';
import { getSupabaseServer } from './supabase';
import type { AnswerType } from '@/core/types';

export interface NewContact {
  name: string;
  relationship?: string;
  phone: string;
  priority?: number;
}

export interface NewCheckinQuestion {
  key: string;
  ask: string;
  type: AnswerType;
}

export interface NewTask {
  type: 'confirm' | 'coach' | 'checkin';
  time: string; // HH:MM
  // confirm:
  text?: string;
  instructions?: string;
  precautions?: string;
  // coach:
  steps?: string[];
  needs_helper?: boolean;
  // checkin:
  questions?: NewCheckinQuestion[];
}

export interface NewRule {
  conditions: { key: string; op: string; value: string | number }[];
  then_level: 1 | 2 | 3;
  label?: string;
  patient_message?: string;
}

export interface NewPatientInput {
  name: string;
  address?: string;
  language?: string;
  illnesses?: string;
  general_instructions?: string;
  hospital_name?: string;
  hospital_phone?: string;
  emergency_number?: string;
  contacts: NewContact[];
  tasks: NewTask[];
  rules: NewRule[];
  descriptive_warnings?: string;
  no_response?: { retries: number; gap_minutes: number; then: 1 | 2 | 3 };
}

export interface PatientListItem {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  taskCount: number;
}

function generateToken(): string {
  // 48 hex chars — unguessable, URL-safe.
  return randomBytes(24).toString('hex');
}

// Local date (Asia/Manila) as YYYY-MM-DD — matches task_completions.done_date
// usage elsewhere (lib/data.ts, api/patient-status).
function manilaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** List all patients with their token and a task count. */
export async function listPatients(): Promise<PatientListItem[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  const { data: rows } = await db
    .from('patients')
    .select('id, name, patient_token, created_at')
    .order('created_at', { ascending: false });

  const items: PatientListItem[] = [];
  for (const p of (rows ?? []) as {
    id: string;
    name: string;
    patient_token: string;
    created_at: string;
  }[]) {
    const { data: planRow } = await db
      .from('care_plans')
      .select('id')
      .eq('patient_id', p.id)
      .eq('status', 'active')
      .maybeSingle();
    let taskCount = 0;
    if (planRow?.id) {
      const { count } = await db
        .from('plan_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('plan_id', planRow.id);
      taskCount = count ?? 0;
    }
    items.push({
      id: p.id,
      name: p.name,
      token: p.patient_token,
      createdAt: p.created_at,
      taskCount,
    });
  }
  return items;
}

function taskConfig(t: NewTask): Record<string, unknown> {
  switch (t.type) {
    case 'confirm':
      return {
        text: t.text ?? '',
        instructions: t.instructions ?? '',
        precautions: t.precautions ?? '',
      };
    case 'coach':
      return {
        steps: t.steps ?? [],
        needs_helper: !!t.needs_helper,
        instructions: t.instructions ?? '',
        precautions: t.precautions ?? '',
      };
    case 'checkin':
      return { questions: t.questions ?? [] };
  }
}

/**
 * Create a patient with an active care plan, contacts, tasks, and rules.
 * Returns the new patient id + token, or null on failure.
 */
export async function createPatientWithPlan(
  input: NewPatientInput,
): Promise<{ id: string; token: string } | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const token = generateToken();

  // 1. Patient
  const { data: patient, error: pErr } = await db
    .from('patients')
    .insert({
      name: input.name,
      address: input.address ?? null,
      language: input.language ?? 'en',
      illnesses: input.illnesses ?? null,
      general_instructions: input.general_instructions ?? null,
      hospital_name: input.hospital_name ?? null,
      hospital_phone: input.hospital_phone ?? null,
      emergency_number: input.emergency_number ?? '',
      patient_token: token,
    })
    .select('id')
    .single();
  if (pErr || !patient) {
    console.error('createPatient error:', pErr?.message);
    return null;
  }
  const patientId = patient.id as string;

  // 2. Active plan
  const { data: plan, error: planErr } = await db
    .from('care_plans')
    .insert({
      patient_id: patientId,
      status: 'active',
      no_response: input.no_response ?? {
        retries: 2,
        gap_minutes: 5,
        then: 2,
      },
      descriptive_warnings: input.descriptive_warnings ?? null,
    })
    .select('id')
    .single();
  if (planErr || !plan) {
    console.error('createPlan error:', planErr?.message);
    return null;
  }
  const planId = plan.id as string;

  // 3. Contacts
  if (input.contacts.length) {
    await db.from('emergency_contacts').insert(
      input.contacts.map((c) => ({
        patient_id: patientId,
        name: c.name,
        relationship: c.relationship ?? null,
        phone: c.phone,
        priority: c.priority ?? 1,
      })),
    );
  }

  // 4. Tasks
  if (input.tasks.length) {
    await db.from('plan_tasks').insert(
      input.tasks.map((t, i) => ({
        plan_id: planId,
        block_key: `t${i + 1}`,
        type: t.type,
        time: t.time,
        sort_order: i,
        config: taskConfig(t),
      })),
    );
  }

  // 5. Rules
  if (input.rules.length) {
    await db.from('plan_rules').insert(
      input.rules.map((r, i) => ({
        plan_id: planId,
        conditions: r.conditions,
        then_level: r.then_level,
        sort_order: i,
      })),
    );
  }

  return { id: patientId, token };
}

// ---------------------------------------------------------------------------
// Edit (load full + update)
// ---------------------------------------------------------------------------

export interface EditablePatient {
  id: string;
  name: string;
  address: string;
  language: string;
  illnesses: string;
  general_instructions: string;
  hospital_name: string;
  hospital_phone: string;
  emergency_number: string;
  descriptive_warnings: string;
  contacts: NewContact[];
  tasks: NewTask[];
  rules: NewRule[];
}

/** Load a patient's full editable data (patient + active plan + contacts). */
export async function getPatientForEdit(
  patientId: string,
): Promise<EditablePatient | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const { data: p } = await db
    .from('patients')
    .select(
      'id, name, address, language, illnesses, general_instructions, hospital_name, hospital_phone, emergency_number',
    )
    .eq('id', patientId)
    .maybeSingle();
  if (!p) return null;

  const { data: plan } = await db
    .from('care_plans')
    .select('id, descriptive_warnings')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .maybeSingle();

  const [{ data: contactRows }, taskRes, ruleRes] = await Promise.all([
    db
      .from('emergency_contacts')
      .select('name, relationship, phone, priority')
      .eq('patient_id', patientId)
      .order('priority', { ascending: true }),
    plan?.id
      ? db
          .from('plan_tasks')
          .select('type, time, config, sort_order')
          .eq('plan_id', plan.id)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    plan?.id
      ? db
          .from('plan_rules')
          .select('conditions, then_level, sort_order')
          .eq('plan_id', plan.id)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const tasks: NewTask[] = ((taskRes.data ?? []) as {
    type: 'confirm' | 'coach' | 'checkin';
    time: string;
    config: Record<string, unknown>;
  }[]).map((t) => ({
    type: t.type,
    time: t.time,
    text: String(t.config.text ?? '') || undefined,
    instructions: String(t.config.instructions ?? '') || undefined,
    precautions: String(t.config.precautions ?? '') || undefined,
    steps: Array.isArray(t.config.steps) ? (t.config.steps as string[]) : undefined,
    needs_helper: Boolean(t.config.needs_helper),
    questions: Array.isArray(t.config.questions)
      ? (t.config.questions as NewCheckinQuestion[])
      : undefined,
  }));

  const rules: NewRule[] = ((ruleRes.data ?? []) as {
    conditions: NewRule['conditions'];
    then_level: 1 | 2 | 3;
  }[]).map((r) => ({ conditions: r.conditions, then_level: r.then_level }));

  return {
    id: p.id,
    name: p.name,
    address: p.address ?? '',
    language: p.language ?? 'en',
    illnesses: p.illnesses ?? '',
    general_instructions: p.general_instructions ?? '',
    hospital_name: p.hospital_name ?? '',
    hospital_phone: p.hospital_phone ?? '',
    emergency_number: p.emergency_number ?? '',
    descriptive_warnings: plan?.descriptive_warnings ?? '',
    contacts: (contactRows ?? []) as NewContact[],
    tasks,
    rules,
  };
}

/**
 * Update a patient's details and REPLACE their active plan's contacts, tasks,
 * and rules with the provided set. Simple replace-all keeps the editor logic
 * predictable for the demo.
 */
export async function updatePatientWithPlan(
  patientId: string,
  input: NewPatientInput,
): Promise<boolean> {
  const db = getSupabaseServer();
  if (!db) return false;

  // 1. Update patient fields.
  const { error: pErr } = await db
    .from('patients')
    .update({
      name: input.name,
      address: input.address ?? null,
      language: input.language ?? 'en',
      illnesses: input.illnesses ?? null,
      general_instructions: input.general_instructions ?? null,
      hospital_name: input.hospital_name ?? null,
      hospital_phone: input.hospital_phone ?? null,
      emergency_number: input.emergency_number ?? '',
    })
    .eq('id', patientId);
  if (pErr) {
    console.error('updatePatient error:', pErr.message);
    return false;
  }

  // 2. Find (or create) the active plan.
  let planId: string | null = null;
  const { data: existingPlan } = await db
    .from('care_plans')
    .select('id')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingPlan?.id) {
    planId = existingPlan.id;
    await db
      .from('care_plans')
      .update({
        no_response: input.no_response ?? { retries: 2, gap_minutes: 5, then: 2 },
        descriptive_warnings: input.descriptive_warnings ?? null,
      })
      .eq('id', planId);
  } else {
    const { data: created } = await db
      .from('care_plans')
      .insert({
        patient_id: patientId,
        status: 'active',
        no_response: input.no_response ?? { retries: 2, gap_minutes: 5, then: 2 },
        descriptive_warnings: input.descriptive_warnings ?? null,
      })
      .select('id')
      .single();
    planId = created?.id ?? null;
  }
  if (!planId) return false;

  // 3. Replace contacts.
  await db.from('emergency_contacts').delete().eq('patient_id', patientId);
  if (input.contacts.length) {
    await db.from('emergency_contacts').insert(
      input.contacts.map((c, i) => ({
        patient_id: patientId,
        name: c.name,
        relationship: c.relationship ?? null,
        phone: c.phone,
        priority: c.priority ?? i + 1,
      })),
    );
  }

  // 4. Replace tasks. First, capture the OLD tasks so we can detect time
  // changes and reset today's completion for any task whose time moved —
  // otherwise a task marked "done" earlier today would never fire at its new
  // time. Block keys are positional (t1, t2, ...), so they stay stable across
  // the replace and line up with task_completions rows.
  const { data: oldTasks } = await db
    .from('plan_tasks')
    .select('block_key, time')
    .eq('plan_id', planId);
  const oldTimeByKey = new Map(
    (oldTasks ?? []).map((t: { block_key: string; time: string }) => [
      t.block_key,
      t.time,
    ]),
  );

  await db.from('plan_tasks').delete().eq('plan_id', planId);
  const newTasks = input.tasks.map((t, i) => ({
    plan_id: planId,
    block_key: `t${i + 1}`,
    type: t.type,
    time: t.time,
    sort_order: i,
    config: taskConfig(t),
  }));
  if (newTasks.length) {
    await db.from('plan_tasks').insert(newTasks);
  }

  // Reset today's completion for tasks whose time changed (or that no longer
  // exist at that key). done_date uses Asia/Manila to match the rest of the app.
  const changedKeys = newTasks
    .filter((t) => oldTimeByKey.get(t.block_key) !== t.time)
    .map((t) => t.block_key);
  // Also reset keys that were removed entirely (old key not in the new set).
  const newKeys = new Set(newTasks.map((t) => t.block_key));
  for (const [oldKey] of oldTimeByKey) {
    if (!newKeys.has(oldKey) && !changedKeys.includes(oldKey)) {
      changedKeys.push(oldKey);
    }
  }
  if (changedKeys.length) {
    await db
      .from('task_completions')
      .delete()
      .eq('patient_id', patientId)
      .eq('done_date', manilaDate())
      .in('block_key', changedKeys);
    console.log(
      `[reset] cleared today's completions for changed/removed tasks: ${changedKeys.join(', ')}`,
    );
  }

  // 5. Replace rules.
  await db.from('plan_rules').delete().eq('plan_id', planId);
  if (input.rules.length) {
    await db.from('plan_rules').insert(
      input.rules.map((r, i) => ({
        plan_id: planId,
        conditions: r.conditions,
        then_level: r.then_level,
        sort_order: i,
      })),
    );
  }

  return true;
}
