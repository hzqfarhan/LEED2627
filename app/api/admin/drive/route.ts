import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { disconnectDrive, driveStatus } from '@/lib/drive';
import { ssoConfigured } from '@/lib/google';
import { asActor, logEvent } from '@/lib/log';

/** GET: is Google Drive connected, and as whom. DELETE: disconnect it (files already in Drive stay there). */
export async function GET() {
  const s = await getSession();
  if (!s || s.role !== 'admin') return NextResponse.json({ error: 'Only admins can do that.' }, { status: 403 });
  return NextResponse.json({ ...(await driveStatus()), canConnect: ssoConfigured() }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE() {
  const s = await getSession();
  if (!s || s.role !== 'admin') return NextResponse.json({ error: 'Only admins can do that.' }, { status: 403 });
  const before = await driveStatus();
  await disconnectDrive();
  await logEvent(asActor(s), 'admin', 'drive.disconnect', `Disconnected Google Drive${before.account ? ` (${before.account})` : ''}. New receipts are kept in the database.`, null);
  return NextResponse.json({ ok: true });
}
