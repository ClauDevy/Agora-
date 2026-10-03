// Professional logs feed. Leads with TODAY'S TASKS per patient (done / not done
// + time), then overdue warnings, then recent session detail (answers +
// decisions). All DEMO data; decisions come from the deterministic rules engine.

import { getSessions, getSessionDetail } from "@/lib/data";
import { getOverdueItems } from "@/lib/overdue";
import { getTodaysTaskStatus } from "@/lib/task-status";

export const metadata = { title: "Session Logs — AlalAI" };
export const dynamic = "force-dynamic";

function levelBadge(level: number) {
  const cls =
    level === 3
      ? "bg-rose-500/20 text-rose-300"
      : level === 2
        ? "bg-amber-500/20 text-amber-300"
        : "bg-slate-500/20 text-slate-300";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>
      Level {level}
    </span>
  );
}

export default async function LogsPage() {
  const [taskStatus, overdue, sessions] = await Promise.all([
    getTodaysTaskStatus(),
    getOverdueItems(),
    getSessions(),
  ]);
  const details = await Promise.all(
    sessions.slice(0, 10).map((s) => getSessionDetail(s.id)),
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Today&apos;s activity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scheduled tasks for today and whether each has been done.
        </p>
      </header>

      <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <strong>DEMO PROTOCOL.</strong> &quot;Done&quot; means the patient
        confirmed it by voice. Decisions come from the deterministic rules
        engine, not an AI.
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <section className="mb-6 rounded-[16px] border border-rose-500/40 bg-rose-500/10 p-5">
          <h2 className="text-lg font-semibold text-rose-200">
            ⚠ Overdue — no confirmation recorded
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {overdue.map((o, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/40 px-3 py-2"
              >
                <span className="text-foreground">
                  <strong>{o.patientName}</strong> — {o.taskLabel}{" "}
                  <span className="text-muted-foreground">at {o.time}</span>
                </span>
                <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-200">
                  {o.minutesLate >= 60
                    ? `${Math.floor(o.minutesLate / 60)}h ${o.minutesLate % 60}m late`
                    : `${o.minutesLate}m late`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Today's tasks per patient */}
      {taskStatus.length === 0 ? (
        <p className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-6 text-sm text-muted-foreground">
          No patients with an active plan yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {taskStatus.map((p) => {
            const doneCount = p.tasks.filter(
              (t) => t.status === "done" || t.status === "late",
            ).length;
            return (
              <li
                key={p.patientId}
                className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {p.patientName}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {doneCount}/{p.tasks.length} done today
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-[color:var(--card-border)]">
                  {p.tasks.map((t) => (
                    <li
                      key={t.blockKey}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">
                          {t.time}
                        </span>
                        <span className="rounded bg-[color:var(--primary)]/15 px-2 py-0.5 text-xs text-[color:var(--primary)]">
                          {t.typeLabel}
                        </span>
                        <span className="text-foreground">{t.label}</span>
                      </span>
                      {t.status === "done" ? (
                        <span className="rounded bg-[color:var(--success)]/20 px-2 py-0.5 text-xs font-semibold text-[color:var(--success)]">
                          ✓ Done
                          {t.doneAt
                            ? " " +
                              new Date(t.doneAt).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      ) : t.status === "late" ? (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                          ⏰ Done late
                        </span>
                      ) : t.status === "no_response" ? (
                        <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                          ✕ Didn&apos;t respond
                        </span>
                      ) : (
                        <span className="rounded bg-slate-500/20 px-2 py-0.5 text-xs font-semibold text-slate-300">
                          Not done yet
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {/* Recent session detail (answers + decisions) */}
      {sessions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Recent sessions
          </h2>
          <ul className="space-y-4">
            {sessions.map((s, i) => {
              const detail = details[i] ?? null;
              return (
                <li
                  key={s.id}
                  className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-foreground">
                        {s.patientName ?? "Unknown patient"}
                      </span>
                      <span className="ml-3 text-xs text-muted-foreground">
                        {new Date(s.startedAt).toLocaleString()} · {s.status}
                      </span>
                    </div>
                    {levelBadge(s.highestLevel)}
                  </div>

                  {detail && detail.answers.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">
                      {detail.answers.map((a, j) => (
                        <li key={j} className="flex items-center gap-3">
                          <code className="text-foreground">
                            {a.questionKey} = {a.value}
                          </code>
                          {a.validationResult === "unclear" && (
                            <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-xs text-slate-300">
                              unclear
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {detail && detail.decisions.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {detail.decisions
                        .filter((d) => d.level > 1)
                        .map((d, j) => (
                          <li key={j} className="flex items-start gap-2">
                            {levelBadge(d.level)}
                            <span className="text-muted-foreground">
                              {d.reasons.map((r) => r.detail).join("; ")}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
