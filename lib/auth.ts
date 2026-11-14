import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { shortName } from './names';
import { accountById, type Account } from './accounts';
import type { Role } from './shared';

// Sessions. Everyone signs in with UTHM SSO (Google, @student.uthm.edu.my or @uthm.edu.my).
// The cookie only says who someone is; their role and stall team are read fresh on every
// request, so the committee's changes (new judge, removed team member) apply immediately.

const COOKIE = 'leed_session';
const MAX_AGE = 60 * 60 * 24 * 7; // a week: covers set-up, both carnival days and the results

interface Token {
  uid: number;
  exp: number; // unix seconds
}

export interface Session {
  uid: number;
  name: string;
  email: string;
  /** What they mainly do: admin, judge, seller (on a stall team) or customer. */
  role: Role;
  /** Their stall number, if they are on a stall team. */
  stall: number | null;
  isLeader: boolean;
  /** Profile photo candidates, best first. */
  photos: string[];
  staffId: string | null;
  /** A name short enough for the profile pill (nickname when the full name is long). */
  shortName: string;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  // Demo mode (no database) holds only sample data, so a built-in secret is fine there.
  if (!process.env.DATABASE_URL) return 'leed26-demo-mode-secret-sample-data-only';
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set (or is shorter than 16 characters). Add it to your environment variables.');
  }
  return 'development-only-secret-not-for-production';
}

/** HMAC-SHA256 of a value with SESSION_SECRET (base64url). */
export function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** A signed, base64url JSON value, for short-lived cookies such as the SSO handshake. */
export function seal(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

function toSession(a: Account): Session {
  return {
    uid: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    stall: a.stall,
    isLeader: a.isLeader,
    photos: a.photos,
    staffId: a.staffId,
    shortName: shortName(a.name, a.nickname),
  };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const t = unseal<Token>(jar.get(COOKIE)?.value);
  if (!t || typeof t.uid !== 'number' || typeof t.exp !== 'number' || t.exp < Date.now() / 1000) return null;
  const account = await accountById(t.uid);
  if (!account || !account.isActive) return null;
  return toSession(account);
}

export async function startSession(account: Account): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, seal({ uid: account.id, exp: Math.floor(Date.now() / 1000) + MAX_AGE } satisfies Token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
  // Read once by the page after sign-in to show the welcome pop-up, then deleted.
  jar.set(WELCOME_COOKIE, '1', { sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 120 });
}

export const WELCOME_COOKIE = 'leed_welcome';

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in judge or admin, or null. */
export async function getStaffSession(): Promise<Session | null> {
  const session = await getSession();
  return session && (session.role === 'admin' || session.role === 'judge') ? session : null;
}

/** Where each kind of person lands after signing in. */
export function homeFor(role: Role): string {
  return role === 'admin' ? '/admin' : role === 'judge' ? '/judge' : role === 'seller' ? '/stall' : '/stalls';
}

/** Any signed-in UTHM account; everyone else goes to sign in first. */
export async function requireUser(next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/** For judge and admin pages: everyone else is sent to the right place. */
export async function requireStaff(next: string, adminOnly = false): Promise<Session> {
  const session = await requireUser(next);
  if (session.role !== 'admin' && session.role !== 'judge') redirect(homeFor(session.role));
  if (adminOnly && session.role !== 'admin') redirect('/judge');
  return session;
}

/** For the seller page: only people on a stall team. */
export async function requireSeller(): Promise<Session & { stall: number }> {
  const session = await requireUser('/stall');
  if (session.stall == null) redirect('/for-teams');
  return session as Session & { stall: number };
}
