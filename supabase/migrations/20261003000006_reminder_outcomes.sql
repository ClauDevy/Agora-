-- Reminder outcome flags on task_completions:
--   late        = task was confirmed done AFTER its scheduled time + grace
--   no_response = patient did not confirm after all reminder retries
-- done_at becomes nullable (a no_response row has no completion time).

alter table task_completions
  add column if not exists late boolean not null default false,
  add column if not exists no_response boolean not null default false;

alter table task_completions
  alter column done_at drop not null;
