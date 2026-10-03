-- Task completions: records that a care-plan task was confirmed done, with the
-- local date and the exact timestamp. One row per task per day (idempotent via
-- unique constraint). Powers "done for today" on the professional side and the
-- overdue check. DEMO data only.

create table if not exists task_completions (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references patients(id) on delete cascade,
  plan_id     uuid references care_plans(id) on delete set null,
  session_id  uuid references sessions(id) on delete set null,
  block_key   text not null,          -- which task (t1, t2, ...)
  done_date   date not null,          -- local date (Asia/Manila) it was done
  done_at     timestamptz not null default now(),
  unique (patient_id, block_key, done_date)
);
create index if not exists idx_task_completions_patient
  on task_completions(patient_id, done_date);

alter table task_completions enable row level security;
do $$ begin
  execute 'drop policy if exists demo_all on task_completions';
  execute 'create policy demo_all on task_completions for all to anon, authenticated using (true) with check (true)';
end $$;
