-- Expand schema for the admin authoring flow (AGENTS.md section 6).
-- Adds patient token + details, hospital, emergency number, heartbeat, and the
-- emergency_contacts table. Keeps the existing care_plans/plan_tasks/plan_rules
-- model used by the voice session and rules engine.

-- --- patients: new columns ---
alter table patients
  add column if not exists address              text,
  add column if not exists general_instructions text,
  add column if not exists hospital_name        text,
  add column if not exists hospital_phone        text,
  add column if not exists emergency_number     text default '',
  add column if not exists patient_token        text,
  add column if not exists last_heartbeat_at    timestamptz;

-- Backfill tokens for any existing patients, then enforce uniqueness.
update patients
  set patient_token = replace(gen_random_uuid()::text, '-', '') ||
                      replace(gen_random_uuid()::text, '-', '')
  where patient_token is null;

create unique index if not exists idx_patients_token on patients(patient_token);

-- --- emergency contacts ---
create table if not exists emergency_contacts (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references patients(id) on delete cascade,
  name           text not null,
  relationship   text,
  phone          text not null,
  priority       int not null default 1,     -- 1 = call first
  telegram_chat_id text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_emergency_contacts_patient
  on emergency_contacts(patient_id);

alter table emergency_contacts enable row level security;
do $$ begin
  execute 'drop policy if exists demo_all on emergency_contacts';
  execute 'create policy demo_all on emergency_contacts for all to anon, authenticated using (true) with check (true)';
end $$;
