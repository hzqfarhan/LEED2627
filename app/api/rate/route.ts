import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { allow } from '@/lib/ratelimit';
import { getVotingOpen, rateStall } from '@/lib/repo';
import { getSession } from '@/lib/auth';

/**
 * Customer rating of a stall's elements: { stall: number, ratings: { [criterionId]: 1..5 } }.
 * These stars are the customer half of Outstanding Stall and the four stall element awards.
 * One rating per UTHM account per stall and element (changeable).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in with UTHM SSO to take part.', needSignIn: true }, { status: 401 });
  if (!(await getVotingOpen())) {
    return NextResponse.json({ error: 'Rating is closed.' }, { status: 403 });
  }
  const ip = `u:${session.uid}`;
  if (!allow(`rate:${ip}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many ratings in a short time. Try again in a few minutes.' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { stall?: unknown; ratings?: unknown } | null;
  const stall = Number(body?.stall);
  if (session.stall === stall) {
    return NextResponse.json({ error: 'You cannot rate your own stall.' }, { status: 403 });
  }
  const raw = body?.ratings;
  if (!Number.isInteger(stall) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'The rating could not be read.' }, { status: 400 });
  }
  const ratings: Record<string, number> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (/^\d+$/.test(id) && Number.isInteger(n) && n >= 1 && n <= 5) ratings[id] = n;
  }
  if (Object.keys(ratings).length === 0) {
    return NextResponse.json({ error: 'Give at least one rating from 1 to 5 stars.' }, { status: 400 });
  }

  const ok = await rateStall(stall, `u:${session.uid}`, ratings);
  if (!ok) return NextResponse.json({ error: 'That stall or element does not exist.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'rate', `Rated stall ${stall} (${Object.keys(ratings).length} element${Object.keys(ratings).length === 1 ? '' : 's'}, average ${(Object.values(ratings).reduce((a, b) => a + b, 0) / Object.keys(ratings).length).toFixed(1)} stars)`, `stall ${stall}`);
  return NextResponse.json({ ok: true });
}
