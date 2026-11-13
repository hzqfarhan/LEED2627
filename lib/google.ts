import { createHash, randomBytes } from 'node:crypto';

// UTHM SSO: Google OpenID Connect (authorization code flow with PKCE), limited afterwards to
// official UTHM emails. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).

export function ssoConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The public address of the site, for the redirect back from Google. */
export function appOrigin(req: Request): string {
  const fixed = process.env.APP_URL?.replace(/\/+$/, '');
  if (fixed) return fixed;
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export const CALLBACK_PATH = '/api/auth/sso/callback';

export interface Handshake {
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  exp: number;
}

export function newHandshake(next: string): Handshake {
  const rnd = () => randomBytes(32).toString('base64url');
  return { state: rnd(), verifier: rnd(), nonce: rnd(), next, exp: Math.floor(Date.now() / 1000) + 600 };
}

export function authUrl(h: Handshake, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: h.state,
    nonce: h.nonce,
    code_challenge: createHash('sha256').update(h.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    // always show the account chooser, so someone signed in with a personal Gmail can pick their UTHM one
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  /** Google "given_name" (first name), used as a short nickname. */
  givenName: string | null;
  picture: string | null;
  hd: string | null;
}

/**
 * Swap the one-time code for tokens. The ID token comes straight from Google's token endpoint over
 * TLS, so (as OpenID Connect allows) its claims are checked here without re-verifying the signature.
 */
export async function exchangeCode(code: string, h: Handshake, redirectUri: string): Promise<GoogleIdentity> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: h.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error('Google returned no ID token');
  const [, payload] = tokens.id_token.split('.');
  const c = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') throw new Error('Wrong token issuer');
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Token is for another app');
  if (typeof c.exp !== 'number' || c.exp < Date.now() / 1000) throw new Error('Token expired');
  if (c.nonce !== h.nonce) throw new Error('Token nonce mismatch');
  if (typeof c.sub !== 'string' || typeof c.email !== 'string') throw new Error('Token has no account');
  return {
    sub: c.sub,
    email: c.email.toLowerCase(),
    emailVerified: c.email_verified === true || c.email_verified === 'true',
    name: typeof c.name === 'string' ? c.name : '',
    givenName: typeof c.given_name === 'string' ? c.given_name : null,
    picture: typeof c.picture === 'string' && c.picture.startsWith('https://') ? c.picture : null,
    hd: typeof c.hd === 'string' ? c.hd : null,
  };
}

/** Only same-site paths are allowed as the place to return to after signing in. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) ? next : '';
}
