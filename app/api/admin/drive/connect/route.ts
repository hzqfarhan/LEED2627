import { NextResponse } from 'next/server';
import { getSession, seal } from '@/lib/auth';
import { DRIVE_CALLBACK_PATH, driveAuthUrl, newDriveHandshake } from '@/lib/drive';
import { appOrigin, ssoConfigured } from '@/lib/google';

/** GET /api/admin/drive/connect  ->  Google, to let LEED 26 put receipts in this account's Drive. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const s = await getSession();
  if (!s || s.role !== 'admin') return NextResponse.redirect(`${origin}/admin?drive=denied`);
  if (!ssoConfigured()) return NextResponse.redirect(`${origin}/admin?drive=no-google`);
  const h = newDriveHandshake();
  const res = NextResponse.redirect(driveAuthUrl(h, origin + DRIVE_CALLBACK_PATH));
  res.cookies.set('leed_drive', seal(h), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/admin/drive',
    maxAge: 600,
  });
  return res;
}
