import { NextResponse } from 'next/server';
import { allow, clientKey } from '@/lib/ratelimit';
import { likeMemory } from '@/lib/repo';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const memoryId = Number(id);
  if (!Number.isInteger(memoryId)) return NextResponse.json({ error: 'Unknown memory.' }, { status: 404 });
  if (!allow(`like:${clientKey(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Slow down a little.' }, { status: 429 });
  }
  const likes = await likeMemory(memoryId);
  if (likes === null) return NextResponse.json({ error: 'Unknown memory.' }, { status: 404 });
  return NextResponse.json({ ok: true, likes });
}
