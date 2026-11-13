import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { endSession, getSession } from '@/lib/auth';

export async function POST() {
  const session = await getSession();
  if (session) await logEvent(asActor(session), 'auth', 'signout', 'Signed out', null);
  await endSession();
  return NextResponse.json({ ok: true });
}
