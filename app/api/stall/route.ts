import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { getSession } from '@/lib/auth';
import { CLUSTERS, FOOD_CATEGORIES } from '@/lib/event';
import { updateStall } from '@/lib/repo';
import { cleanLink } from '@/lib/shared';

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Any member of a stall team updates their stall: details, SSM number, category and video links. The canopy colour stays with the committee. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.stall == null) {
    return NextResponse.json({ error: 'Only members of a stall team can edit a stall.' }, { status: 401 });
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

  const ssmRaw = text(body.ssmNumber, 30);
  const ssmNumber = ssmRaw ? ssmRaw.toUpperCase().replace(/\s+/g, '') : null;
  if (ssmNumber && !/^[A-Z0-9][A-Z0-9-]{3,24}$/.test(ssmNumber)) {
    return NextResponse.json({ error: 'The SSM number can only have letters, numbers and dashes, for example 202403123456.' }, { status: 400 });
  }

  const ok = await updateStall(session.stall, {
    ssmNumber,
    category: FOOD_CATEGORIES.some((c) => c.id === body.category) ? (body.category as string) : null,
    name,
    groupName: text(body.groupName, 80),
    cluster: CLUSTERS.some((c) => c.id === body.cluster) ? (body.cluster as string) : null,
    description: text(body.description, 400),
    instagram: text(body.instagram, 60)?.replace(/^@/, '') ?? null,
    pitchUrl,
    promoUrls,
  });
  if (!ok) return NextResponse.json({ error: 'Your stall could not be found.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'stall.edit', `Updated the details of stall ${session.stall}`, `stall ${session.stall}`);
  return NextResponse.json({ ok: true });
}
