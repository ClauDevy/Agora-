// Admin patients API. GET lists patients; POST creates a patient + plan.
// Admin-guarded. Inputs validated with zod (AGENTS.md section 12).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/admin-auth';
import { createPatientWithPlan, listPatients } from '@/lib/admin-data';

const contactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  phone: z.string().min(1),
  priority: z.number().int().min(1).optional(),
});

const questionSchema = z.object({
  key: z.string().min(1),
  ask: z.string().min(1),
  type: z.enum(['yes_no', 'number']),
});

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const taskSchema = z
  .object({
    type: z.enum(['confirm', 'coach', 'checkin']),
    time: z.string().regex(timeRe, 'time must be HH:MM'),
    text: z.string().optional(),
    instructions: z.string().optional(),
    precautions: z.string().optional(),
    steps: z.array(z.string().min(1)).optional(),
    needs_helper: z.boolean().optional(),
    questions: z.array(questionSchema).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.type === 'confirm' && !t.text?.trim())
      ctx.addIssue({ code: 'custom', message: 'confirm task needs text' });
    if (t.type === 'coach' && !(t.steps && t.steps.length))
      ctx.addIssue({ code: 'custom', message: 'coach task needs steps' });
    if (t.type === 'checkin' && !(t.questions && t.questions.length))
      ctx.addIssue({ code: 'custom', message: 'checkin task needs questions' });
  });

const ruleSchema = z.object({
  conditions: z
    .array(
      z.object({
        key: z.string().min(1),
        op: z.enum(['==', '>=', '<=', '>', '<']),
        value: z.union([z.string(), z.number()]),
      }),
    )
    .min(1),
  then_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  label: z.string().optional(),
  patient_message: z.string().optional(),
});

const patientSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  language: z.string().optional(),
  general_instructions: z.string().optional(),
  hospital_name: z.string().optional(),
  hospital_phone: z.string().optional(),
  emergency_number: z.string().optional(),
  contacts: z.array(contactSchema).default([]),
  tasks: z.array(taskSchema).min(1, 'add at least one care-plan task'),
  rules: z.array(ruleSchema).default([]),
  no_response: z
    .object({
      retries: z.number().int().min(0),
      gap_minutes: z.number().positive(),
      then: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
    .optional(),
});

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const patients = await listPatients();
  return NextResponse.json({ patients });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patientSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createPatientWithPlan(parsed.data);
  if (!result) {
    return NextResponse.json(
      { error: 'Failed to create patient (database unavailable?)' },
      { status: 500 },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
