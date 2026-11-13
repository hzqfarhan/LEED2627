import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { getSession } from '@/lib/auth';
import { parseDetails, saveDetails } from '@/lib/payments';

/**
 * PUT  (JSON)  save the stall registration details: course, lecturer, group number, main product,
 *              electrical items with watts, leader's phone. Any member of the stall team can do this.
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.stall == null) return NextResponse.json({ error: 'Only stall teams can save stall details.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  const parsed = parseDetails(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ok = await saveDetails(session.stall, parsed.details, session.email);
  if (!ok) return NextResponse.json({ error: 'Your stall could not be found.' }, { status: 404 });
  const watts = parsed.details.electrical.reduce((n, x) => n + x.watts, 0);
  await logEvent(
    asActor(session),
    'user',
    'stall.details',
    `Saved the registration details of stall ${session.stall} (${parsed.details.electrical.length} electrical items, ${watts} W)`,
    `stall ${session.stall}`,
  );
  return NextResponse.json({ ok: true });
}
