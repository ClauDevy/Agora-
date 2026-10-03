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
  general_instructions?: string;
  hospital_name?: string;
  hospital_phone?: string;
  emergency_number?: string;
  contacts: NewContact[];
  tasks: NewTask[];
  rules: NewRule[];
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
