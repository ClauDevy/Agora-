// Clinician dashboard (admin side) — authoring/review surface. NO voice here.
// This is the opposite surface from the patient client: it shows the care plan,
// its rules, and validation status. It is a starting scaffold; plan editing,
// contacts, logs, and persistence are still to be built.
//
// SAFETY (AGENTS.md): all clinical content shown is DEMO PROTOCOL placeholder
// data, and plan validity is checked by the deterministic validator.

import Link from "next/link";
import { demoPlan } from "@/core/__fixtures__/demo-plan";
import { getActivePlan } from "@/lib/data";
import { validatePlan } from "@/core/validate-plan";
import type { Block, CarePlan, CheckinBlock, CoachBlock, ConfirmBlock } from "@/core/types";

export const metadata = {
  title: "Clinician Dashboard — AlalAI",
};

// The seeded demo patient (see supabase/seed/0001_demo_patient.sql).
const DEMO_PATIENT_ID = "00000000-0000-0000-0000-000000000001";

function blockSummary(block: Block): string {
  switch (block.type) {
    case "confirm":
      return (block as ConfirmBlock).text;
    case "coach":
      return `${(block as CoachBlock).steps.length} steps`;
    case "checkin":
      return `${(block as CheckinBlock).questions.length} questions`;
  }
}

export default async function ClinicianDashboard() {
  // Load the real plan from Supabase; fall back to the fixture if the DB is not
  // set up yet (so the dashboard always renders during early setup).
  const fromDb = await getActivePlan(DEMO_PATIENT_ID);
  const plan: CarePlan = fromDb?.plan ?? demoPlan;
  const source = fromDb ? "Supabase" : "local fixture (DB not connected yet)";
  const { valid, errors } = validatePlan(plan);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Clinician Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authoring and review. No voice here — this is the doctor&apos;s tool.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/clinician/logs"
            className="rounded-lg border border-[color:var(--card-border)] px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Session logs
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-[color:var(--card-border)] px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Patient view →
          </Link>
        </div>
      </header>

      {/* DEMO PROTOCOL banner — required labeling. */}
      <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <strong>DEMO PROTOCOL.</strong> All clinical content below is placeholder
        data for demonstration only. Not written or approved by a clinician.
        <span className="mt-1 block text-xs text-amber-300/70">
          Data source: {source}
        </span>
      </div>

      {/* Patient card */}
      <section className="mb-6 rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-6">
        <h2 className="text-lg font-semibold text-foreground">Patient</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="text-foreground">{plan.patient.name}</dd>
          <dt className="text-muted-foreground">Language</dt>
          <dd className="text-foreground">{plan.patient.language}</dd>
          <dt className="text-muted-foreground">Contacts</dt>
          <dd className="text-foreground">
            {plan.patient.contacts.join(", ")}
          </dd>
        </dl>
      </section>

      {/* Tasks */}
      <section className="mb-6 rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-6">
        <h2 className="text-lg font-semibold text-foreground">Care plan tasks</h2>
        <ul className="mt-3 divide-y divide-[color:var(--card-border)]">
          {plan.tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between py-3 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="rounded bg-[color:var(--primary)]/15 px-2 py-0.5 font-mono text-xs text-[color:var(--primary)]">
                  {task.type}
                </span>
                <span className="text-foreground">{blockSummary(task)}</span>
              </span>
              <span className="font-mono text-muted-foreground">
                {task.time}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Rules */}
      <section className="mb-6 rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Escalation rules
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {plan.rules.map((rule, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2"
            >
              <code className="text-foreground">
                {rule.conditions
                  .map((c) => `${c.key} ${c.op} ${String(c.value)}`)
                  .join(" AND ")}
              </code>
              <span
                className={[
                  "rounded px-2 py-0.5 text-xs font-semibold",
                  rule.then === 3
                    ? "bg-rose-500/20 text-rose-300"
                    : rule.then === 2
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-slate-500/20 text-slate-300",
                ].join(" ")}
              >
                Level {rule.then}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          No-response: after {plan.no_response.retries} retries (
          {plan.no_response.gap_minutes} min apart) → Level{" "}
          {plan.no_response.then}
        </p>
      </section>

      {/* Validation status (uses the real deterministic validator) */}
      <section className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-6">
        <h2 className="text-lg font-semibold text-foreground">
          Plan validation
        </h2>
        {valid ? (
          <p className="mt-2 text-sm text-[color:var(--success)]">
            ✓ Plan is structurally valid.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--destructive)]">
            {errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
