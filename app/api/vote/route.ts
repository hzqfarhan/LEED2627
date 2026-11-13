import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { allow } from '@/lib/ratelimit';
import { castVote, getVotingOpen } from '@/lib/repo';
import { getSession } from '@/lib/auth';

/**
 * People Choice vote: { stall: number, liked: boolean }.
 *
 * One vote per UTHM account per stall (changeable). Accounts come from UTHM SSO, so one
 * person cannot vote twice by opening new tabs or clearing cookies.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in with UTHM SSO to take part.', needSignIn: true }, { status: 401 });
  if (!(await getVotingOpen())) {
    return NextResponse.json({ error: 'Voting is closed.' }, { status: 403 });
  }
  const ip = `u:${session.uid}`;
  if (!allow(`vote:${ip}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many votes in a short time. Try again in a few minutes.' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { stall?: unknown; liked?: unknown } | null;
  const stall = Number(body?.stall);
  if (session.stall === stall) {
    return NextResponse.json({ error: 'You cannot vote for your own stall.' }, { status: 403 });
  }
  if (!Number.isInteger(stall) || typeof body?.liked !== 'boolean') {
    return NextResponse.json({ error: 'The vote could not be read.' }, { status: 400 });
  }

  const ok = await castVote(stall, `u:${session.uid}`, body.liked);
  if (!ok) return NextResponse.json({ error: 'That stall does not exist.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'vote', `${body.liked ? 'Liked' : 'Marked “not for me” on'} stall ${stall}`, `stall ${stall}`);
  return NextResponse.json({ ok: true, liked: body.liked });
}
