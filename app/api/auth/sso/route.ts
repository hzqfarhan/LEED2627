import { NextResponse } from 'next/server';
import { seal } from '@/lib/auth';
import { CALLBACK_PATH, appOrigin, authUrl, newHandshake, safeNext, ssoConfigured } from '@/lib/google';

/** GET /api/auth/sso?next=/stall  ->  off to Google's account chooser. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  if (!ssoConfigured()) return NextResponse.redirect(`${origin}/login?error=sso-off`);
  const h = newHandshake(safeNext(new URL(req.url).searchParams.get('next')));
  const res = NextResponse.redirect(authUrl(h, origin + CALLBACK_PATH));
  res.cookies.set('leed_sso', seal(h), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/sso',
    maxAge: 600,
  });
  return res;
}
