import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CLUSTERS } from '@/lib/event';
import { updateStall } from '@/lib/repo';
import { cleanLink } from '@/lib/shared';

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** A stall team updates its own stall: profile and video links. The canopy colour stays with the committee. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'stall' || !session.stall) {
    return NextResponse.json({ error: 'Sign in as a stall team to edit your stall.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });

  const name = text(body.name, 80);
  if (!name) return NextResponse.json({ error: 'Enter your stall name.' }, { status: 400 });

  const pitchRaw = text(body.pitchUrl, 300);
  const pitchUrl = pitchRaw ? cleanLink(pitchRaw) : null;
  if (pitchRaw && !pitchUrl) {
    return NextResponse.json({ error: 'The pitch video link must be a full https:// link.' }, { status: 400 });
  }
  const promoUrls: string[] = [];
  for (const raw of Array.isArray(body.promoUrls) ? body.promoUrls.slice(0, 3) : []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const link = cleanLink(raw);
    if (!link) return NextResponse.json({ error: 'Each promo video link must be a full https:// link.' }, { status: 400 });
    promoUrls.push(link);
  }

  const ok = await updateStall(session.stall, {
    name,
    groupName: text(body.groupName, 80),
    cluster: CLUSTERS.some((c) => c.id === body.cluster) ? (body.cluster as string) : null,
    description: text(body.description, 300),
    instagram: text(body.instagram, 60)?.replace(/^@/, '') ?? null,
    pitchUrl,
    promoUrls,
  });
  if (!ok) return NextResponse.json({ error: 'Your stall could not be found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
