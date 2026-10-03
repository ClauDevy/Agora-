-- Descriptive (free-text) warning signs the professional writes in plain words.
-- The agent reads/watches for these and flags them if the patient reports them.
-- These are SEPARATE from the measurable plan_rules used by the deterministic
-- escalation engine. DEMO data only.

alter table care_plans
  add column if not exists descriptive_warnings text;
