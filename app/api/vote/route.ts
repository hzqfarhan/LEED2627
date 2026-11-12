import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { allow, clientKey } from '@/lib/ratelimit';
import { castVote, getVotingOpen } from '@/lib/repo';
import { newVoterCookie, readVoter, verifyTurnstile, VOTER_COOKIE, VOTER_MAX_AGE } from '@/lib/voter';

/**
 * Customer Choice vote: { stall: number, liked: boolean, token?: string }.
 *
 * A phone with a valid signed voter cookie just votes (one vote per stall, changeable).
 * A phone without one must send a Cloudflare Turnstile token; once it passes, the phone gets
 * its signed voter cookie. Scripts and incognito tabs therefore need a fresh Turnstile pass
 * for every extra voter, and a per-connection rate limit slows them further.
 */
export async function POST(req: Request) {
  if (!(await getVotingOpen())) {
    return NextResponse.json({ error: 'Customer Choice voting is closed.' }, { status: 403 });
  }
  const ip = clientKey(req);
  if (!allow(`vote:${ip}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many votes from this connection. Try again in a few minutes.' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { stall?: unknown; liked?: unknown; token?: unknown } | null;
  const stall = Number(body?.stall);
  if (!Number.isInteger(stall) || typeof body?.liked !== 'boolean') {
    return NextResponse.json({ error: 'The vote could not be read.' }, { status: 400 });
  }

  const jar = await cookies();
  let voter = readVoter(jar.get(VOTER_COOKIE)?.value);
  if (!voter) {
    const check = await verifyTurnstile(body.token, ip);
    if (check === 'unavailable') {
      return NextResponse.json({ error: 'The human check could not be reached. Try again in a moment.', needCheck: true }, { status: 503 });
    }
    if (check === 'failed') {
      return NextResponse.json({ error: 'Please complete the human check, then vote again.', needCheck: true }, { status: 403 });
    }
    const fresh = newVoterCookie();
    voter = fresh.id;
    jar.set(VOTER_COOKIE, fresh.value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: VOTER_MAX_AGE,
    });
  }

  const ok = await castVote(stall, voter, body.liked);
  if (!ok) return NextResponse.json({ error: 'That stall does not exist.' }, { status: 404 });
  return NextResponse.json({ ok: true, liked: body.liked });
}
