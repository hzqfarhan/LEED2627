import { getLogo } from '@/lib/accounts';

/** GET /api/logo/7  ->  stall 7's company logo. Public; cached until the team uploads a new one. */
export async function GET(req: Request, ctx: { params: Promise<{ number: string }> }) {
  const n = Number((await ctx.params).number);
  if (!Number.isInteger(n)) return new Response('Not found', { status: 404 });
  const logo = await getLogo(n);
  if (!logo) return new Response('Not found', { status: 404 });
  const etag = `"logo-${n}-${Date.parse(logo.updatedAt) || 0}"`;
  const headers = {
    'Content-Type': logo.type,
    ETag: etag,
    // the URL carries ?v=<version>, so a new upload gets a new URL
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(logo.data), { headers });
}
