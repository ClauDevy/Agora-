-- AlalAI seed data (run in Supabase SQL editor after 0001_init.sql).
--
-- DEMO PROTOCOL: fictional patient, placeholder clinical content. No real data.
-- Mirrors src/core/__fixtures__/demo-plan.ts. Idempotent: uses fixed UUIDs and
-- ON CONFLICT so re-running is safe.

-- Fixed demo UUIDs so the patient link is stable: /?patient=00000000-0000-0000-0000-000000000001
insert into patients (id, name, language)
values ('00000000-0000-0000-0000-000000000001', 'Lolo Ben', 'en')
on conflict (id) do update set name = excluded.name, language = excluded.language;

insert into care_plans (id, patient_id, status, no_response)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'active',
  '{"retries":2,"gap_minutes":5,"then":2}'::jsonb
)
on conflict (id) do update set status = excluded.status, no_response = excluded.no_response;

-- Tasks (confirm / coach / checkin) — DEMO PROTOCOL
insert into plan_tasks (plan_id, block_key, type, time, sort_order, config) values
  ('00000000-0000-0000-0000-0000000000a1', 't1', 'confirm', '08:00', 0,
   '{"text":"morning medicine"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a1', 't2', 'coach', '09:00', 1,
   '{"steps":["wash your hands","remove the old dressing","clean the wound","apply the new gauze"],"needs_helper":true}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a1', 't3', 'checkin', '09:20', 2,
   '{"questions":[{"key":"odor","ask":"Does the wound have a bad smell?","type":"yes_no"},{"key":"fever","ask":"Do you have a fever?","type":"yes_no"},{"key":"pain","ask":"How bad is the pain, from 0 to 10?","type":"number"}]}'::jsonb)
on conflict (plan_id, block_key) do update
  set type = excluded.type, time = excluded.time,
      sort_order = excluded.sort_order, config = excluded.config;

-- Rules — DEMO PROTOCOL
--   odor == yes                   -> level 2
--   fever == yes AND odor == yes  -> level 3
--   pain >= 8                     -> level 3
-- Clear existing rules for this plan first (rules have no natural key), then insert.
delete from plan_rules where plan_id = '00000000-0000-0000-0000-0000000000a1';
insert into plan_rules (plan_id, conditions, then_level, sort_order) values
  ('00000000-0000-0000-0000-0000000000a1',
   '[{"key":"odor","op":"==","value":"yes"}]'::jsonb, 2, 0),
  ('00000000-0000-0000-0000-0000000000a1',
   '[{"key":"fever","op":"==","value":"yes"},{"key":"odor","op":"==","value":"yes"}]'::jsonb, 3, 1),
  ('00000000-0000-0000-0000-0000000000a1',
   '[{"key":"pain","op":">=","value":8}]'::jsonb, 3, 2);

-- Contacts (fictional) — DEMO PROTOCOL
insert into contacts (patient_id, name, channel, destination) values
  ('00000000-0000-0000-0000-000000000001', 'Ana (daughter)', 'simulated', 'demo-ana'),
  ('00000000-0000-0000-0000-000000000001', 'Barangay Health Worker', 'simulated', 'demo-bhw')
on conflict do nothing;
