// Admin login/logout. Sets an httpOnly cookie on correct password.
// POST { password } -> sets cookie; DELETE -> clears it.

import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  expectedCookieValue,
  passwordMatches,
} from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  const { password } = (await request.json().catch(() => ({}))) as {
    password?: string;
  };

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: 'Admin password is not configured on the server.' },
      { status: 500 },
    );
  }

  if (!password || !passwordMatches(password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const value = expectedCookieValue()!;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
