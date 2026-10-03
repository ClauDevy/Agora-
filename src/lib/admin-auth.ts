// Admin auth — shared-password gate for the clinician interface.
//
// SAFETY (AGENTS.md section 7): this is a single shared password from an env
// var, for the hackathon only. Real per-user auth is roadmap. The cookie value
// is a hash of the password so the raw password is not stored in the browser.

import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';

export const ADMIN_COOKIE = 'alalai_admin';

/** The expected cookie value: a hash of the configured admin password. */
export function expectedCookieValue(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHash('sha256').update(pw).digest('hex');
}

/** True if the given password matches the configured admin password. */
export function passwordMatches(password: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && password === pw;
}

/** Server-side check: is the current request from a logged-in admin? */
export async function isAdmin(): Promise<boolean> {
  const expected = expectedCookieValue();
  if (!expected) return false; // not configured -> deny
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === expected;
}
