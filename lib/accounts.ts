// Accounts (UTHM SSO), stall teams, posters, announcements and jury allocations.
// Like repo.ts, every function works on PostgreSQL or, without DATABASE_URL, on the demo store.

import { hasDb, q, tx } from './db';
import { demo } from './demo';
import type { Announcement, Role, StallMember, UserRow } from './shared';
import { isUthmEmail, photoCandidates } from './uthm';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type SaveResult = { ok: true } | { ok: false; error: string };

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface Account {
  id: number;
  name: string;
  email: string;
  /** Role stored on the account: admin, judge or customer. */
  accountRole: 'admin' | 'judge' | 'customer';
  /** What they mainly do here (a customer on a stall team is a seller). */
  role: Role;
  isActive: boolean;
  picture: string | null;
  staffId: string | null;
  /** Their stall, if they are on a stall team. */
  stall: number | null;
  isLeader: boolean;
  photos: string[];
  /** Google first name, if known. */
  nickname: string | null;
}

/** Emails in ADMIN_EMAILS become admins when they sign in (to bootstrap the first committee accounts). */
function bootstrapAdmins(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function primaryRole(accountRole: Account['accountRole'], stall: number | null): Role {
  if (accountRole === 'admin' || accountRole === 'judge') return accountRole;
  return stall != null ? 'seller' : 'customer';
}

async function membershipOf(email: string): Promise<{ stall: number; isLeader: boolean } | null> {
  if (!hasDb) {
    const m = demo().members[email];
    return m ? { stall: m.stall, isLeader: m.isLeader } : null;
  }
  const rows = await q<Row>(
    `SELECT s.number, m.is_leader FROM stall_members m JOIN stalls s ON s.id = m.stall_id WHERE m.email = $1`,
    [email],
  );
  return rows[0] ? { stall: rows[0].number, isLeader: rows[0].is_leader } : null;
}

function toAccount(u: { id: number; name: string; email: string; role: Account['accountRole']; isActive: boolean; picture?: string | null; staffId?: string | null; nickname?: string | null }, m: { stall: number; isLeader: boolean } | null): Account {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    accountRole: u.role,
    role: primaryRole(u.role, m?.stall ?? null),
    isActive: u.isActive,
    picture: u.picture ?? null,
    staffId: u.staffId ?? null,
    stall: m?.stall ?? null,
    isLeader: m?.isLeader ?? false,
    photos: photoCandidates(u.email, { staffId: u.staffId, google: u.picture }),
    nickname: u.nickname ?? null,
  };
}

/** The account behind a session, read fresh so role and team changes apply straight away. */
export async function accountById(id: number): Promise<Account | null> {
  if (!hasDb) {
    const u = demo().users.find((x) => x.id === id);
    if (!u) return null;
    return toAccount(u, await membershipOf(u.email));
  }
  const rows = await q<Row>(`SELECT id, name, email, role, is_active, picture, staff_id, nickname FROM users WHERE id = $1`, [id]);
  const u = rows[0];
  if (!u) return null;
  return toAccount(
    { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.is_active, picture: u.picture, staffId: u.staff_id, nickname: u.nickname },
    await membershipOf(u.email),
  );
}

export type SignInResult = { ok: true; account: Account } | { ok: false; reason: 'domain' | 'disabled' };

/**
 * Called after UTHM SSO (Google) confirms who someone is. Creates the account on first sign-in.
 * Accounts the committee prepared (judges, admins) keep their role and the name the committee typed.
 */
export async function signInWithGoogle(p: { email: string; name: string; picture: string | null; sub: string; givenName?: string | null }): Promise<SignInResult> {
  const email = p.email.trim().toLowerCase();
  if (!isUthmEmail(email)) return { ok: false, reason: 'domain' };
  const makeAdmin = bootstrapAdmins().includes(email);
  const name = p.name.trim().slice(0, 120) || email.split('@')[0];

  if (!hasDb) {
    const d = demo();
    let u = d.users.find((x) => x.email === email);
    if (!u) {
      u = { id: d.nextId++, name, email, role: makeAdmin ? 'admin' : 'customer', isActive: true, picture: p.picture, nickname: p.givenName ?? null };
      d.users.push(u);
    } else {
      if (!u.isActive) return { ok: false, reason: 'disabled' };
      u.picture = p.picture ?? u.picture ?? null;
      u.nickname = p.givenName ?? u.nickname ?? null;
      if (makeAdmin) u.role = 'admin';
    }
    u.lastLoginAt = new Date().toISOString();
    return { ok: true, account: toAccount(u, await membershipOf(email)) };
  }

  const rows = await q<Row>(
    `INSERT INTO users (name, email, role, google_sub, picture, nickname, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $7, now())
     ON CONFLICT (email) DO UPDATE
       SET google_sub = EXCLUDED.google_sub,
           picture = COALESCE(EXCLUDED.picture, users.picture),
           nickname = COALESCE(EXCLUDED.nickname, users.nickname),
           last_login_at = now(),
           role = CASE WHEN $6::boolean THEN 'admin' ELSE users.role END,
           -- keep names the committee typed for judges; refresh everyone else's from Google
           name = CASE WHEN users.role = 'customer' THEN EXCLUDED.name ELSE users.name END
     RETURNING id, name, email, role, is_active, picture, staff_id, nickname`,
    [name, email, makeAdmin ? 'admin' : 'customer', p.sub, p.picture, makeAdmin, p.givenName?.trim().slice(0, 60) || null],
  );
  const u = rows[0];
  if (!u.is_active) return { ok: false, reason: 'disabled' };
  return {
    ok: true,
    account: toAccount(
      { id: u.id, name: u.name, email: u.email, role: u.role, isActive: true, picture: u.picture, staffId: u.staff_id, nickname: u.nickname },
      await membershipOf(email),
    ),
  };
}

/** Demo only: sign in as a sample person without UTHM SSO. */
export async function demoAccount(email: string): Promise<Account | null> {
  if (hasDb) return null;
  const u = demo().users.find((x) => x.email === email && x.isActive);
  return u ? toAccount(u, await membershipOf(u.email)) : null;
}

/** Staff can give their staff ID so their UTHM Community photo shows. */
export async function setStaffId(userId: number, staffId: string | null): Promise<void> {
  const clean = staffId && /^[A-Za-z0-9]{2,12}$/.test(staffId.trim()) ? staffId.trim().toUpperCase() : null;
  if (!hasDb) {
    const u = demo().users.find((x) => x.id === userId);
    if (u) u.staffId = clean;
    return;
  }
  await q(`UPDATE users SET staff_id = $2 WHERE id = $1`, [userId, clean]);
}

/** How many people have signed in (for the admin overview). */
export async function accountCounts(): Promise<{ customers: number; sellers: number; signedIn: number }> {
  if (!hasDb) {
    const d = demo();
    return {
      customers: d.users.filter((u) => u.role === 'customer').length,
      sellers: Object.keys(d.members).length,
      signedIn: d.users.filter((u) => u.lastLoginAt).length,
    };
  }
  const rows = await q<Row>(
    `SELECT COUNT(*) FILTER (WHERE role = 'customer')::int AS customers,
            COUNT(*) FILTER (WHERE last_login_at IS NOT NULL)::int AS signed_in,
            (SELECT COUNT(*)::int FROM stall_members) AS sellers
     FROM users`,
  );
  return { customers: rows[0].customers, sellers: rows[0].sellers, signedIn: rows[0].signed_in };
}

// ---------------------------------------------------------------------------
// Stall teams
// ---------------------------------------------------------------------------

export const MAX_TEAM = 10;

/** Members of every stall team: stall number -> members, leader first. */
export async function teamsByStall(): Promise<Record<number, StallMember[]>> {
  const out: Record<number, StallMember[]> = {};
  if (!hasDb) {
    const d = demo();
    for (const [email, m] of Object.entries(d.members)) {
      const u = d.users.find((x) => x.email === email);
      (out[m.stall] ??= []).push({
        email,
        name: u?.name ?? null,
        isLeader: m.isLeader,
        photos: photoCandidates(email, { staffId: u?.staffId, google: u?.picture }),
        joined: Boolean(u),
        addedAt: m.addedAt ?? null,
        lastSeen: u?.lastLoginAt ?? null,
      });
    }
  } else {
    const rows = await q<Row>(
      `SELECT s.number, m.email, m.is_leader, m.added_at, u.name, u.picture, u.staff_id, u.last_login_at, (u.id IS NOT NULL) AS joined
       FROM stall_members m
       JOIN stalls s ON s.id = m.stall_id
       LEFT JOIN users u ON u.email = m.email
       ORDER BY s.number, m.is_leader DESC, m.added_at`,
    );
    for (const r of rows) {
      (out[r.number] ??= []).push({
        email: r.email,
        name: r.name,
        isLeader: r.is_leader,
        photos: photoCandidates(r.email, { staffId: r.staff_id, google: r.picture }),
        joined: r.joined,
        addedAt: r.added_at ? iso(r.added_at) : null,
        lastSeen: r.last_login_at ? iso(r.last_login_at) : null,
      });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => Number(b.isLeader) - Number(a.isLeader));
  return out;
}

export async function teamOf(stallNumber: number): Promise<StallMember[]> {
  return (await teamsByStall())[stallNumber] ?? [];
}

/** Add someone to a stall team by their UTHM email. One stall per person. */
export async function addMember(stallNumber: number, emailRaw: string, opts: { isLeader?: boolean; addedBy: string }): Promise<SaveResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!isUthmEmail(email)) return { ok: false, error: `${email || 'That'} is not an official UTHM email (@student.uthm.edu.my or @uthm.edu.my).` };
  const team = await teamOf(stallNumber);
  if (team.some((m) => m.email === email)) return { ok: true };
  if (team.length >= MAX_TEAM) return { ok: false, error: `A stall team can have up to ${MAX_TEAM} people.` };
  const other = await membershipOf(email);
  if (other) return { ok: false, error: `${email} is already on the team for stall ${other.stall}.` };

  if (!hasDb) {
    const d = demo();
    if (!d.stalls.some((s) => s.number === stallNumber)) return { ok: false, error: 'That stall does not exist.' };
    if (opts.isLeader) for (const m of Object.values(d.members)) if (m.stall === stallNumber) m.isLeader = false;
    d.members[email] = { stall: stallNumber, isLeader: Boolean(opts.isLeader), addedBy: opts.addedBy, addedAt: new Date().toISOString() };
    return { ok: true };
  }
  return tx(async (c) => {
    const st = await c.query(`SELECT id FROM stalls WHERE number = $1`, [stallNumber]);
    if (!st.rows[0]) return { ok: false as const, error: 'That stall does not exist.' };
    if (opts.isLeader) await c.query(`UPDATE stall_members SET is_leader = FALSE WHERE stall_id = $1`, [st.rows[0].id]);
    try {
      await c.query(`INSERT INTO stall_members (email, stall_id, is_leader, added_by) VALUES ($1, $2, $3, $4)`, [
        email,
        st.rows[0].id,
        Boolean(opts.isLeader),
        opts.addedBy,
      ]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return { ok: false as const, error: `${email} is already on a stall team.` };
      throw err;
    }
    return { ok: true as const };
  });
}

export async function removeMember(stallNumber: number, emailRaw: string): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  if (!hasDb) {
    const d = demo();
    if (d.members[email]?.stall !== stallNumber) return false;
    delete d.members[email];
    return true;
  }
  const rows = await q(
    `DELETE FROM stall_members m USING stalls s WHERE m.stall_id = s.id AND s.number = $1 AND m.email = $2 RETURNING m.email`,
    [stallNumber, email],
  );
  return rows.length > 0;
}

/** Make one member the team leader (the leader manages the team). */
export async function setLeader(stallNumber: number, emailRaw: string): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  if (!hasDb) {
    const d = demo();
    if (d.members[email]?.stall !== stallNumber) return false;
    for (const [e, m] of Object.entries(d.members)) if (m.stall === stallNumber) m.isLeader = e === email;
    return true;
  }
  const rows = await q(
    `UPDATE stall_members m SET is_leader = (m.email = $2)
     FROM stalls s WHERE m.stall_id = s.id AND s.number = $1 RETURNING m.email`,
    [stallNumber, email],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Posters
// ---------------------------------------------------------------------------

export const POSTER_MAX_BYTES = 3 * 1024 * 1024;

/** The image type of a file, judged by its first bytes (not by what the browser claimed). */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export async function savePoster(stallNumber: number, data: Buffer, type: string): Promise<boolean> {
  if (!hasDb) {
    const d = demo();
    const s = d.stalls.find((x) => x.number === stallNumber);
    if (!s) return false;
    const updatedAt = new Date().toISOString();
    d.posters[String(stallNumber)] = { data, type, updatedAt };
    s.posterVersion = String(Date.parse(updatedAt));
    return true;
  }
  const rows = await q(
    `UPDATE stalls SET poster = $2, poster_type = $3, poster_updated_at = now(), updated_at = now() WHERE number = $1 RETURNING id`,
    [stallNumber, data, type],
  );
  return rows.length > 0;
}

export async function deletePoster(stallNumber: number): Promise<void> {
  if (!hasDb) {
    const d = demo();
    delete d.posters[String(stallNumber)];
    const s = d.stalls.find((x) => x.number === stallNumber);
    if (s) s.posterVersion = null;
    return;
  }
  await q(`UPDATE stalls SET poster = NULL, poster_type = NULL, poster_updated_at = NULL WHERE number = $1`, [stallNumber]);
}

export async function getPoster(stallNumber: number): Promise<{ data: Buffer; type: string; updatedAt: string } | null> {
  if (!hasDb) return demo().posters[String(stallNumber)] ?? null;
  const rows = await q<Row>(`SELECT poster, poster_type, poster_updated_at FROM stalls WHERE number = $1 AND poster IS NOT NULL`, [stallNumber]);
  const r = rows[0];
  return r ? { data: r.poster, type: r.poster_type, updatedAt: iso(r.poster_updated_at) } : null;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** Newest first, pinned on top. Pass the viewer's role to include seller-only or judge-only notes. */
export async function listAnnouncements(viewer: Role | 'all' | null = null): Promise<Announcement[]> {
  const audiences = new Set<string>(['everyone']);
  if (viewer === 'seller' || viewer === 'admin' || viewer === 'all') audiences.add('sellers');
  if (viewer === 'judge' || viewer === 'admin' || viewer === 'all') audiences.add('judges');
  let list: Announcement[];
  if (!hasDb) {
    list = [...demo().announcements];
  } else {
    const rows = await q<Row>(`SELECT id, title, body, audience, pinned, created_at FROM announcements`);
    list = rows.map((r) => ({ id: r.id, title: r.title, body: r.body, audience: r.audience, pinned: r.pinned, createdAt: iso(r.created_at) }));
  }
  return list
    .filter((a) => audiences.has(a.audience))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export async function createAnnouncement(a: { title: string; body: string; audience: Announcement['audience']; pinned: boolean; by: string }): Promise<void> {
  if (!hasDb) {
    const d = demo();
    d.announcements.push({ id: d.nextId++, title: a.title, body: a.body, audience: a.audience, pinned: a.pinned, createdAt: new Date().toISOString() });
    return;
  }
  await q(`INSERT INTO announcements (title, body, audience, pinned, created_by) VALUES ($1, $2, $3, $4, $5)`, [a.title, a.body, a.audience, a.pinned, a.by]);
}

export async function deleteAnnouncement(id: number): Promise<void> {
  if (!hasDb) {
    const d = demo();
    d.announcements = d.announcements.filter((a) => a.id !== id);
    return;
  }
  await q(`DELETE FROM announcements WHERE id = $1`, [id]);
}

export async function setAnnouncementPinned(id: number, pinned: boolean): Promise<void> {
  if (!hasDb) {
    const a = demo().announcements.find((x) => x.id === id);
    if (a) a.pinned = pinned;
    return;
  }
  await q(`UPDATE announcements SET pinned = $2 WHERE id = $1`, [id, pinned]);
}

// ---------------------------------------------------------------------------
// Jury allocations: which stalls each judge must judge
// ---------------------------------------------------------------------------

/** competition id -> stall numbers, for one judge. A competition missing here means "any stall". */
export async function allocationsFor(judgeId: number): Promise<Record<string, number[]>> {
  if (!hasDb) return { ...(demo().judgeStalls[String(judgeId)] ?? {}) };
  const rows = await q<Row>(
    `SELECT j.competition_id, array_agg(s.number ORDER BY s.number) AS stalls
     FROM judge_stalls j JOIN stalls s ON s.id = j.stall_id
     WHERE j.judge_id = $1 GROUP BY j.competition_id`,
    [judgeId],
  );
  return Object.fromEntries(rows.map((r) => [String(r.competition_id), r.stalls]));
}

/** judge id -> competition id -> stall numbers, for the admin console. */
export async function allAllocations(): Promise<Record<string, Record<string, number[]>>> {
  if (!hasDb) return JSON.parse(JSON.stringify(demo().judgeStalls));
  const rows = await q<Row>(
    `SELECT j.judge_id, j.competition_id, array_agg(s.number ORDER BY s.number) AS stalls
     FROM judge_stalls j JOIN stalls s ON s.id = j.stall_id GROUP BY j.judge_id, j.competition_id`,
  );
  const out: Record<string, Record<string, number[]>> = {};
  for (const r of rows) (out[String(r.judge_id)] ??= {})[String(r.competition_id)] = r.stalls;
  return out;
}

export async function setAllocation(judgeId: number, competitionId: number, stallNumbers: number[]): Promise<void> {
  const unique = [...new Set(stallNumbers.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!hasDb) {
    const d = demo();
    const mine = (d.judgeStalls[String(judgeId)] ??= {});
    if (unique.length) mine[String(competitionId)] = unique;
    else delete mine[String(competitionId)];
    return;
  }
  await tx(async (c) => {
    await c.query(`DELETE FROM judge_stalls WHERE judge_id = $1 AND competition_id = $2`, [judgeId, competitionId]);
    if (unique.length) {
      await c.query(
        `INSERT INTO judge_stalls (judge_id, competition_id, stall_id)
         SELECT $1, $2, s.id FROM stalls s WHERE s.number = ANY($3::int[])`,
        [judgeId, competitionId, unique],
      );
    }
  });
}

/**
 * Share a competition's stalls among the given judges so each stall gets `perStall` judges,
 * spreading the load as evenly as possible. Replaces existing allocations for that competition.
 */
export function planAllocation(judgeIds: number[], stallNumbers: number[], perStall: number): Record<number, number[]> {
  const plan: Record<number, number[]> = Object.fromEntries(judgeIds.map((id) => [id, []]));
  if (judgeIds.length === 0) return plan;
  const k = Math.max(1, Math.min(perStall, judgeIds.length));
  let next = 0;
  for (const n of [...stallNumbers].sort((a, b) => a - b)) {
    for (let j = 0; j < k; j++) plan[judgeIds[(next + j) % judgeIds.length]].push(n);
    next = (next + k) % judgeIds.length;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// What someone has done so far, for their Me page.
// ---------------------------------------------------------------------------

export interface Activity {
  /** Stalls they liked (People Choice). */
  likes: number;
  /** Stalls they rated with stars. */
  rated: number;
  /** Score sheets saved, for juries. */
  scored: number;
}

export async function activityOf(uid: number): Promise<Activity> {
  const voter = `u:${uid}`;
  if (!hasDb) {
    const d = demo();
    return {
      likes: Object.values(d.votes).filter((v) => v[voter] === true).length,
      rated: Object.values(d.ratings).filter((r) => r[voter]).length,
      scored: d.submissions.filter((s) => s.judgeId === uid).length,
    };
  }
  const [r] = await q<{ likes: number; rated: number; scored: number }>(
    `SELECT (SELECT count(*) FROM customer_votes WHERE voter = $1 AND liked)::int AS likes,
            (SELECT count(DISTINCT stall_id) FROM customer_ratings WHERE voter = $1)::int AS rated,
            (SELECT count(*) FROM submissions WHERE judge_id = $2)::int AS scored`,
    [voter, uid],
  );
  return r ?? { likes: 0, rated: 0, scored: 0 };
}

// ---------------------------------------------------------------------------
// Every account, for the admin console's Users tab.
// ---------------------------------------------------------------------------

export async function listUsers(): Promise<UserRow[]> {
  if (!hasDb) {
    const d = demo();
    return d.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      stall: d.members[u.email]?.stall ?? null,
      isLeader: d.members[u.email]?.isLeader ?? false,
      lastLoginAt: u.lastLoginAt ?? null,
      photos: photoCandidates(u.email, { staffId: u.staffId, google: u.picture }),
      scored: d.submissions.filter((x) => x.judgeId === u.id).length,
    }));
  }
  const rows = await q<Row>(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_login_at, u.picture, u.staff_id, s.number AS stall, m.is_leader,
            (SELECT count(*)::int FROM submissions x WHERE x.judge_id = u.id) AS scored
     FROM users u
     LEFT JOIN stall_members m ON m.email = u.email
     LEFT JOIN stalls s ON s.id = m.stall_id
     ORDER BY u.last_login_at DESC NULLS LAST, u.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    isActive: r.is_active,
    stall: r.stall ?? null,
    isLeader: Boolean(r.is_leader),
    lastLoginAt: r.last_login_at ? iso(r.last_login_at) : null,
    photos: photoCandidates(r.email, { staffId: r.staff_id, google: r.picture }),
    scored: r.scored ?? 0,
  }));
}

/** Change an account's role or switch it on or off. Returns the account before the change, or null if unknown. */
export async function setUserAccess(
  id: number,
  patch: { role?: 'admin' | 'judge' | 'customer'; isActive?: boolean },
): Promise<{ email: string; name: string; role: string; isActive: boolean } | null> {
  if (!hasDb) {
    const u = demo().users.find((x) => x.id === id);
    if (!u) return null;
    const before = { email: u.email, name: u.name, role: u.role, isActive: u.isActive };
    if (patch.role) u.role = patch.role;
    if (patch.isActive !== undefined) u.isActive = patch.isActive;
    return before;
  }
  const rows = await q<Row>(`SELECT email, name, role, is_active FROM users WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  await q(`UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active) WHERE id = $1`, [id, patch.role ?? null, patch.isActive ?? null]);
  return { email: rows[0].email, name: rows[0].name, role: rows[0].role, isActive: rows[0].is_active };
}

// ---------------------------------------------------------------------------
// Company logos (optional), stored like posters
// ---------------------------------------------------------------------------

export const LOGO_MAX_BYTES = 1024 * 1024;

export async function saveLogo(stallNumber: number, data: Buffer, type: string): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  if (!hasDb) {
    const d = demo();
    const s = d.stalls.find((x) => x.number === stallNumber);
    if (!s) return false;
    d.logos[String(stallNumber)] = { data, type, updatedAt };
    s.logoVersion = String(Date.parse(updatedAt));
    return true;
  }
  const rows = await q<Row>(
    `UPDATE stalls SET logo = $2, logo_type = $3, logo_updated_at = now(), updated_at = now() WHERE number = $1 RETURNING id`,
    [stallNumber, data, type],
  );
  return rows.length > 0;
}

export async function deleteLogo(stallNumber: number): Promise<void> {
  if (!hasDb) {
    const d = demo();
    delete d.logos[String(stallNumber)];
    const s = d.stalls.find((x) => x.number === stallNumber);
    if (s) s.logoVersion = null;
    return;
  }
  await q(`UPDATE stalls SET logo = NULL, logo_type = NULL, logo_updated_at = NULL WHERE number = $1`, [stallNumber]);
}

export async function getLogo(stallNumber: number): Promise<{ data: Buffer; type: string; updatedAt: string } | null> {
  if (!hasDb) return demo().logos[String(stallNumber)] ?? null;
  const rows = await q<Row>(`SELECT logo, logo_type, logo_updated_at FROM stalls WHERE number = $1 AND logo IS NOT NULL`, [stallNumber]);
  const r = rows[0];
  return r ? { data: r.logo, type: r.logo_type, updatedAt: iso(r.logo_updated_at) } : null;
}
