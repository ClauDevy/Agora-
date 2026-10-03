// Token-based patient entry: /p/[token]
// Resolves the unguessable link token to a patient and renders the voice app.
// No login, no forms (AGENTS.md section 8). Invalid tokens get a calm message.

import { getPatientByToken } from "@/lib/data";
import PatientClient from "@/components/PatientClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "AlalAI" };

export default async function PatientTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const patient = await getPatientByToken(token);

  if (!patient) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-up max-w-sm rounded-[20px] border border-[color:var(--card-border)] bg-[color:var(--surface)]/80 p-8">
          <h1 className="text-2xl font-bold text-foreground">AlalAI</h1>
          <p className="mt-3 text-muted-foreground">
            This link is not valid. Please ask your clinic for a new link.
          </p>
        </div>
      </main>
    );
  }

  return <PatientClient patientId={patient.id} patientName={patient.name} />;
}
