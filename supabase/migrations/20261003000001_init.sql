-- AlalAI schema migration (run in Supabase SQL editor).
--
-- Maps to the TypeScript domain model in src/core/types.ts. jsonb columns hold
-- the structured shapes (rules conditions, no_response config, decision reasons)
-- so the deterministic rules engine stays the single source of truth for logic;
-- the DB only stores inputs and outputs, never decides levels.
--
-- SAFETY (AGENTS.md): no real patient data. Seed uses fictional people.
-- RLS is enabled on every table. The demo policies below are permissive for the
-- anon key so the hackathon demo works end to end. FOR PRODUCTION: replace the
-- "demo_*" policies with authenticated clinician / per-patient-token policies,
-- and write session/decision/alert rows only with the service-role key.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type block_type as enum ('confirm', 'coach', 'checkin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('running', 'completed', 'no_response', 'error');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Patients. language defaults to 'en' (English-first; the agent adapts).
create table if not exists patients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  language    text not null default 'en',
  created_at  timestamptz not null default now()
);

-- Care plans. One active plan per patient at a time (enforced in app logic).
-- no_response holds { retries, gap_minutes, then } (NoResponseConfig).
create table if not exists care_plans (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  status       plan_status not null default 'draft',
  no_response  jsonb not null default '{"retries":2,"gap_minutes":5,"then":2}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_care_plans_patient on care_plans(patient_id);

-- Plan tasks (the confirm/coach/checkin blocks). config holds the block-specific
-- fields: confirm -> {text}, coach -> {steps, needs_helper}, checkin -> {questions}.
create table if not exists plan_tasks (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references care_plans(id) on delete cascade,
  block_key   text not null,                 -- stable id used in logs (e.g. 't1')
  type        block_type not null,
  time        text not null,                 -- "HH:MM" 24h
  sort_order  int not null default 0,
  config      jsonb not null default '{}'::jsonb,
  unique (plan_id, block_key)
);
create index if not exists idx_plan_tasks_plan on plan_tasks(plan_id);

-- Escalation rules. conditions is an array of {key, op, value} (Condition[]).
create table if not exists plan_rules (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references care_plans(id) on delete cascade,
  conditions  jsonb not null,                -- Condition[]
  then_level  int not null check (then_level in (1,2,3)),
  sort_order  int not null default 0
);
create index if not exists idx_plan_rules_plan on plan_rules(plan_id);

-- Emergency contacts (fictional data only).
create table if not exists contacts (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  name         text not null,
  channel      text not null default 'simulated',  -- simulated | sms | telegram ...
  destination  text,                               -- fake number / handle
  created_at   timestamptz not null default now()
);
create index if not exists idx_contacts_patient on contacts(patient_id);

-- A voice session (one patient run through a plan).
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid references patients(id) on delete set null,
  plan_id       uuid references care_plans(id) on delete set null,
  channel_name  text,
  agent_id      text,
  status        session_status not null default 'running',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists idx_sessions_patient on sessions(patient_id);

-- Validated answers captured during a session (one row per question answered).
-- value stores the validated AnswerValue as text ('yes'/'no'/number/'unclear').
create table if not exists answers (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references sessions(id) on delete cascade,
  question_key       text not null,
  raw_transcript     text,
  value              text not null,          -- validated value or 'unclear'
  validation_result  text not null,          -- 'valid' | 'unclear'
  created_at         timestamptz not null default now()
);
create index if not exists idx_answers_session on answers(session_id);

-- Rules-engine decisions (the audit log). reasons is Reason[] from the engine.
create table if not exists decisions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  level       int not null check (level in (1,2,3)),
  reasons     jsonb not null default '[]'::jsonb,  -- Reason[]
  created_at  timestamptz not null default now()
);
create index if not exists idx_decisions_session on decisions(session_id);

-- Alerts sent (or simulated). Same log entry regardless of transport.
create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references sessions(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  level        int not null check (level in (1,2,3)),
  channel      text not null default 'simulated',
  status       text not null default 'logged',  -- logged | sent | failed
  message      text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_alerts_session on alerts(session_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Enable RLS on every table.
alter table patients    enable row level security;
alter table care_plans  enable row level security;
alter table plan_tasks  enable row level security;
alter table plan_rules  enable row level security;
alter table contacts    enable row level security;
alter table sessions    enable row level security;
alter table answers     enable row level security;
alter table decisions   enable row level security;
alter table alerts      enable row level security;

-- DEMO policies: allow the anon key full access so the hackathon demo works.
-- PRODUCTION: drop these and add authenticated/clinician + per-patient-token
-- policies, and perform writes with the service-role key only.
do $$
declare t text;
begin
  foreach t in array array[
    'patients','care_plans','plan_tasks','plan_rules','contacts',
    'sessions','answers','decisions','alerts'
  ] loop
    execute format('drop policy if exists demo_all on %I;', t);
    execute format(
      'create policy demo_all on %I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
