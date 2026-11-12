import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { allow, clientKey } from '@/lib/ratelimit';
import { addMemory, listMemories } from '@/lib/repo';
import { classifyMemoryUrl, type MemoryKind } from '@/lib/shared';

export async function GET() {
  return NextResponse.json({ memories: await listMemories(false) });
}

/**
 * Pin a memory. Anyone can send one; it stays hidden until an admin approves it.
 * Memories sent by a signed-in admin go straight onto the wall.
 */
export async function POST(req: Request) {
  if (!allow(`memory:${clientKey(req)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: 'You have pinned several memories in a row. Wait a few minutes and try again.' }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });
  }

  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  if (caption.length < 1 || caption.length > 140) {
    return NextResponse.json({ error: 'Write a caption of up to 140 characters.' }, { status: 400 });
  }
  const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim().slice(0, 60) : null;
  const yearNum = Number(body.year);
  const year = Number.isInteger(yearNum) && yearNum >= 2015 && yearNum <= 2100 ? yearNum : null;

  let kind: MemoryKind = 'note';
  let url: string | null = null;
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  if (link) {
    if (link.startsWith('/memories/') && !link.includes('..')) {
      // A file placed in public/memories/
      kind = /\.(mp4|webm|mov|m4v)$/i.test(link) ? 'video' : 'image';
      url = link;
    } else {
      const parsed = classifyMemoryUrl(link);
      if (!parsed) {
        return NextResponse.json({ error: 'Use a full https:// link to a photo, a video file or a YouTube video.' }, { status: 400 });
      }
      kind = parsed.kind;
      url = parsed.url;
    }
  }

  const session = await getSession();
  const status = session?.role === 'admin' ? 'approved' : 'pending';
  await addMemory({ kind, url, caption, author, year, status });
  return NextResponse.json({ ok: true, status });
}
