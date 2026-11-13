import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { demoAccount } from '@/lib/accounts';
import { homeFor, startSession } from '@/lib/auth';
import { hasDb } from '@/lib/db';
import { DEMO_PERSONAS } from '@/lib/demo';
import { safeNext } from '@/lib/google';

/**
 * Demo sign-in as a sample person. Only works without a database (demo mode),
 * so it can never be used to get into real data.
 */
export async function POST(req: Request) {
  if (hasDb) return NextResponse.json({ error: 'Demo sign-in is off. Use UTHM SSO.' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { persona?: unknown; next?: unknown } | null;
  const persona = DEMO_PERSONAS.find((p) => p.id === body?.persona);
  if (!persona) return NextResponse.json({ error: 'Unknown sample person.' }, { status: 400 });
  const account = await demoAccount(persona.email);
  if (!account) return NextResponse.json({ error: 'That sample person is not available.' }, { status: 404 });
  await startSession(account);
  await logEvent(asActor(account), 'auth', 'signin', `Signed in as the demo ${persona.id}`, null);
  return NextResponse.json({ ok: true, home: safeNext(body?.next) || homeFor(account.role) });
}
