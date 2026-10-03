-- Add illnesses/diseases to patients (professional-entered context the agent
-- may reference when answering questions). Free text, DEMO data only.

alter table patients
  add column if not exists illnesses text;
