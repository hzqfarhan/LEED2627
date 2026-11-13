import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { LOGO_MAX_BYTES, deleteLogo, saveLogo, sniffImage } from '@/lib/accounts';
import { getSession } from '@/lib/auth';

/**
 * POST   (body: the image itself, JPEG, PNG or WebP, up to 1 MB)  add or replace the company logo
 * DELETE                                                          remove it
 * Optional. Any member of the stall team can do this, at any time.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.stall == null) return NextResponse.json({ error: 'Only stall teams can upload a logo.' }, { status: 401 });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > LOGO_MAX_BYTES) return NextResponse.json({ error: 'The logo is too big. Keep it under 1 MB.' }, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  if (data.length > LOGO_MAX_BYTES) return NextResponse.json({ error: 'The logo is too big. Keep it under 1 MB.' }, { status: 413 });
  const type = sniffImage(data);
  if (!type) return NextResponse.json({ error: 'The logo must be a JPEG, PNG or WebP image.' }, { status: 415 });
  const ok = await saveLogo(session.stall, data, type);
  if (!ok) return NextResponse.json({ error: 'Your stall could not be found.' }, { status: 404 });
  await logEvent(asActor(session), 'user', 'logo.upload', `Uploaded a company logo for stall ${session.stall} (${Math.round(data.length / 1024)} KB)`, `stall ${session.stall}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session || session.stall == null) return NextResponse.json({ error: 'Only stall teams can remove a logo.' }, { status: 401 });
  await deleteLogo(session.stall);
  await logEvent(asActor(session), 'user', 'logo.remove', `Removed the company logo of stall ${session.stall}`, `stall ${session.stall}`);
  return NextResponse.json({ ok: true });
}
