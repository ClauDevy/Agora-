// Clinician dashboard — patients list. Reads real patients from Supabase.
// Guarded by the clinician layout. No voice here.

import Link from "next/link";
import { listPatients } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Patients — AlalAI" };

export default async function ClinicianDashboard() {
  const patients = await listPatients();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Patients
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a patient and their care plan, then share the private link.
          </p>
        </div>
        <Link
          href="/clinician/new"
          className="inline-flex items-center justify-center rounded-lg bg-[color:var(--primary)] px-5 py-2.5 font-semibold text-[color:var(--primary-foreground)] transition hover:opacity-90"
        >
          + New patient
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        AlalAI follows the instructions you write. It does not diagnose or
        replace clinical judgment.
      </div>

      {patients.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[color:var(--card-border)] bg-[color:var(--surface)]/40 p-10 text-center">
          <p className="text-muted-foreground">No patients yet.</p>
          <Link
            href="/clinician/new"
            className="mt-4 inline-block rounded-lg bg-[color:var(--primary)] px-5 py-2.5 font-semibold text-[color:var(--primary-foreground)]"
          >
            Create your first patient
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {patients.map((p) => (
            <li
              key={p.id}
              className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {p.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.taskCount} care-plan task{p.taskCount === 1 ? "" : "s"} ·{" "}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/clinician/patient/${p.id}`}
                  className="rounded-lg border border-[color:var(--card-border)] px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Manage
                </Link>
              </div>
              <code className="mt-3 block truncate rounded bg-background/50 px-2 py-1 text-xs text-muted-foreground">
                /p/{p.token}
              </code>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
