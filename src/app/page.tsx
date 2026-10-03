// Home / landing. The patient never lands here — they use their private
// /p/[token] link. This page orients clinicians and explains the flow.

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <div className="animate-fade-up w-full max-w-lg rounded-[20px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/80 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur sm:p-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
          AlalAI
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          A voice-first care assistant for older adults at home. A healthcare
          professional writes the care plan; the patient just talks.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/clinician"
            className="rounded-lg bg-[color:var(--primary)] px-6 py-3 font-semibold text-[color:var(--primary-foreground)] transition hover:opacity-90"
          >
            I&apos;m a professional
          </Link>
          <Link
            href="/clinician/logs"
            className="rounded-lg border border-[color:var(--card-border)] px-6 py-3 font-semibold text-muted-foreground transition hover:text-foreground"
          >
            View session logs
          </Link>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Patients open their own private link (given by their clinic) — no
          login, no menus, just one tap and then voice.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Powered by Agora Conversational AI · Decision-support only, not a
          medical device.
        </p>
      </div>
    </main>
  );
}
