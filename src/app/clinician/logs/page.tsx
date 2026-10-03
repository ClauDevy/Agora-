// Clinician logs view — the audit trail. Reads sessions, answers, and decisions
// from Supabase. This is where the deterministic rules-engine output becomes
// visible to the clinician (AGENTS.md section 10: structured logging for every
// decision). No voice here. All data is DEMO PROTOCOL.

import Link from "next/link";
import { getSessions, getSessionDetail } from "@/lib/data";

export const metadata = { title: "Session Logs — AlalAI" };
export const dynamic = "force-dynamic"; // always read fresh from the DB

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
  const sessions = await getSessions();

  // Load detail for the most recent few sessions to show inline.
  const details = await Promise.all(
    sessions.slice(0, 10).map((s) => getSessionDetail(s.id)),
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Session Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every answer and every escalation decision, logged server-side.
          </p>
        </div>
        <Link
          href="/clinician"
          className="rounded-lg border border-[color:var(--card-border)] px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Dashboard
        </Link>
      </header>

      <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <strong>DEMO PROTOCOL.</strong> Decisions are produced by the
        deterministic rules engine, not an AI. No real patient data.
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-6 text-sm text-muted-foreground">
          No sessions yet. Start a patient session (tap the button on the patient
          screen), then answers and decisions will appear here.
        </p>
      ) : (
        <ul className="space-y-4">
          {sessions.map((s, i) => {
            const detail = details[i] ?? null;
            return (
              <li
                key={s.id}
                className="rounded-[16px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/70 p-5"
              >
                <div className="flex items-center justify-between">
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
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Answers
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
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
                          {a.rawTranscript && (
                            <span className="text-xs text-muted-foreground">
                              “{a.rawTranscript}”
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail && detail.decisions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Decisions
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {detail.decisions.map((d, j) => (
                        <li key={j} className="flex items-start gap-3">
                          {levelBadge(d.level)}
                          <span className="text-muted-foreground">
                            {d.reasons.length > 0
                              ? d.reasons.map((r) => r.detail).join("; ")
                              : "No rule matched (note only)."}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
