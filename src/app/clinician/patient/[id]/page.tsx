// Patient detail / manage page. Shows the care plan, warning rules, the
// private link (copy + QR), and plan validation. Reads from Supabase.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatient, getActivePlan } from "@/lib/data";
import { getSupabaseServer } from "@/lib/supabase";
import { validatePlan } from "@/core/validate-plan";
import { PatientLinkPanel } from "@/components/PatientLinkPanel";
import type { Block, CheckinBlock, CoachBlock, ConfirmBlock } from "@/core/types";

export const dynamic = "force-dynamic";

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

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  // Token for the link panel.
  const db = getSupabaseServer();
  let token = "";
  if (db) {
    const { data } = await db
      .from("patients")
      .select("patient_token")
      .eq("id", id)
      .maybeSingle();
    token = data?.patient_token ?? "";
  }

  const loaded = await getActivePlan(id);
  const plan = loaded?.plan ?? null;
  const validation = plan ? validatePlan(plan) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/clinician"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Patients
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
        {patient.name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Language: {patient.language}
      </p>

      {token && (
        <div className="mt-6">
          <PatientLinkPanel token={token} patientName={patient.name} />
        </div>
      )}

      {plan ? (
        <div className="mt-6 space-y-6">
          <section className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">
              Care-plan tasks
            </h2>
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
                    <span className="text-foreground">
                      {blockSummary(task)}
                    </span>
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {task.time}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">
              Warning signs
            </h2>
            {plan.rules.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No warning-sign rules set.
              </p>
            ) : (
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
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        rule.then === 3
                          ? "bg-rose-500/20 text-rose-300"
                          : rule.then === 2
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      Level {rule.then}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {validation && (
            <p
              className={`text-sm ${validation.valid ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}
            >
              {validation.valid
                ? "✓ Plan is structurally valid."
                : `Plan issues: ${validation.errors.join("; ")}`}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          No active care plan for this patient.
        </p>
      )}
    </main>
  );
}
