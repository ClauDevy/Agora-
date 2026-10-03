import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const now = new Date(
  new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
);
now.setMinutes(now.getMinutes() + 2);
const hh = String(now.getHours()).padStart(2, '0');
const mm = String(now.getMinutes()).padStart(2, '0');
const t = `${hh}:${mm}`;
const planId = '00000000-0000-0000-0000-0000000000a1';

await db.from('plan_tasks').upsert(
  {
    plan_id: planId,
    block_key: 'ttest',
    type: 'confirm',
    time: t,
    sort_order: 9,
    config: { text: 'take your test medicine' },
  },
  { onConflict: 'plan_id,block_key' },
);

console.log(
  `Added demo task "take your test medicine" at ${t} PH time. Open the patient link now and wait ~2 min.`,
);
