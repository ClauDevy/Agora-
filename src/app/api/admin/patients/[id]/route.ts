// Per-patient admin API: GET loads full editable data; PUT updates patient +
// replaces plan contacts/tasks/rules. Admin-guarded, zod-validated.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/admin-auth';
import { getPatientForEdit, updatePatientWithPlan } from '@/lib/admin-data';

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

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
      ctx.addIssue({ code: 'custom', message: 'reminder task needs text' });
    if (t.type === 'coach' && !(t.steps && t.steps.length))
      ctx.addIssue({ code: 'custom', message: 'instructional task needs steps' });
    if (t.type === 'checkin' && !(t.questions && t.questions.length))
      ctx.addIssue({ code: 'custom', message: 'check-in needs questions' });
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
  illnesses: z.string().optional(),
  general_instructions: z.string().optional(),
  hospital_name: z.string().optional(),
  hospital_phone: z.string().optional(),
  emergency_number: z.string().optional(),
  contacts: z.array(contactSchema).default([]),
  tasks: z.array(taskSchema).min(1, 'add at least one care-plan task'),
  rules: z.array(ruleSchema).default([]),
  descriptive_warnings: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const patient = await getPatientForEdit(id);
  if (!patient) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ patient });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = patientSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const ok = await updatePatientWithPlan(id, parsed.data);
  if (!ok) {
    return NextResponse.json(
      { error: 'Failed to update patient' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
