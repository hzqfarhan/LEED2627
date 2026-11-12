// All data access goes through this file. Each function has two paths:
// PostgreSQL (when DATABASE_URL is set) or the in-memory demo store.

import { hasDb, q, tx } from './db';
import { demo } from './demo';
import {
  isAccepting,
  isComplete,
  type Competition,
  type LeaderboardRow,
  type Memory,
  type MemoryKind,
  type MemoryStatus,
  type Person,
  type Stall,
  type StallColour,
  type Submission,
  type User,
  type VoteTally,
} from './shared';
import { PENDING_EMAIL_DOMAIN } from './awards';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** Wrong PINs in a row before an account or stall is locked for 10 minutes. */
const MAX_FAILS = 5;

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

// ---------------------------------------------------------------------------
// Competitions and stalls
// ---------------------------------------------------------------------------

export async function listCompetitions(): Promise<Competition[]> {
  if (!hasDb) return demo().competitions;
  const comps = await q<Row>(
    `SELECT id, slug, name, description, is_open, opens_at, closes_at, scale_min, scale_max
     FROM competitions ORDER BY position, id`,
  );
  const crit = await q<Row>(
    `SELECT id, competition_id, position, name, description, weight::float8 AS weight, levels
     FROM criteria ORDER BY competition_id, position`,
  );
  return comps.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    isOpen: c.is_open,
    opensAt: iso(c.opens_at),
    closesAt: iso(c.closes_at),
    scaleMin: c.scale_min,
    scaleMax: c.scale_max,
    criteria: crit
      .filter((k) => k.competition_id === c.id)
      .map((k) => ({
        id: k.id,
        competitionId: k.competition_id,
        position: k.position,
        name: k.name,
        description: k.description,
        weight: k.weight,
        levels: k.levels ?? null,
      })),
  }));
}

function toStall(r: Row): Stall {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    groupName: r.group_name,
    cluster: r.cluster,
    colour: r.colour,
    description: r.description,
    instagram: r.instagram,
    pitchUrl: r.pitch_url,
    promoUrls: r.promo_urls ?? [],
    hasPin: Boolean(r.has_pin),
  };
}

export async function listStalls(): Promise<Stall[]> {
  if (!hasDb) return demo().stalls;
  const rows = await q<Row>(
    `SELECT id, number, name, group_name, cluster, colour, description, instagram, pitch_url, promo_urls,
            (pin_hash IS NOT NULL) AS has_pin
     FROM stalls ORDER BY number`,
  );
  return rows.map(toStall);
}

export interface StallPatch {
  name: string;
  groupName: string | null;
  cluster: string | null;
  /** Leave undefined to keep the current canopy colour (stall teams cannot change it). */
  colour?: StallColour | null;
  description: string | null;
  instagram: string | null;
  pitchUrl: string | null;
  promoUrls: string[];
}

export async function updateStall(number: number, p: StallPatch): Promise<boolean> {
  const promoUrls = p.promoUrls.slice(0, 3);
  if (!hasDb) {
    const s = demo().stalls.find((x) => x.number === number);
    if (!s) return false;
    const { colour, ...rest } = p;
    Object.assign(s, rest, { promoUrls });
    if (colour !== undefined) s.colour = colour;
    return true;
  }
  const rows = await q(
    `UPDATE stalls SET name = $2, group_name = $3, cluster = $4,
            colour = CASE WHEN $5::boolean THEN $6 ELSE colour END,
            description = $7, instagram = $8, pitch_url = $9, promo_urls = $10::text[], updated_at = now()
     WHERE number = $1 RETURNING id`,
    [number, p.name, p.groupName, p.cluster, p.colour !== undefined, p.colour ?? null, p.description, p.instagram, p.pitchUrl, promoUrls],
  );
  return rows.length > 0;
}

/** Create or replace stall team PINs. */
export async function setStallPins(pairs: { number: number; pin: string }[]): Promise<void> {
  if (pairs.length === 0) return;
  if (!hasDb) {
    const d = demo();
    for (const { number, pin } of pairs) {
      d.stallPins[String(number)] = pin;
      const s = d.stalls.find((x) => x.number === number);
      if (s) s.hasPin = true;
    }
    return;
  }
  await q(
    `UPDATE stalls s
     SET pin_hash = crypt(v.pin, gen_salt('bf')), pin_fails = 0, pin_locked_until = NULL
     FROM unnest($1::int[], $2::text[]) AS v(number, pin)
     WHERE s.number = v.number`,
    [pairs.map((x) => x.number), pairs.map((x) => x.pin)],
  );
}

export type StallLoginResult = { ok: true; number: number; name: string } | { ok: false; reason: 'invalid' | 'locked' };

export async function verifyStallLogin(number: number, pin: string): Promise<StallLoginResult> {
  if (!hasDb) {
    const d = demo();
    const s = d.stalls.find((x) => x.number === number);
    if (!s || d.stallPins[String(number)] !== pin) return { ok: false, reason: 'invalid' };
    return { ok: true, number: s.number, name: s.name };
  }
  const found = await q<Row>(
    `SELECT id, number, name,
            (pin_locked_until IS NOT NULL AND pin_locked_until > now()) AS locked,
            (pin_hash = crypt($2, pin_hash)) AS pin_ok
     FROM stalls WHERE number = $1 AND pin_hash IS NOT NULL`,
    [number, pin],
  );
  const s = found[0];
  if (!s) return { ok: false, reason: 'invalid' };
  if (s.locked) return { ok: false, reason: 'locked' };
  if (!s.pin_ok) {
    await q(
      `UPDATE stalls
       SET pin_fails = pin_fails + 1,
           pin_locked_until = CASE WHEN pin_fails + 1 >= $2 THEN now() + interval '10 minutes' ELSE pin_locked_until END
       WHERE id = $1`,
      [s.id, MAX_FAILS],
    );
    return { ok: false, reason: 'invalid' };
  }
  await q(`UPDATE stalls SET pin_fails = 0, pin_locked_until = NULL WHERE id = $1`, [s.id]);
  return { ok: true, number: s.number, name: s.name };
}

/** How many judges have scored a stall in each competition (counts only, never the scores). */
export async function stallCoverage(number: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!hasDb) {
    for (const s of demo().submissions) {
      if (s.stallNumber === number) out[String(s.competitionId)] = (out[String(s.competitionId)] ?? 0) + 1;
    }
    return out;
  }
  const rows = await q<Row>(
    `SELECT s.competition_id, COUNT(*)::int AS n
     FROM submissions s JOIN stalls st ON st.id = s.stall_id
     WHERE st.number = $1 GROUP BY s.competition_id`,
    [number],
  );
  for (const r of rows) out[String(r.competition_id)] = r.n;
  return out;
}

export async function getResultsPublished(): Promise<boolean> {
  if (!hasDb) return demo().resultsPublished;
  const rows = await q<Row>(`SELECT value FROM settings WHERE key = 'results_published'`);
  return rows[0]?.value === 'true';
}

export async function setResultsPublished(published: boolean): Promise<void> {
  if (!hasDb) {
    demo().resultsPublished = published;
    return;
  }
  await q(
    `INSERT INTO settings (key, value) VALUES ('results_published', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [published ? 'true' : 'false'],
  );
}

export async function setCompetitionOpen(id: number, isOpen: boolean): Promise<void> {
  if (!hasDb) {
    const c = demo().competitions.find((x) => x.id === id);
    if (c) c.isOpen = isOpen;
    return;
  }
  await q(`UPDATE competitions SET is_open = $2 WHERE id = $1`, [id, isOpen]);
}

// ---------------------------------------------------------------------------
// Sign-in and people
// ---------------------------------------------------------------------------

export type LoginResult = { ok: true; user: User } | { ok: false; reason: 'invalid' | 'locked' };

export async function verifyLogin(emailRaw: string, pin: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!hasDb) {
    const u = demo().users.find((x) => x.email === email && x.isActive && x.pin === pin);
    if (!u) return { ok: false, reason: 'invalid' };
    return { ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role, isActive: true } };
  }
  const found = await q<Row>(
    `SELECT id, name, email, role,
            (locked_until IS NOT NULL AND locked_until > now()) AS locked,
            (pin_hash = crypt($2, pin_hash)) AS pin_ok
     FROM users WHERE email = $1 AND is_active`,
    [email, pin],
  );
  const u = found[0];
  if (!u) return { ok: false, reason: 'invalid' };
  if (u.locked) return { ok: false, reason: 'locked' };
  if (!u.pin_ok) {
    await q(
      `UPDATE users
       SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + interval '10 minutes' ELSE locked_until END
       WHERE id = $1`,
      [u.id, MAX_FAILS],
    );
    return { ok: false, reason: 'invalid' };
  }
  await q(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [u.id]);
  return { ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role, isActive: true } };
}

export async function listPeople(): Promise<Person[]> {
  if (!hasDb) {
    const d = demo();
    return d.users.map((u) => {
      const scored: Record<string, number> = {};
      for (const s of d.submissions) {
        if (s.judgeId === u.id) scored[String(s.competitionId)] = (scored[String(s.competitionId)] ?? 0) + 1;
      }
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        assigned: d.assignments.filter((a) => a.judgeId === u.id).map((a) => a.competitionId),
        scored,
      };
    });
  }
  const rows = await q<Row>(
    `SELECT u.id, u.name, u.email, u.role, u.is_active,
            COALESCE((SELECT jsonb_agg(a.competition_id ORDER BY a.competition_id)
                      FROM judge_assignments a WHERE a.judge_id = u.id), '[]'::jsonb) AS assigned,
            COALESCE((SELECT jsonb_object_agg(x.competition_id, x.n)
                      FROM (SELECT competition_id, COUNT(*)::int AS n
                            FROM submissions WHERE judge_id = u.id GROUP BY competition_id) x), '{}'::jsonb) AS scored
     FROM users u ORDER BY u.role, u.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    isActive: r.is_active,
    assigned: r.assigned,
    scored: r.scored,
  }));
}

export async function assignmentsFor(judgeId: number): Promise<number[]> {
  if (!hasDb) {
    const d = demo();
    const u = d.users.find((x) => x.id === judgeId);
    if (!u || !u.isActive) return [];
    return d.assignments.filter((a) => a.judgeId === judgeId).map((a) => a.competitionId);
  }
  const rows = await q<Row>(
    `SELECT a.competition_id FROM judge_assignments a
     JOIN users u ON u.id = a.judge_id AND u.is_active
     WHERE a.judge_id = $1 ORDER BY a.competition_id`,
    [judgeId],
  );
  return rows.map((r) => r.competition_id);
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function createPerson(input: {
  name: string;
  email: string;
  pin: string;
  role: User['role'];
  assigned: number[];
}): Promise<SaveResult> {
  const email = input.email.trim().toLowerCase();
  if (!hasDb) {
    const d = demo();
    if (d.users.some((u) => u.email === email)) return { ok: false, error: 'That email already has an account.' };
    const id = d.nextId++;
    d.users.push({ id, name: input.name, email, pin: input.pin, role: input.role, isActive: true });
    for (const competitionId of input.assigned) d.assignments.push({ judgeId: id, competitionId });
    return { ok: true };
  }
  try {
    await tx(async (c) => {
      const res = await c.query(
        `INSERT INTO users (name, email, pin_hash, role) VALUES ($1, $2, crypt($3, gen_salt('bf')), $4) RETURNING id`,
        [input.name, email, input.pin, input.role],
      );
      const id = res.rows[0].id as number;
      if (input.assigned.length) {
        await c.query(
          `INSERT INTO judge_assignments (judge_id, competition_id) SELECT $1, unnest($2::int[])`,
          [id, input.assigned],
        );
      }
    });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return { ok: false, error: 'That email already has an account.' };
    throw err;
  }
}

export async function updatePerson(
  id: number,
  patch: { isActive?: boolean; pin?: string; assigned?: number[]; name?: string; email?: string },
): Promise<SaveResult> {
  const email = patch.email?.trim().toLowerCase();
  if (!hasDb) {
    const d = demo();
    if (email && d.users.some((u) => u.email === email && u.id !== id)) return { ok: false, error: 'That email already has an account.' };
    const u = d.users.find((x) => x.id === id);
    if (u) {
      if (patch.name) u.name = patch.name;
      if (email) u.email = email;
    }
  } else if (patch.name || email) {
    try {
      await q(`UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email) WHERE id = $1`, [id, patch.name ?? null, email ?? null]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return { ok: false, error: 'That email already has an account.' };
      throw err;
    }
  }
  await updatePersonAccess(id, patch);
  return { ok: true };
}

async function updatePersonAccess(id: number, patch: { isActive?: boolean; pin?: string; assigned?: number[] }): Promise<void> {
  if (!hasDb) {
    const d = demo();
    const u = d.users.find((x) => x.id === id);
    if (!u) return;
    if (patch.isActive !== undefined) u.isActive = patch.isActive;
    if (patch.pin) u.pin = patch.pin;
    if (patch.assigned) {
      d.assignments = d.assignments.filter((a) => a.judgeId !== id);
      for (const competitionId of patch.assigned) d.assignments.push({ judgeId: id, competitionId });
    }
    return;
  }
  await tx(async (c) => {
    if (patch.isActive !== undefined) await c.query(`UPDATE users SET is_active = $2 WHERE id = $1`, [id, patch.isActive]);
    if (patch.pin) {
      await c.query(
        `UPDATE users SET pin_hash = crypt($2, gen_salt('bf')), failed_logins = 0, locked_until = NULL WHERE id = $1`,
        [id, patch.pin],
      );
    }
    if (patch.assigned) {
      await c.query(`DELETE FROM judge_assignments WHERE judge_id = $1`, [id]);
      if (patch.assigned.length) {
        await c.query(
          `INSERT INTO judge_assignments (judge_id, competition_id) SELECT $1, unnest($2::int[])`,
          [id, patch.assigned],
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export async function submissionsFor(judgeId: number): Promise<Submission[]> {
  if (!hasDb) return demo().submissions.filter((s) => s.judgeId === judgeId);
  const rows = await q<Row>(
    `SELECT s.judge_id, s.competition_id, st.number AS stall_number, s.comment, s.updated_at,
            COALESCE(jsonb_object_agg(ss.criterion_id, ss.score) FILTER (WHERE ss.criterion_id IS NOT NULL),
                     '{}'::jsonb) AS scores
     FROM submissions s
     JOIN stalls st ON st.id = s.stall_id
     LEFT JOIN submission_scores ss ON ss.submission_id = s.id
     WHERE s.judge_id = $1
     GROUP BY s.id, s.judge_id, s.competition_id, st.number, s.comment, s.updated_at`,
    [judgeId],
  );
  return rows.map((r) => ({
    judgeId: r.judge_id,
    competitionId: r.competition_id,
    stallNumber: r.stall_number,
    comment: r.comment,
    updatedAt: iso(r.updated_at) ?? '',
    scores: r.scores,
  }));
}

export async function saveSubmission(input: {
  judgeId: number;
  competitionId: number;
  stallNumber: number;
  scores: Record<string, number>;
  comment: string | null;
}): Promise<SaveResult> {
  const competitions = await listCompetitions();
  const comp = competitions.find((c) => c.id === input.competitionId);
  if (!comp) return { ok: false, error: 'That competition does not exist.' };
  if (!isAccepting(comp)) return { ok: false, error: `Judging for the ${comp.name} is closed.` };

  const assigned = await assignmentsFor(input.judgeId);
  if (!assigned.includes(comp.id)) return { ok: false, error: `You are not assigned to judge the ${comp.name}.` };

  if (!isComplete(comp, input.scores)) {
    return { ok: false, error: `Give every criterion a score from ${comp.scaleMin} to ${comp.scaleMax}.` };
  }
  // Keep only this competition's criteria; ignore anything else the client sent.
  const clean: Record<string, number> = {};
  for (const k of comp.criteria) clean[String(k.id)] = input.scores[String(k.id)];
  const comment = input.comment?.trim() ? input.comment.trim().slice(0, 1000) : null;

  if (!hasDb) {
    const d = demo();
    if (!d.stalls.some((s) => s.number === input.stallNumber)) return { ok: false, error: 'That stall does not exist.' };
    d.submissions = d.submissions.filter(
      (s) => !(s.judgeId === input.judgeId && s.competitionId === comp.id && s.stallNumber === input.stallNumber),
    );
    d.submissions.push({
      judgeId: input.judgeId,
      competitionId: comp.id,
      stallNumber: input.stallNumber,
      comment,
      updatedAt: new Date().toISOString(),
      scores: clean,
    });
    return { ok: true };
  }

  const stall = await q<Row>(`SELECT id FROM stalls WHERE number = $1`, [input.stallNumber]);
  if (!stall[0]) return { ok: false, error: 'That stall does not exist.' };
  const stallId = stall[0].id as number;

  await tx(async (c) => {
    const res = await c.query(
      `INSERT INTO submissions (judge_id, competition_id, stall_id, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (judge_id, competition_id, stall_id)
       DO UPDATE SET comment = EXCLUDED.comment, updated_at = now()
       RETURNING id`,
      [input.judgeId, comp.id, stallId, comment],
    );
    const submissionId = res.rows[0].id as number;
    await c.query(
      `INSERT INTO submission_scores (submission_id, criterion_id, score)
       SELECT $1, e.key::int, e.value::int FROM jsonb_each_text($2::jsonb) AS e
       ON CONFLICT (submission_id, criterion_id) DO UPDATE SET score = EXCLUDED.score`,
      [submissionId, JSON.stringify(clean)],
    );
    await c.query(
      `INSERT INTO score_audit (judge_id, competition_id, stall_id, scores, comment) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [input.judgeId, comp.id, stallId, JSON.stringify(clean), comment],
    );
  });
  return { ok: true };
}

/** competitionId -> ranked rows */
export async function leaderboards(): Promise<Record<string, LeaderboardRow[]>> {
  const out: Record<string, LeaderboardRow[]> = {};
  if (!hasDb) {
    const d = demo();
    for (const comp of d.competitions) {
      const byStall = new Map<number, Submission[]>();
      for (const s of d.submissions) {
        if (s.competitionId !== comp.id) continue;
        byStall.set(s.stallNumber, [...(byStall.get(s.stallNumber) ?? []), s]);
      }
      const rows: LeaderboardRow[] = [];
      for (const [stallNumber, subs] of byStall) {
        const stall = d.stalls.find((x) => x.number === stallNumber);
        if (!stall) continue;
        const totals = subs.map((s) => comp.criteria.reduce((sum, k) => sum + (s.scores[String(k.id)] ?? 0) * k.weight, 0));
        const criteria: Record<string, number> = {};
        for (const k of comp.criteria) {
          criteria[String(k.id)] = subs.reduce((sum, s) => sum + (s.scores[String(k.id)] ?? 0), 0) / subs.length;
        }
        rows.push({
          stallNumber,
          stallName: stall.name,
          colour: stall.colour,
          judges: subs.length,
          average: Math.round((totals.reduce((a, b) => a + b, 0) / subs.length) * 100) / 100,
          rank: 0,
          criteria,
        });
      }
      rows.sort((a, b) => b.average - a.average || a.stallNumber - b.stallNumber);
      rows.forEach((r, i) => {
        r.rank = i > 0 && rows[i - 1].average === r.average ? rows[i - 1].rank : i + 1;
      });
      out[String(comp.id)] = rows;
    }
    return out;
  }
  const rows = await q<Row>(
    `SELECT competition_id, stall_id, stall_number, stall_name, colour, judges, average, rank
     FROM v_leaderboard ORDER BY competition_id, rank, stall_number`,
  );
  const crit = await q<Row>(
    `SELECT s.competition_id, s.stall_id, ss.criterion_id, AVG(ss.score)::float8 AS avg
     FROM submissions s JOIN submission_scores ss ON ss.submission_id = s.id
     GROUP BY s.competition_id, s.stall_id, ss.criterion_id`,
  );
  const critMap = new Map<string, Record<string, number>>();
  for (const c of crit) {
    const key = `${c.competition_id}:${c.stall_id}`;
    const rec = critMap.get(key) ?? {};
    rec[String(c.criterion_id)] = c.avg;
    critMap.set(key, rec);
  }
  for (const r of rows) {
    const key = String(r.competition_id);
    (out[key] ??= []).push({
      stallNumber: r.stall_number,
      stallName: r.stall_name,
      colour: r.colour,
      judges: r.judges,
      average: r.average,
      rank: r.rank,
      criteria: critMap.get(`${r.competition_id}:${r.stall_id}`) ?? {},
    });
  }
  return out;
}

export interface ExportRow {
  stallNumber: number;
  stallName: string;
  judge: string;
  email: string;
  comment: string | null;
  updatedAt: string;
  scores: Record<string, number>;
}

export async function exportRows(competitionId: number): Promise<ExportRow[]> {
  if (!hasDb) {
    const d = demo();
    return d.submissions
      .filter((s) => s.competitionId === competitionId)
      .map((s) => {
        const u = d.users.find((x) => x.id === s.judgeId);
        const st = d.stalls.find((x) => x.number === s.stallNumber);
        return {
          stallNumber: s.stallNumber,
          stallName: st?.name ?? '',
          judge: u?.name ?? '',
          email: u?.email ?? '',
          comment: s.comment,
          updatedAt: s.updatedAt,
          scores: s.scores,
        };
      })
      .sort((a, b) => a.stallNumber - b.stallNumber || a.judge.localeCompare(b.judge));
  }
  const rows = await q<Row>(
    `SELECT st.number AS stall_number, st.name AS stall_name, u.name AS judge, u.email, s.comment, s.updated_at,
            COALESCE(jsonb_object_agg(ss.criterion_id, ss.score) FILTER (WHERE ss.criterion_id IS NOT NULL),
                     '{}'::jsonb) AS scores
     FROM submissions s
     JOIN stalls st ON st.id = s.stall_id
     JOIN users u ON u.id = s.judge_id
     LEFT JOIN submission_scores ss ON ss.submission_id = s.id
     WHERE s.competition_id = $1
     GROUP BY s.id, st.number, st.name, u.name, u.email, s.comment, s.updated_at
     ORDER BY st.number, u.name`,
    [competitionId],
  );
  return rows.map((r) => ({
    stallNumber: r.stall_number,
    stallName: r.stall_name,
    judge: r.judge,
    email: r.email,
    comment: r.comment,
    updatedAt: iso(r.updated_at) ?? '',
    scores: r.scores,
  }));
}

// ---------------------------------------------------------------------------
// Memory wall
// ---------------------------------------------------------------------------

function toMemory(r: Row): Memory {
  return {
    id: r.id,
    kind: r.kind,
    url: r.url,
    caption: r.caption,
    author: r.author,
    year: r.year,
    likes: r.likes,
    status: r.status,
    createdAt: iso(r.created_at) ?? '',
  };
}

export async function listMemories(includeAll = false): Promise<Memory[]> {
  if (!hasDb) {
    const all = demo().memories;
    return includeAll ? all : all.filter((m) => m.status === 'approved');
  }
  const rows = await q<Row>(
    `SELECT id, kind, url, caption, author, year, likes, status, created_at
     FROM memories ${includeAll ? '' : `WHERE status = 'approved'`}
     ORDER BY id`,
  );
  return rows.map(toMemory);
}

export async function addMemory(input: {
  kind: MemoryKind;
  url: string | null;
  caption: string;
  author: string | null;
  year: number | null;
  status: MemoryStatus;
}): Promise<void> {
  if (!hasDb) {
    const d = demo();
    d.memories.push({ id: d.nextId++, likes: 0, createdAt: new Date().toISOString(), ...input });
    return;
  }
  await q(`INSERT INTO memories (kind, url, caption, author, year, status) VALUES ($1, $2, $3, $4, $5, $6)`, [
    input.kind,
    input.url,
    input.caption,
    input.author,
    input.year,
    input.status,
  ]);
}

export async function likeMemory(id: number): Promise<number | null> {
  if (!hasDb) {
    const m = demo().memories.find((x) => x.id === id && x.status === 'approved');
    if (!m) return null;
    m.likes += 1;
    return m.likes;
  }
  const rows = await q<Row>(
    `UPDATE memories SET likes = likes + 1 WHERE id = $1 AND status = 'approved' RETURNING likes`,
    [id],
  );
  return rows[0]?.likes ?? null;
}

export async function setMemoryStatus(id: number, status: MemoryStatus): Promise<void> {
  if (!hasDb) {
    const m = demo().memories.find((x) => x.id === id);
    if (m) m.status = status;
    return;
  }
  await q(`UPDATE memories SET status = $2 WHERE id = $1`, [id, status]);
}

// ---------------------------------------------------------------------------
// Judge import (CSV)
// ---------------------------------------------------------------------------

export interface ImportRow {
  name: string;
  email: string;
  pin: string;
  role: User['role'];
  /** Competition ids to assign. */
  assigned: number[];
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Create or update judges in one go. A row is matched to an existing account by email first,
 * then by name among accounts that still have a placeholder email (the preloaded panel).
 * Matched accounts get the new email and PIN, their assignments replaced, and are switched on.
 */
export async function importPeople(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const people = await listPeople();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [i, row] of rows.entries()) {
    const email = row.email.trim().toLowerCase();
    const match =
      people.find((p) => p.email === email) ??
      people.find((p) => p.email.endsWith(`@${PENDING_EMAIL_DOMAIN}`) && norm(p.name) === norm(row.name));
    try {
      if (match) {
        const res = await updatePerson(match.id, { name: row.name, email, pin: row.pin || undefined, assigned: row.assigned, isActive: true });
        if (!res.ok) result.errors.push(`Row ${i + 2} (${row.name}): ${res.error}`);
        else result.updated++;
      } else {
        if (!row.pin) {
          result.errors.push(`Row ${i + 2} (${row.name}): a new account needs a PIN.`);
          continue;
        }
        const res = await createPerson({ name: row.name, email, pin: row.pin, role: row.role, assigned: row.assigned });
        if (!res.ok) result.errors.push(`Row ${i + 2} (${row.name}): ${res.error}`);
        else result.created++;
      }
    } catch (err) {
      result.errors.push(`Row ${i + 2} (${row.name}): ${(err as Error).message}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extra stalls
// ---------------------------------------------------------------------------

/** Add the next stall number (for groups beyond the tent layout). Returns the new number. */
export async function addStall(): Promise<number> {
  if (!hasDb) {
    const d = demo();
    const number = Math.max(0, ...d.stalls.map((s) => s.number)) + 1;
    d.stalls.push({
      id: d.nextId++,
      number,
      name: `Stall ${String(number).padStart(2, '0')}`,
      groupName: null,
      cluster: null,
      colour: null,
      description: null,
      instagram: null,
      pitchUrl: null,
      promoUrls: [],
      hasPin: false,
    });
    return number;
  }
  const rows = await q<Row>(
    `INSERT INTO stalls (number, name)
     SELECT n, 'Stall ' || lpad(n::text, 2, '0') FROM (SELECT COALESCE(MAX(number), 0) + 1 AS n FROM stalls) x
     RETURNING number`,
  );
  return rows[0].number;
}

// ---------------------------------------------------------------------------
// Customer Choice Award
// ---------------------------------------------------------------------------

export async function getVotingOpen(): Promise<boolean> {
  if (!hasDb) return demo().votingOpen;
  const rows = await q<Row>(`SELECT value FROM settings WHERE key = 'voting_open'`);
  return rows[0]?.value !== 'false';
}

export async function setVotingOpen(open: boolean): Promise<void> {
  if (!hasDb) {
    demo().votingOpen = open;
    return;
  }
  await q(
    `INSERT INTO settings (key, value) VALUES ('voting_open', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [open ? 'true' : 'false'],
  );
}

/** Record (or change) one phone's vote for one stall. Returns false when the stall does not exist. */
export async function castVote(stallNumber: number, voter: string, liked: boolean): Promise<boolean> {
  if (!hasDb) {
    const d = demo();
    if (!d.stalls.some((s) => s.number === stallNumber)) return false;
    (d.votes[String(stallNumber)] ??= {})[voter] = liked;
    return true;
  }
  const rows = await q(
    `INSERT INTO customer_votes (stall_id, voter, liked)
     SELECT id, $2, $3 FROM stalls WHERE number = $1
     ON CONFLICT (stall_id, voter) DO UPDATE SET liked = EXCLUDED.liked, updated_at = now()
     RETURNING stall_id`,
    [stallNumber, voter, liked],
  );
  return rows.length > 0;
}

/** This phone's current vote for a stall: true, false, or null if it has not voted. */
export async function voteOf(stallNumber: number, voter: string): Promise<boolean | null> {
  if (!hasDb) return demo().votes[String(stallNumber)]?.[voter] ?? null;
  const rows = await q<Row>(
    `SELECT v.liked FROM customer_votes v JOIN stalls s ON s.id = v.stall_id WHERE s.number = $1 AND v.voter = $2`,
    [stallNumber, voter],
  );
  return rows[0]?.liked ?? null;
}

/** Customer Choice ranking, most likes first. Stalls with no votes are left out. */
export async function voteTallies(): Promise<VoteTally[]> {
  if (!hasDb) {
    const d = demo();
    const rows: VoteTally[] = [];
    for (const s of d.stalls) {
      const v = Object.values(d.votes[String(s.number)] ?? {});
      if (v.length === 0) continue;
      rows.push({ stallNumber: s.number, stallName: s.name, colour: s.colour, likes: v.filter(Boolean).length, dislikes: v.filter((x) => !x).length, rank: 0 });
    }
    rows.sort((a, b) => b.likes - a.likes || a.stallNumber - b.stallNumber);
    rows.forEach((r, i) => {
      r.rank = i > 0 && rows[i - 1].likes === r.likes ? rows[i - 1].rank : i + 1;
    });
    return rows;
  }
  const rows = await q<Row>(
    `SELECT stall_number, stall_name, colour, likes, dislikes, rank FROM v_customer_choice ORDER BY rank, stall_number`,
  );
  return rows.map((r) => ({
    stallNumber: r.stall_number,
    stallName: r.stall_name,
    colour: r.colour,
    likes: r.likes,
    dislikes: r.dislikes,
    rank: r.rank,
  }));
}
