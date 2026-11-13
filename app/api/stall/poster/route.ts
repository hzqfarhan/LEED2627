import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { POSTER_MAX_BYTES, deletePoster, savePoster, sniffImage } from '@/lib/accounts';
import { getSession } from '@/lib/auth';

/**
 * POST   (body: the image itself, JPEG, PNG or WebP, up to 3 MB)  upload or replace the stall poster
 * DELETE                                                          remove it
 * Any member of the stall team can do this. The poster shows on the memory wall and the stall page.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.stall == null) return NextResponse.json({ error: 'Only stall teams can upload a poster.' }, { status: 401 });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > POSTER_MAX_BYTES) return NextResponse.json({ error: 'The poster is too big. Keep it under 3 MB.' }, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  if (data.length > POSTER_MAX_BYTES) return NextResponse.json({ error: 'The poster is too big. Keep it under 3 MB.' }, { status: 413 });
  const type = sniffImage(data);
  if (!type) return NextResponse.json({ error: 'The poster must be a JPEG, PNG or WebP image.' }, { status: 415 });
  const ok = await savePoster(session.stall, data, type);
  if (!ok) return NextResponse.json({ error: 'Your stall could not be found.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'poster.upload', `Uploaded a poster for stall ${session.stall} (${Math.round(data.length / 1024)} KB)`, `stall ${session.stall}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session || session.stall == null) return NextResponse.json({ error: 'Only stall teams can remove a poster.' }, { status: 401 });
  await deletePoster(session.stall);
  await logEvent(asActor(session), 'user', 'poster.remove', `Removed the poster of stall ${session.stall}`, `stall ${session.stall}`);
  return NextResponse.json({ ok: true });
}
