import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, unseal } from '@/lib/auth';
import { DRIVE_CALLBACK_PATH, finishDriveConnect, type DriveHandshake } from '@/lib/drive';
import { appOrigin } from '@/lib/google';
import { asActor, logEvent } from '@/lib/log';

/** Google sends the admin back here after they allow Drive access. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const back = (state: string) => {
    const res = NextResponse.redirect(`${origin}/admin?drive=${state}`);
    res.cookies.set('leed_drive', '', { path: '/api/admin/drive', maxAge: 0 });
    return res;
  };
  const s = await getSession();
  if (!s || s.role !== 'admin') return back('denied');
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return back('cancelled');
  const h = unseal<DriveHandshake>((await cookies()).get('leed_drive')?.value);
  const code = url.searchParams.get('code');
  if (!h || h.exp < Date.now() / 1000 || !code || url.searchParams.get('state') !== h.state) return back('expired');
  try {
    const account = await finishDriveConnect(code, h, origin + DRIVE_CALLBACK_PATH);
    await logEvent(asActor(s), 'admin', 'drive.connect', `Connected Google Drive (${account}) for payment receipts`, null);
    return back('connected');
  } catch (err) {
    console.error('[drive] connect failed', err);
    return back('failed');
  }
}
