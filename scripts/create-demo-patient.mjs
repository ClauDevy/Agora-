// Create a FRESH demo patient for a live demo.
//
// Inserts a patient (with an unguessable patient_token), an active care plan,
// two fictional emergency contacts, a few schedule tasks, and escalation rules.
// One "confirm" task is timed ~2 minutes from now (Asia/Manila) so a reminder
// fires live while you have the patient link open — handy for the demo and for
// verifying the "said yes -> leaves Reminding phase" fix.
//
// DEMO PROTOCOL: fictional data only. Not medical advice.
//
// Run with:  node --env-file=.env.local scripts/create-demo-patient.mjs
//   optional: pass a name ->  node --env-file=.env.local scripts/create-demo-patient.mjs "Lola Rosa"

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    'Missing Supabase env. Need NEXT_PUBLIC_SUPABASE_URL and a key.',
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// 48 hex chars — matches src/lib/admin-data.ts generateToken().
const token = randomBytes(24).toString('hex');
const name = process.argv[2]?.trim() || 'Demo Lola (DEMO PROTOCOL)';

// Manila "now" + N minutes -> "HH:MM".
function manilaPlus(minutes) {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
  );
  now.setMinutes(now.getMinutes() + minutes);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function main() {
  // 1. Patient (with token)
  const { data: patient, error: pErr } = await db
    .from('patients')
    .insert({
      name,
      language: 'en',
      address: 'Sample St., Quezon City (demo)',
      general_instructions:
        'DEMO PROTOCOL — not medical advice. Drink water with medicines. Rest when tired.',
      hospital_name: 'Demo General Hospital',
      hospital_phone: '+63-2-0000-0000',
      emergency_number: '',
      patient_token: token,
    })
    .select('id')
    .single();
  if (pErr || !patient) throw new Error('patients: ' + (pErr?.message ?? '?'));
  const patientId = patient.id;

  // 2. Active plan
  const { data: plan, error: planErr } = await db
    .from('care_plans')
    .insert({
      patient_id: patientId,
      status: 'active',
      no_response: { retries: 2, gap_minutes: 5, then: 2 },
    })
    .select('id')
    .single();
  if (planErr || !plan) throw new Error('care_plans: ' + (planErr?.message ?? '?'));
  const planId = plan.id;

  // 3. Emergency contacts (fictional)
  const { error: cErr } = await db.from('emergency_contacts').insert([
    {
      patient_id: patientId,
      name: 'Ana',
      relationship: 'daughter',
      phone: '+63-917-000-0001',
      priority: 1,
    },
    {
      patient_id: patientId,
      name: 'Barangay Health Worker',
      relationship: 'BHW',
      phone: '+63-917-000-0002',
      priority: 2,
    },
  ]);
  if (cErr) throw new Error('emergency_contacts: ' + cErr.message);

  // 4. Tasks. One confirm task due ~2 min from now so a reminder fires live.
  const dueSoon = manilaPlus(2);
  const { error: tErr } = await db.from('plan_tasks').insert([
    {
      plan_id: planId,
      block_key: 't1',
      type: 'confirm',
      time: dueSoon,
      sort_order: 0,
      config: {
        text: 'take your morning medicine',
        instructions: 'Take 1 tablet with water after breakfast.',
        precautions: 'Do not take on an empty stomach.',
      },
    },
    {
      plan_id: planId,
      block_key: 't2',
      type: 'coach',
      time: manilaPlus(60),
      sort_order: 1,
      config: {
        steps: [
          'wash your hands',
          'remove the old dressing',
          'clean the wound gently',
          'apply the new gauze',
        ],
        needs_helper: true,
        instructions: 'Ask a helper if you cannot do it yourself.',
        precautions: 'Watch for swelling, bad smell, or fever.',
      },
    },
    {
      plan_id: planId,
      block_key: 't3',
      type: 'checkin',
      time: manilaPlus(90),
      sort_order: 2,
      config: {
        questions: [
          { key: 'odor', ask: 'Does the wound have a bad smell?', type: 'yes_no' },
          { key: 'fever', ask: 'Do you have a fever?', type: 'yes_no' },
          { key: 'pain', ask: 'How bad is the pain, from 0 to 10?', type: 'number' },
        ],
      },
    },
  ]);
  if (tErr) throw new Error('plan_tasks: ' + tErr.message);

  // 5. Escalation rules (deterministic levels: 2 = notify, 3 = hospital).
  const { error: rErr } = await db.from('plan_rules').insert([
    {
      plan_id: planId,
      conditions: [{ key: 'odor', op: '==', value: 'yes' }],
      then_level: 2,
      sort_order: 0,
    },
    {
      plan_id: planId,
      conditions: [
        { key: 'fever', op: '==', value: 'yes' },
        { key: 'odor', op: '==', value: 'yes' },
      ],
      then_level: 3,
      sort_order: 1,
    },
    {
      plan_id: planId,
      conditions: [{ key: 'pain', op: '>=', value: 8 }],
      then_level: 3,
      sort_order: 2,
    },
  ]);
  if (rErr) throw new Error('plan_rules: ' + rErr.message);

  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  console.log('DEMO_PATIENT_OK');
  console.log('  name      :', name);
  console.log('  patient_id:', patientId);
  console.log('  token     :', token);
  console.log('  link      :', `${base}/p/${token}`);
  console.log(
    `  reminder  : "take your morning medicine" at ${dueSoon} PH time (~2 min) — open the link and wait.`,
  );
}

main().catch((e) => {
  console.error('CREATE_DEMO_FAILED:', e.message);
  process.exit(1);
});
