import { cookies } from 'next/headers';
import { asActor, logEvent } from '@/lib/log';
import { NextResponse } from 'next/server';
import { signInWithGoogle } from '@/lib/accounts';
import { homeFor, startSession, unseal } from '@/lib/auth';
import { CALLBACK_PATH, appOrigin, exchangeCode, type Handshake } from '@/lib/google';
import { isUthmEmail } from '@/lib/uthm';

/** Google sends people back here. Only official UTHM emails get in. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const h = unseal<Handshake>(jar.get('leed_sso')?.value);
  jar.delete({ name: 'leed_sso', path: '/api/auth/sso' });
  const fail = (error: string, extra: Record<string, string> = {}) =>
    NextResponse.redirect(`${origin}/login?${new URLSearchParams({ error, ...extra })}`);

  if (url.searchParams.get('error')) return fail('cancelled'); // they closed the Google window or said no
  const code = url.searchParams.get('code');
  if (!h || !code || h.exp < Date.now() / 1000 || url.searchParams.get('state') !== h.state) return fail('expired');

  let id;
  try {
    id = await exchangeCode(code, h, origin + CALLBACK_PATH);
  } catch (err) {
    console.error('UTHM SSO failed', err);
    return fail('sso');
  }
  // The pop-up on the sign-in page names the email they tried.
  if (!id.emailVerified || !isUthmEmail(id.email)) {
    await logEvent({ email: id.email, name: id.name }, 'auth', 'signin.refused', `Refused sign-in from ${id.email}: not a UTHM email`, id.email);
    return fail('domain', { email: id.email });
  }

  const result = await signInWithGoogle({ email: id.email, name: id.name, picture: id.picture, sub: id.sub, givenName: id.givenName });
  if (!result.ok) {
    await logEvent({ email: id.email, name: id.name }, 'auth', 'signin.refused', `Refused sign-in from ${id.email}: ${result.reason === 'disabled' ? 'account switched off' : result.reason}`, id.email);
    return fail(result.reason, { email: id.email });
  }
  await startSession(result.account);
  await logEvent(asActor(result.account), 'auth', 'signin', 'Signed in with UTHM SSO', null);
  return NextResponse.redirect(origin + (h.next || homeFor(result.account.role)));
}
