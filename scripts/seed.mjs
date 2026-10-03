// One-off seed runner: inserts the DEMO PROTOCOL demo patient + plan into
// Supabase using the same env the app uses. Idempotent (upserts by fixed id).
// Run with:  node --env-file=.env.local scripts/seed.mjs
//
// DEMO PROTOCOL: fictional data only. Mirrors supabase/seed/0001_demo_patient.sql.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase env. Need NEXT_PUBLIC_SUPABASE_URL and a key.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const PATIENT_ID = '00000000-0000-0000-0000-000000000001';
const PLAN_ID = '00000000-0000-0000-0000-0000000000a1';

async function main() {
  // Patient
  let r = await db
    .from('patients')
    .upsert({ id: PATIENT_ID, name: 'Lolo Ben', language: 'en' });
  if (r.error) throw new Error('patients: ' + r.error.message);

  // Plan
  r = await db.from('care_plans').upsert({
    id: PLAN_ID,
    patient_id: PATIENT_ID,
    status: 'active',
    no_response: { retries: 2, gap_minutes: 5, then: 2 },
  });
  if (r.error) throw new Error('care_plans: ' + r.error.message);

  // Tasks (upsert by (plan_id, block_key))
  r = await db.from('plan_tasks').upsert(
    [
      {
        plan_id: PLAN_ID,
        block_key: 't1',
        type: 'confirm',
        time: '08:00',
        sort_order: 0,
        config: { text: 'morning medicine' },
      },
      {
        plan_id: PLAN_ID,
        block_key: 't2',
        type: 'coach',
        time: '09:00',
        sort_order: 1,
        config: {
          steps: [
            'wash your hands',
            'remove the old dressing',
            'clean the wound',
            'apply the new gauze',
          ],
          needs_helper: true,
        },
      },
      {
        plan_id: PLAN_ID,
        block_key: 't3',
        type: 'checkin',
        time: '09:20',
        sort_order: 2,
        config: {
          questions: [
            { key: 'odor', ask: 'Does the wound have a bad smell?', type: 'yes_no' },
            { key: 'fever', ask: 'Do you have a fever?', type: 'yes_no' },
            { key: 'pain', ask: 'How bad is the pain, from 0 to 10?', type: 'number' },
          ],
        },
      },
    ],
    { onConflict: 'plan_id,block_key' },
  );
  if (r.error) throw new Error('plan_tasks: ' + r.error.message);

  // Rules — clear then insert (no natural key)
  r = await db.from('plan_rules').delete().eq('plan_id', PLAN_ID);
  if (r.error) throw new Error('plan_rules delete: ' + r.error.message);
  r = await db.from('plan_rules').insert([
    {
      plan_id: PLAN_ID,
      conditions: [{ key: 'odor', op: '==', value: 'yes' }],
      then_level: 2,
      sort_order: 0,
    },
    {
      plan_id: PLAN_ID,
      conditions: [
        { key: 'fever', op: '==', value: 'yes' },
        { key: 'odor', op: '==', value: 'yes' },
      ],
      then_level: 3,
      sort_order: 1,
    },
    {
      plan_id: PLAN_ID,
      conditions: [{ key: 'pain', op: '>=', value: 8 }],
      then_level: 3,
      sort_order: 2,
    },
  ]);
  if (r.error) throw new Error('plan_rules insert: ' + r.error.message);

  // Contacts (fictional) — insert only if none exist for this patient
  const existing = await db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', PATIENT_ID);
  if ((existing.count ?? 0) === 0) {
    r = await db.from('contacts').insert([
      { patient_id: PATIENT_ID, name: 'Ana (daughter)', channel: 'simulated', destination: 'demo-ana' },
      { patient_id: PATIENT_ID, name: 'Barangay Health Worker', channel: 'simulated', destination: 'demo-bhw' },
    ]);
    if (r.error) throw new Error('contacts: ' + r.error.message);
  }

  console.log('SEED_OK: demo patient Lolo Ben seeded.');
}

main().catch((e) => {
  console.error('SEED_FAILED:', e.message);
  process.exit(1);
});
