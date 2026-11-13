import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { getStaffSession } from '@/lib/auth';
import { saveSubmission, submissionsFor } from '@/lib/repo';

/** The signed-in judge's own score sheets. */
export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'Sign in to see your scores.' }, { status: 401 });
  return NextResponse.json({ submissions: await submissionsFor(session.uid) });
}

/** Save (or replace) one score sheet: one judge, one competition, one stall. */
export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'Your sign-in has expired. Sign in again to save scores.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });
  }

  if (body.judgeId != null && Number(body.judgeId) !== session.uid) {
    return NextResponse.json({ error: 'This score was filled in by a different judge.' }, { status: 409 });
  }

  const competitionId = Number(body.competitionId);
  const stallNumber = Number(body.stallNumber);
  const rawScores = body.scores;
  if (!Number.isInteger(competitionId) || !Number.isInteger(stallNumber) || !rawScores || typeof rawScores !== 'object') {
    return NextResponse.json({ error: 'The score sheet is incomplete.' }, { status: 400 });
  }
  if (session.stall === stallNumber) {
    return NextResponse.json({ error: 'You are on this stall’s team, so you cannot score it.' }, { status: 403 });
  }
  const scores: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawScores as Record<string, unknown>)) {
    if (/^\d+$/.test(key) && typeof value === 'number' && Number.isInteger(value)) scores[key] = value;
  }

  const result = await saveSubmission({
    judgeId: session.uid,
    competitionId,
    stallNumber,
    scores,
    comment: typeof body.comment === 'string' ? body.comment : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  await logEvent(asActor(session), 'user', 'score', `Saved a score sheet for stall ${stallNumber} in competition ${competitionId} (levels add up to ${total})`, `stall ${stallNumber}`);
  return NextResponse.json({ ok: true });
}
