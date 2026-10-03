// Guard for all /clinician/* routes. Redirects to the admin login when the
// request is not from a signed-in clinician. Also provides a shared shell
// (top bar with sign-out) for the admin screens.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin-auth';
import { AdminSignOut } from '@/components/AdminSignOut';

export default async function ClinicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[color:var(--card-border)] bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/clinician" className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">AlalAI</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Professional
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <Link
              href="/clinician"
              className="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-[color:var(--surface)] hover:text-foreground"
            >
              Patients
            </Link>
            <Link
              href="/clinician/logs"
              className="rounded-lg px-3 py-1.5 text-muted-foreground transition hover:bg-[color:var(--surface)] hover:text-foreground"
            >
              Logs
            </Link>
            <AdminSignOut />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
