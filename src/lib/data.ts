// Data-access layer: maps Supabase rows <-> core domain types.
//
// The rules engine and validators (src/core) remain the source of truth for
// shapes; this module only reads/writes rows and reshapes them. All functions
// are server-side (they use the server Supabase client).

import { getSupabaseServer } from './supabase';
import type {
  AnswerType,
  AnswerValue,
  Block,
  CarePlan,
  CheckinQuestion,
  Decision,
  NoResponseConfig,
  PatientInfo,
  Rule,
} from '@/core/types';
import { UNCLEAR } from '@/core/types';

export interface PatientRecord {
  id: string;
  name: string;
  language: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Fetch a patient by id. Returns null if not found or DB unavailable. */
export async function getPatient(
  patientId: string,
): Promise<PatientRecord | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const { data, error } = await db
    .from('patients')
    .select('id, name, language')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, name: data.name, language: data.language };
}

/** Resolve a patient link token to the patient. Null if unknown. */
export async function getPatientByToken(
  token: string,
): Promise<PatientRecord | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const { data, error } = await db
    .from('patients')
    .select('id, name, language')
    .eq('patient_token', token)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, name: data.name, language: data.language };
}

type TaskRow = {
  block_key: string;
  type: 'confirm' | 'coach' | 'checkin';
  time: string;
  sort_order: number;
  config: Record<string, unknown>;
};

type RuleRow = {
  conditions: Rule['conditions'];
  then_level: 1 | 2 | 3;
  sort_order: number;
};

function rowToBlock(row: TaskRow): Block {
  const base = { id: row.block_key, time: row.time };
  switch (row.type) {
    case 'confirm':
      return { ...base, type: 'confirm', text: String(row.config.text ?? '') };
    case 'coach':
      return {
        ...base,
        type: 'coach',
        steps: Array.isArray(row.config.steps)
          ? (row.config.steps as string[])
          : [],
        needs_helper: Boolean(row.config.needs_helper),
      };
    case 'checkin':
      return {
        ...base,
        type: 'checkin',
        questions: Array.isArray(row.config.questions)
          ? (row.config.questions as CheckinQuestion[])
          : [],
      };
  }
}

/**
 * Load a patient's ACTIVE care plan, reshaped into the core CarePlan type.
 * Returns null if the patient has no active plan or the DB is unavailable.
 */
export async function getActivePlan(
  patientId: string,
): Promise<{ planId: string; plan: CarePlan } | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const patient = await getPatient(patientId);
  if (!patient) return null;

  const { data: planRow, error: planErr } = await db
    .from('care_plans')
    .select('id, no_response')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planErr || !planRow) return null;

  const [{ data: taskRows }, { data: ruleRows }, { data: contactRows }] =
    await Promise.all([
      db
        .from('plan_tasks')
        .select('block_key, type, time, sort_order, config')
        .eq('plan_id', planRow.id)
        .order('sort_order', { ascending: true }),
      db
        .from('plan_rules')
        .select('conditions, then_level, sort_order')
        .eq('plan_id', planRow.id)
        .order('sort_order', { ascending: true }),
      db.from('contacts').select('name').eq('patient_id', patientId),
    ]);

  const patientInfo: PatientInfo = {
    name: patient.name,
    language: patient.language,
    contacts: (contactRows ?? []).map((c: { name: string }) => c.name),
  };

  const tasks: Block[] = ((taskRows ?? []) as TaskRow[]).map(rowToBlock);
  const rules: Rule[] = ((ruleRows ?? []) as RuleRow[]).map((r) => ({
    conditions: r.conditions,
    then: r.then_level,
  }));
  const no_response = planRow.no_response as NoResponseConfig;

  const plan: CarePlan = { patient: patientInfo, tasks, rules, no_response };
  return { planId: planRow.id, plan };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Create a session row when a patient starts a voice call. Returns id or null. */
export async function createSession(params: {
  patientId?: string;
  planId?: string;
  channelName: string;
  agentId?: string;
}): Promise<string | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const { data, error } = await db
    .from('sessions')
    .insert({
      patient_id: params.patientId ?? null,
      plan_id: params.planId ?? null,
      channel_name: params.channelName,
      agent_id: params.agentId ?? null,
      status: 'running',
    })
    .select('id')
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

/** Record a validated answer for a session. */
export async function saveAnswer(params: {
  sessionId: string;
  questionKey: string;
  rawTranscript?: string;
  value: string;
  validationResult: 'valid' | 'unclear';
}): Promise<void> {
  const db = getSupabaseServer();
  if (!db) return;

  await db.from('answers').insert({
    session_id: params.sessionId,
    question_key: params.questionKey,
    raw_transcript: params.rawTranscript ?? null,
    value: params.value,
    validation_result: params.validationResult,
  });
}

/** Record a rules-engine decision (the audit log). */
export async function saveDecision(
  sessionId: string,
  decision: Decision,
): Promise<void> {
  const db = getSupabaseServer();
  if (!db) return;

  await db.from('decisions').insert({
    session_id: sessionId,
    level: decision.level,
    reasons: decision.reasons,
  });
}

/** Mark a session ended with a final status. */
export async function endSession(
  sessionId: string,
  status: 'completed' | 'no_response' | 'error' = 'completed',
): Promise<void> {
  const db = getSupabaseServer();
  if (!db) return;

  await db
    .from('sessions')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('id', sessionId);
}

/** The validated answers recorded so far for a session, as an Answers map. */
export async function getSessionAnswers(
  sessionId: string,
): Promise<Record<string, AnswerValue>> {
  const db = getSupabaseServer();
  if (!db) return {};

  const { data, error } = await db
    .from('answers')
    .select('question_key, value')
    .eq('session_id', sessionId);

  if (error || !data) return {};

  const answers: Record<string, AnswerValue> = {};
  for (const row of data as { question_key: string; value: string }[]) {
    answers[row.question_key] = coerceStoredValue(row.value);
  }
  return answers;
}

/** The rules for the plan attached to a session (for server-side evaluation). */
export async function getSessionRules(sessionId: string): Promise<Rule[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  const planId = await getSessionPlanId(sessionId);
  if (!planId) return [];

  const { data: ruleRows } = await db
    .from('plan_rules')
    .select('conditions, then_level, sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true });

  return ((ruleRows ?? []) as RuleRow[]).map((r) => ({
    conditions: r.conditions,
    then: r.then_level,
  }));
}

/** Resolve the plan id for a session (helper). */
async function getSessionPlanId(sessionId: string): Promise<string | null> {
  const db = getSupabaseServer();
  if (!db) return null;
  const { data } = await db
    .from('sessions')
    .select('plan_id')
    .eq('id', sessionId)
    .maybeSingle();
  return data?.plan_id ?? null;
}

export interface SessionQuestion {
  key: string;
  ask: string;
  type: AnswerType;
}

/**
 * The check-in questions for a session's plan: { key, ask, type }.
 * Used to map an agent's spoken question back to the field it belongs to.
 */
export async function getSessionQuestions(
  sessionId: string,
): Promise<SessionQuestion[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  const planId = await getSessionPlanId(sessionId);
  if (!planId) return [];

  const { data: taskRows } = await db
    .from('plan_tasks')
    .select('type, config')
    .eq('plan_id', planId)
    .eq('type', 'checkin');

  const questions: SessionQuestion[] = [];
  for (const row of (taskRows ?? []) as {
    type: string;
    config: Record<string, unknown>;
  }[]) {
    const qs = Array.isArray(row.config.questions)
      ? (row.config.questions as CheckinQuestion[])
      : [];
    for (const q of qs) {
      questions.push({ key: q.key, ask: q.ask, type: q.type });
    }
  }
  return questions;
}

// Answers are stored as text; turn them back into AnswerValue for the engine.
function coerceStoredValue(stored: string): AnswerValue {
  if (stored === 'yes' || stored === 'no' || stored === 'unclear') {
    return stored as AnswerValue;
  }
  const n = Number(stored);
  return Number.isFinite(n) ? n : (UNCLEAR as AnswerValue);
}

// ---------------------------------------------------------------------------
// Clinician logs reads
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  patientName: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  highestLevel: number; // max decision level, 1 if none
}

/** List recent sessions with their highest decision level, newest first. */
export async function getSessions(limit = 50): Promise<SessionSummary[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  const { data: sessionRows, error } = await db
    .from('sessions')
    .select('id, status, started_at, ended_at, patient_id')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error || !sessionRows) return [];

  // Resolve patient names and highest level per session.
  const summaries: SessionSummary[] = [];
  for (const s of sessionRows as {
    id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    patient_id: string | null;
  }[]) {
    let patientName: string | null = null;
    if (s.patient_id) {
      const p = await getPatient(s.patient_id);
      patientName = p?.name ?? null;
    }
    const { data: decisionRows } = await db
      .from('decisions')
      .select('level')
      .eq('session_id', s.id);
    const highestLevel = (decisionRows ?? []).reduce(
      (max: number, d: { level: number }) => Math.max(max, d.level),
      1,
    );
    summaries.push({
      id: s.id,
      patientName,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      highestLevel,
    });
  }
  return summaries;
}

export interface SessionDetail {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  answers: {
    questionKey: string;
    value: string;
    validationResult: string;
    rawTranscript: string | null;
    createdAt: string;
  }[];
  decisions: {
    level: number;
    reasons: { detail: string; source: string }[];
    createdAt: string;
  }[];
}

/** Full detail for one session: its answers and decisions. */
export async function getSessionDetail(
  sessionId: string,
): Promise<SessionDetail | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  const { data: s } = await db
    .from('sessions')
    .select('id, status, started_at, ended_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!s) return null;

  const [{ data: answerRows }, { data: decisionRows }] = await Promise.all([
    db
      .from('answers')
      .select('question_key, value, validation_result, raw_transcript, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    db
      .from('decisions')
      .select('level, reasons, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
  ]);

  return {
    id: s.id,
    status: s.status,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    answers: (answerRows ?? []).map(
      (a: {
        question_key: string;
        value: string;
        validation_result: string;
        raw_transcript: string | null;
        created_at: string;
      }) => ({
        questionKey: a.question_key,
        value: a.value,
        validationResult: a.validation_result,
        rawTranscript: a.raw_transcript,
        createdAt: a.created_at,
      }),
    ),
    decisions: (decisionRows ?? []).map(
      (d: {
        level: number;
        reasons: { detail: string; source: string }[];
        created_at: string;
      }) => ({
        level: d.level,
        reasons: Array.isArray(d.reasons) ? d.reasons : [],
        createdAt: d.created_at,
      }),
    ),
  };
}
