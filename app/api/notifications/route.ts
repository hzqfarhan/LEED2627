import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listNotices, markSeen } from '@/lib/notify';

/**
 * GET    the signed-in person's latest notifications and the unread count
 * PATCH  mark everything up to now as read (when they open the bell)
 */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ items: [], unread: 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
  const out = await listNotices({ email: s.email, role: s.role });
  return NextResponse.json(out, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  await markSeen(s.email);
  return NextResponse.json({ ok: true });
}
