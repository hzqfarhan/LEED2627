import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { setStaffId } from '@/lib/accounts';
import { getSession } from '@/lib/auth';

/** PATCH { staffId }  ->  staff set their ID so their UTHM Community photo is used. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { staffId?: unknown } | null;
  const raw = typeof body?.staffId === 'string' ? body.staffId.trim() : '';
  if (raw && !/^[A-Za-z0-9]{2,12}$/.test(raw)) return NextResponse.json({ error: 'Use letters and numbers only.' }, { status: 400 });
  await setStaffId(session.uid, raw || null);
  await logEvent(asActor(session), 'user', 'me.staffid', raw ? `Set their staff ID to ${raw}` : 'Cleared their staff ID', null);
  return NextResponse.json({ ok: true });
}
