import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { addMember, removeMember, setLeader } from '@/lib/accounts';
import { getSession } from '@/lib/auth';

/**
 * The team leader manages their stall team:
 *   POST   { email }           add a groupmate by their UTHM email
 *   DELETE { email }           remove a groupmate
 *   PATCH  { email }           hand over the leader role
 * Groupmates see the stall the first time they sign in with UTHM SSO.
 */
async function leader() {
  const session = await getSession();
  if (!session || session.stall == null) return { error: NextResponse.json({ error: 'Only stall teams can manage a team.' }, { status: 401 }) };
  if (!session.isLeader && session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only your team leader can change the team. Ask them, or the committee.' }, { status: 403 }) };
  }
  return { session };
}

async function readEmail(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  return typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase().slice(0, 200) : null;
}

export async function POST(req: Request) {
  const { session, error } = await leader();
  if (error) return error;
  const email = await readEmail(req);
  if (!email) return NextResponse.json({ error: 'Enter your groupmate’s UTHM email.' }, { status: 400 });
  const res = await addMember(session.stall!, email, { addedBy: session.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  await logEvent(asActor(session), 'user', 'team.add', `Added ${email} to the team of stall ${session.stall}`, email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { session, error } = await leader();
  if (error) return error;
  const email = await readEmail(req);
  if (!email) return NextResponse.json({ error: 'Choose who to remove.' }, { status: 400 });
  if (email === session.email) return NextResponse.json({ error: 'Hand the leader role to someone else before leaving the team.' }, { status: 400 });
  const ok = await removeMember(session.stall!, email);
  if (!ok) return NextResponse.json({ error: 'That person is not on your team.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'team.remove', `Removed ${email} from the team of stall ${session.stall}`, email);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { session, error } = await leader();
  if (error) return error;
  const email = await readEmail(req);
  if (!email) return NextResponse.json({ error: 'Choose the new leader.' }, { status: 400 });
  const ok = await setLeader(session.stall!, email);
  if (!ok) return NextResponse.json({ error: 'That person is not on your team.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'team.leader', `Handed the leader role of stall ${session.stall} to ${email}`, email);
  return NextResponse.json({ ok: true });
}
