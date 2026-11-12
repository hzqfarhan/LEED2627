import { NextResponse } from 'next/server';
import { homeFor, startSession } from '@/lib/auth';
import { verifyLogin, verifyStallLogin } from '@/lib/repo';

const LOCKED = 'Too many wrong PINs. Sign-in is locked for 10 minutes. Ask the committee to unlock it sooner.';

/**
 * Two kinds of sign-in:
 *   { email, pin }                 judges and admins
 *   { mode: 'stall', stall, pin }  a stall team, by stall number
 */
export async function POST(req: Request) {
  let body: { mode?: unknown; email?: unknown; stall?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });
  }
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!pin || pin.length > 72) return NextResponse.json({ error: 'Enter your PIN.' }, { status: 400 });

  if (body.mode === 'stall') {
    const number = Number(body.stall);
    if (!Number.isInteger(number) || number < 1) {
      return NextResponse.json({ error: 'Enter your stall number.' }, { status: 400 });
    }
    const result = await verifyStallLogin(number, pin);
    if (!result.ok) {
      if (result.reason === 'locked') return NextResponse.json({ error: LOCKED }, { status: 423 });
      return NextResponse.json(
        { error: 'That stall number and team PIN do not match. If your team has no PIN yet, ask the committee for one.' },
        { status: 401 },
      );
    }
    await startSession({ id: 0, name: result.name, role: 'stall', stall: result.number });
    return NextResponse.json({ ok: true, role: 'stall', home: homeFor('stall') });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!email || email.length > 200) return NextResponse.json({ error: 'Enter your email and PIN.' }, { status: 400 });

  const result = await verifyLogin(email, pin);
  if (!result.ok) {
    if (result.reason === 'locked') return NextResponse.json({ error: LOCKED }, { status: 423 });
    return NextResponse.json({ error: 'That email and PIN do not match. Check both and try again.' }, { status: 401 });
  }
  await startSession(result.user);
  return NextResponse.json({ ok: true, role: result.user.role, home: homeFor(result.user.role) });
}
