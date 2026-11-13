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
  type RatingCriterion,
  type CustomerFeedback,
  type Stall,
  type StallAwardBoard,
  type StallAwardRow,
  type StallColour,
  type Submission,
  type User,
  type ViralRow,
  type VoteTally,
} from './shared';
import { allocationsFor } from './accounts';
import { AWARDS, PENDING_EMAIL_DOMAIN, STALL_AWARDS } from './awards';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

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
    ssmNumber: r.ssm_number ?? null,
    category: r.category ?? null,
    posterVersion: r.poster_updated_at ? String(new Date(r.poster_updated_at).getTime()) : null,
    logoVersion: r.logo_updated_at ? String(new Date(r.logo_updated_at).getTime()) : null,
  };
}

export async function listStalls(): Promise<Stall[]> {
  if (!hasDb) return demo().stalls;
  const rows = await q<Row>(
    `SELECT id, number, name, group_name, cluster, colour, description, instagram, pitch_url, promo_urls,
            ssm_number, category, poster_updated_at, logo_updated_at
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
  ssmNumber?: string | null;
  category?: string | null;
}

export async function updateStall(number: number, p: StallPatch): Promise<boolean> {
  const promoUrls = p.promoUrls.slice(0, 3);
  if (!hasDb) {
    const s = demo().stalls.find((x) => x.number === number);
    if (!s) return false;
    const { colour, ssmNumber, category, ...rest } = p;
    Object.assign(s, rest, { promoUrls });
    if (colour !== undefined) s.colour = colour;
    if (ssmNumber !== undefined) s.ssmNumber = ssmNumber;
    if (category !== undefined) s.category = category;
    return true;
  }
  const rows = await q(
    `UPDATE stalls SET name = $2, group_name = $3, cluster = $4,
            colour = CASE WHEN $5::boolean THEN $6 ELSE colour END,
            description = $7, instagram = $8, pitch_url = $9, promo_urls = $10::text[],
            ssm_number = CASE WHEN $11::boolean THEN $12 ELSE ssm_number END,
            category = CASE WHEN $13::boolean THEN $14 ELSE category END,
            updated_at = now()
     WHERE number = $1 RETURNING id`,
    [number, p.name, p.groupName, p.cluster, p.colour !== undefined, p.colour ?? null, p.description, p.instagram, p.pitchUrl, promoUrls,
     p.ssmNumber !== undefined, p.ssmNumber ?? null, p.category !== undefined, p.category ?? null],
  );
  return rows.length > 0;
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

export async function listPeople(): Promise<Person[]> {
  if (!hasDb) {
    const d = demo();
    return d.users.filter((u) => u.role !== 'customer').map((u) => {
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
     FROM users u WHERE u.role IN ('admin', 'judge') ORDER BY u.role, u.name`,
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
  role: User['role'];
  assigned: number[];
}): Promise<SaveResult> {
  const email = input.email.trim().toLowerCase();
  if (!hasDb) {
    const d = demo();
    if (d.users.some((u) => u.email === email)) return { ok: false, error: 'That email already has an account.' };
    const id = d.nextId++;
    const existing = d.users.find((u) => u.email === email);
    if (existing) return { ok: false, error: 'That email already has an account.' };
    d.users.push({ id, name: input.name, email, role: input.role, isActive: true });
    for (const competitionId of input.assigned) d.assignments.push({ judgeId: id, competitionId });
    return { ok: true };
  }
  try {
    await tx(async (c) => {
      const res = await c.query(
        // Someone who already signed in as a customer is promoted rather than duplicated.
        `INSERT INTO users (name, email, role) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name, is_active = TRUE
         WHERE users.role = 'customer'
         RETURNING id`,
        [input.name, email, input.role],
      );
      if (!res.rows[0]) {
        const err = new Error('duplicate') as Error & { code: string };
        err.code = '23505';
        throw err;
      }
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
  patch: { isActive?: boolean; assigned?: number[]; name?: string; email?: string; role?: User['role'] },
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

async function updatePersonAccess(id: number, patch: { isActive?: boolean; assigned?: number[]; role?: User['role'] }): Promise<void> {
  if (!hasDb) {
    const d = demo();
    const u = d.users.find((x) => x.id === id);
    if (!u) return;
    if (patch.isActive !== undefined) u.isActive = patch.isActive;
    if (patch.role) u.role = patch.role;
    if (patch.assigned) {
      d.assignments = d.assignments.filter((a) => a.judgeId !== id);
      for (const competitionId of patch.assigned) d.assignments.push({ judgeId: id, competitionId });
    }
    return;
  }
  await tx(async (c) => {
    if (patch.isActive !== undefined) await c.query(`UPDATE users SET is_active = $2 WHERE id = $1`, [id, patch.isActive]);
    if (patch.role) await c.query(`UPDATE users SET role = $2 WHERE id = $1`, [id, patch.role]);
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
  const allocated = (await allocationsFor(input.judgeId))[String(comp.id)];
  if (allocated && !allocated.includes(input.stallNumber)) {
    return { ok: false, error: `Stall ${input.stallNumber} is not on your list for the ${comp.name}. Ask the committee if it should be.` };
  }

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
  role: 'admin' | 'judge';
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
 * Matched accounts get the new email, their assignments replaced, and are switched on.
 * They then sign in with UTHM SSO using that email.
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
        const res = await updatePerson(match.id, { name: row.name, email, assigned: row.assigned, isActive: true, role: row.role });
        if (!res.ok) result.errors.push(`Row ${i + 2} (${row.name}): ${res.error}`);
        else result.updated++;
      } else {
        const res = await createPerson({ name: row.name, email, role: row.role, assigned: row.assigned });
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
      ssmNumber: null,
      category: null,
      posterVersion: null,
      logoVersion: null,
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
// People Choice Award (likes)
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

/** People Choice ranking, most likes first. Stalls with no votes are left out. */
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

// ---------------------------------------------------------------------------
// Customer ratings of the stall elements (the customer half of the stall awards)
// ---------------------------------------------------------------------------

const rankBy = <T extends { rank: number }>(rows: T[], key: (r: T) => number) => {
  rows.forEach((r, i) => {
    r.rank = i > 0 && key(rows[i - 1]) === key(r) ? rows[i - 1].rank : i + 1;
  });
};

/** The Stall Competition elements visitors rate, with the question shown to them. */
export async function ratingCriteria(): Promise<RatingCriterion[]> {
  const stall = (await listCompetitions()).find((c) => c.slug === 'stall');
  if (!stall) return [];
  const defs = AWARDS.find((a) => a.slug === 'stall')?.criteria ?? [];
  return stall.criteria.map((k) => ({
    id: k.id,
    name: k.name,
    question: defs.find((d) => d.name === k.name)?.customerQuestion ?? `How was the ${k.name.toLowerCase()}?`,
    marks: Math.round(k.weight * stall.scaleMax * 100) / 100,
  }));
}

/** Save (or change) one phone's star ratings for a stall. Returns false for an unknown stall or criterion. */
export async function rateStall(stallNumber: number, voter: string, ratings: Record<string, number>): Promise<boolean> {
  const allowed = new Set((await ratingCriteria()).map((k) => String(k.id)));
  const entries = Object.entries(ratings).filter(([id, v]) => allowed.has(id) && Number.isInteger(v) && v >= 1 && v <= 5);
  if (entries.length === 0) return false;
  if (!hasDb) {
    const d = demo();
    if (!d.stalls.some((s) => s.number === stallNumber)) return false;
    const mine = ((d.ratings[String(stallNumber)] ??= {})[voter] ??= {});
    for (const [id, v] of entries) mine[id] = v;
    return true;
  }
  return tx(async (c) => {
    const st = await c.query(`SELECT id FROM stalls WHERE number = $1`, [stallNumber]);
    if (st.rows.length === 0) return false;
    for (const [id, v] of entries) {
      await c.query(
        `INSERT INTO customer_ratings (stall_id, voter, criterion_id, stars) VALUES ($1, $2, $3, $4)
         ON CONFLICT (stall_id, voter, criterion_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()`,
        [st.rows[0].id, voter, Number(id), v],
      );
    }
    return true;
  });
}

/** This phone's star ratings for a stall: criterion id -> stars. */
export async function ratingOf(stallNumber: number, voter: string): Promise<Record<string, number>> {
  if (!hasDb) return { ...(demo().ratings[String(stallNumber)]?.[voter] ?? {}) };
  const rows = await q<Row>(
    `SELECT r.criterion_id, r.stars FROM customer_ratings r JOIN stalls s ON s.id = r.stall_id WHERE s.number = $1 AND r.voter = $2`,
    [stallNumber, voter],
  );
  return Object.fromEntries(rows.map((r) => [String(r.criterion_id), r.stars]));
}

/** Average stars per stall and criterion, and how many phones rated each stall. */
export async function customerAverages(): Promise<Record<number, { stars: Record<string, number>; raters: number }>> {
  const out: Record<number, { stars: Record<string, number>; raters: number }> = {};
  if (!hasDb) {
    for (const [n, byVoter] of Object.entries(demo().ratings)) {
      const sums: Record<string, number[]> = {};
      for (const r of Object.values(byVoter)) for (const [id, v] of Object.entries(r)) (sums[id] ??= []).push(v);
      out[Number(n)] = {
        stars: Object.fromEntries(Object.entries(sums).map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length])),
        raters: Object.keys(byVoter).length,
      };
    }
    return out;
  }
  const rows = await q<Row>(
    `SELECT s.number, r.criterion_id, AVG(r.stars)::float8 AS avg
     FROM customer_ratings r JOIN stalls s ON s.id = r.stall_id GROUP BY s.number, r.criterion_id`,
  );
  const raters = await q<Row>(
    `SELECT s.number, COUNT(DISTINCT r.voter)::int AS n FROM customer_ratings r JOIN stalls s ON s.id = r.stall_id GROUP BY s.number`,
  );
  for (const r of rows) ((out[r.number] ??= { stars: {}, raters: 0 }).stars[String(r.criterion_id)] = r.avg);
  for (const r of raters) (out[r.number] ??= { stars: {}, raters: 0 }).raters = r.n;
  return out;
}

/**
 * Outstanding Stall and the four element awards. Each is the jury's average marks for its
 * elements plus the customers' average (stars / 5 x the same marks), so both halves weigh the same.
 */
export async function stallAwards(): Promise<StallAwardBoard[]> {
  const [comps, boards, stalls, cust] = await Promise.all([listCompetitions(), leaderboards(), listStalls(), customerAverages()]);
  const stall = comps.find((c) => c.slug === 'stall');
  if (!stall) return [];
  const jury = new Map((boards[String(stall.id)] ?? []).map((r) => [r.stallNumber, r]));
  const round = (n: number) => Math.round(n * 100) / 100;
  return STALL_AWARDS.map((a) => {
    const crit = stall.criteria.filter((k) => a.criteria.includes(k.name));
    const marks = round(crit.reduce((n, k) => n + k.weight * stall.scaleMax, 0));
    const rows: StallAwardRow[] = [];
    for (const s of stalls) {
      const j = jury.get(s.number);
      const c = cust[s.number];
      if (!j && !c?.raters) continue;
      const juryMarks = j ? crit.reduce((n, k) => n + (j.criteria[String(k.id)] ?? 0) * k.weight, 0) : 0;
      const custMarks = c ? crit.reduce((n, k) => n + ((c.stars[String(k.id)] ?? 0) / 5) * k.weight * stall.scaleMax, 0) : 0;
      rows.push({
        stallNumber: s.number,
        stallName: s.name,
        colour: s.colour,
        jury: round(juryMarks),
        customer: round(custMarks),
        total: round(juryMarks + custMarks),
        judges: j?.judges ?? 0,
        raters: c?.raters ?? 0,
        rank: 0,
      });
    }
    rows.sort((x, y) => y.total - x.total || x.stallNumber - y.stallNumber);
    rankBy(rows, (r) => r.total);
    return { slug: a.slug, name: a.name, element: a.element, juryMarks: marks, customerMarks: marks, rows };
  });
}

// ---------------------------------------------------------------------------
// Most Popular & Viral Video Marketing
// ---------------------------------------------------------------------------

/** Ranking by likes + shares. With all = true, every stall is listed (for the admin form). */
export async function viralTallies(all = false): Promise<ViralRow[]> {
  const stalls = await listStalls();
  let counts: Record<number, { likes: number; shares: number; url: string | null }> = {};
  if (!hasDb) {
    counts = Object.fromEntries(Object.entries(demo().viral).map(([n, v]) => [Number(n), v]));
  } else {
    const rows = await q<Row>(`SELECT s.number, v.likes, v.shares, v.url FROM viral_videos v JOIN stalls s ON s.id = v.stall_id`);
    for (const r of rows) counts[r.number] = { likes: r.likes, shares: r.shares, url: r.url };
  }
  const rows: ViralRow[] = stalls
    .map((s) => {
      const v = counts[s.number] ?? { likes: 0, shares: 0, url: null };
      return { stallNumber: s.number, stallName: s.name, colour: s.colour, likes: v.likes, shares: v.shares, total: v.likes + v.shares, url: v.url, rank: 0 };
    })
    .filter((r) => all || r.total > 0);
  rows.sort((a, b) => b.total - a.total || a.stallNumber - b.stallNumber);
  rankBy(rows, (r) => r.total);
  return rows;
}

/** Committee entry of one group's social media counts. */
export async function setViral(stallNumber: number, likes: number, shares: number, url: string | null): Promise<boolean> {
  if (!hasDb) {
    const d = demo();
    if (!d.stalls.some((s) => s.number === stallNumber)) return false;
    d.viral[String(stallNumber)] = { likes, shares, url };
    return true;
  }
  const rows = await q(
    `INSERT INTO viral_videos (stall_id, likes, shares, url)
     SELECT id, $2, $3, $4 FROM stalls WHERE number = $1
     ON CONFLICT (stall_id) DO UPDATE SET likes = EXCLUDED.likes, shares = EXCLUDED.shares, url = EXCLUDED.url, updated_at = now()
     RETURNING stall_id`,
    [stallNumber, likes, shares, url],
  );
  return rows.length > 0;
}

/** Votes and star ratings for one stall, for its team and for the committee's stall report. */
export async function customerFeedback(stallNumber: number): Promise<CustomerFeedback> {
  const crit = await ratingCriteria();
  const spread: Record<string, [number, number, number, number, number]> = Object.fromEntries(crit.map((k) => [String(k.id), [0, 0, 0, 0, 0]]));
  let likes = 0;
  let dislikes = 0;
  let raters = 0;
  if (!hasDb) {
    const d = demo();
    for (const v of Object.values(d.votes[String(stallNumber)] ?? {})) v ? likes++ : dislikes++;
    const byVoter = d.ratings[String(stallNumber)] ?? {};
    raters = Object.keys(byVoter).length;
    for (const r of Object.values(byVoter)) for (const [id, v] of Object.entries(r)) if (spread[id] && v >= 1 && v <= 5) spread[id][v - 1]++;
  } else {
    const [votes, stars, people] = await Promise.all([
      q<Row>(
        `SELECT COUNT(*) FILTER (WHERE v.liked)::int AS likes, COUNT(*) FILTER (WHERE NOT v.liked)::int AS dislikes
         FROM customer_votes v JOIN stalls s ON s.id = v.stall_id WHERE s.number = $1`,
        [stallNumber],
      ),
      q<Row>(
        `SELECT r.criterion_id, r.stars, COUNT(*)::int AS n
         FROM customer_ratings r JOIN stalls s ON s.id = r.stall_id WHERE s.number = $1 GROUP BY r.criterion_id, r.stars`,
        [stallNumber],
      ),
      q<Row>(`SELECT COUNT(DISTINCT r.voter)::int AS n FROM customer_ratings r JOIN stalls s ON s.id = r.stall_id WHERE s.number = $1`, [stallNumber]),
    ]);
    likes = votes[0]?.likes ?? 0;
    dislikes = votes[0]?.dislikes ?? 0;
    raters = people[0]?.n ?? 0;
    for (const r of stars) if (spread[String(r.criterion_id)] && r.stars >= 1 && r.stars <= 5) spread[String(r.criterion_id)][r.stars - 1] = r.n;
  }
  return {
    likes,
    dislikes,
    raters,
    elements: crit.map((k) => {
      const sp = spread[String(k.id)];
      const count = sp.reduce((a, b) => a + b, 0);
      const sum = sp.reduce((a, n, i) => a + n * (i + 1), 0);
      return { id: k.id, name: k.name, marks: k.marks, average: count ? sum / count : 0, count, spread: sp };
    }),
  };
}
