import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from './shared';

const COOKIE = 'leed_session';
const MAX_AGE = 60 * 60 * 14; // 14 hours: one long event day

export interface Session {
  /** users.id for admins and judges; always 0 for a stall team. */
  uid: number;
  name: string;
  role: Role;
  /** Stall number, only for a stall team. */
  stall?: number;
  exp: number; // unix seconds
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set (or is shorter than 16 characters). Add it to your environment variables.');
  }
  return 'development-only-secret-not-for-production';
}

/** HMAC-SHA256 of a value with SESSION_SECRET (base64url). Also signs Customer Choice voter cookies. */
export function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (typeof s.uid !== 'number' || typeof s.exp !== 'number') return null;
    if (s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decode(jar.get(COOKIE)?.value);
}

export async function startSession(user: { id: number; name: string; role: Role; stall?: number }): Promise<void> {
  const jar = await cookies();
  const session: Session = {
    uid: user.role === 'stall' ? 0 : user.id,
    name: user.name,
    role: user.role,
    stall: user.role === 'stall' ? user.stall : undefined,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  };
  jar.set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in judge or admin, or null. Stall teams never count as staff. */
export async function getStaffSession(): Promise<Session | null> {
  const session = await getSession();
  return session && session.role !== 'stall' ? session : null;
}

/** Where each kind of account lands after signing in. */
export function homeFor(role: Role): string {
  return role === 'admin' ? '/admin' : role === 'stall' ? '/stall' : '/judge';
}

/** For judge and admin pages: everyone else is sent to the right place. */
export async function requireStaff(next: string, adminOnly = false): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (session.role === 'stall') redirect('/stall');
  if (adminOnly && session.role !== 'admin') redirect('/judge');
  return session;
}

/** For the stall team page. */
export async function requireStall(): Promise<Session & { stall: number }> {
  const session = await getSession();
  if (!session) redirect('/login?as=stall');
  if (session.role !== 'stall' || !session.stall) redirect(homeFor(session.role));
  return session as Session & { stall: number };
}
