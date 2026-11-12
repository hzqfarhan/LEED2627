import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sign } from '@/lib/auth';

/**
 * Customer Choice voters.
 *
 * A phone gets a voter id only after it passes a Cloudflare Turnstile check. The id lives in a
 * signed, httpOnly cookie, so it cannot be made up: a script (or an incognito tab) that wants a
 * fresh id has to pass Turnstile again, which bots cannot do at scale.
 */

export const VOTER_COOKIE = 'leed_voter';
export const VOTER_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export function newVoterCookie(): { id: string; value: string } {
  const id = randomBytes(16).toString('hex');
  return { id, value: `${id}.${sign(`voter:${id}`)}` };
}

/** The voter id inside a cookie value, or null if the cookie is missing, malformed or forged. */
export function readVoter(value: string | undefined): string | null {
  if (!value) return null;
  const [id, mac] = value.split('.');
  if (!id || !mac || !/^[a-f0-9]{32}$/.test(id)) return null;
  const want = Buffer.from(sign(`voter:${id}`));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** Turnstile is on when both keys are set. Without them (local testing, demo) voting skips the check. */
export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null;
}

export type TurnstileResult = 'ok' | 'failed' | 'unavailable';

/** Checks a Turnstile token with Cloudflare. Tokens are single use and expire after 5 minutes. */
export async function verifyTurnstile(token: unknown, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return 'ok';
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) return 'failed';
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'unavailable';
    const data = (await res.json()) as { success?: boolean; action?: string };
    return data.success && (data.action === undefined || data.action === 'vote') ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}
