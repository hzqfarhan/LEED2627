// Small best-effort limiter for the public memory wall endpoints.
// It lives in server memory, so on serverless hosting it only slows down bursts
// that hit the same instance. Pending memories still need admin approval.

const g = globalThis as unknown as { __leedHits?: Map<string, number[]> };

export function allow(key: string, max: number, windowMs: number): boolean {
  if (!g.__leedHits) g.__leedHits = new Map<string, number[]>();
  const hits = g.__leedHits;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || 'unknown';
}
