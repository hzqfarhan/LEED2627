import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CLUSTERS } from '@/lib/event';
import { buildXlsx, type Cell, type SheetSpec } from '@/lib/xlsx';
import {
  addStall,
  createPerson,
  exportRows,
  importPeople,
  setVotingOpen,
  voteTallies,
  leaderboards,
  listCompetitions,
  listStalls,
  setCompetitionOpen,
  setMemoryStatus,
  setResultsPublished,
  setStallPins,
  updatePerson,
  updateStall,
} from '@/lib/repo';
import { STALL_COLOURS, cleanLink, criterionMarks, fmtScore, marksFor, maxTotal, totalOf, type Competition, type StallColour } from '@/lib/shared';
import { CUSTOMER_CHOICE } from '@/lib/awards';

type Ctx = { params: Promise<{ resource: string }> };

async function adminOnly() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in as an admin.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Only admins can do that.' }, { status: 403 });
  return null;
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const intList = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : []);

function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets running a cell as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One workbook: a summary, then for every award a ranking sheet and a detailed marks sheet. */
async function workbook(comps: Competition[]): Promise<Buffer> {
  const [boards, stalls, votes] = await Promise.all([leaderboards(), listStalls(), voteTallies()]);
  const byNumber = new Map(stalls.map((s) => [s.number, s]));
  const sheets: SheetSpec[] = [];

  const summary: Cell[][] = [['Award', 'Place', 'Stall number', 'Stall name', 'Group', 'Result', 'Judges or votes']];
  for (const c of comps) {
    for (const r of (boards[String(c.id)] ?? []).filter((x) => x.rank <= 3)) {
      summary.push([c.name, r.rank, r.stallNumber, r.stallName, byNumber.get(r.stallNumber)?.groupName ?? '', round2(r.average), r.judges]);
    }
  }
  for (const v of votes.filter((x) => x.rank <= 3)) {
    summary.push([CUSTOMER_CHOICE.name, v.rank, v.stallNumber, v.stallName, byNumber.get(v.stallNumber)?.groupName ?? '', v.likes, v.likes + v.dislikes]);
  }
  sheets.push({ name: 'Winners', rows: summary, widths: [26, 7, 8, 28, 18, 10, 10] });

  for (const c of comps) {
    const short = c.name.slice(0, 20);
    const rank: Cell[][] = [
      ['Rank', 'Stall number', 'Stall name', 'Group', 'Judges', `Average (out of ${fmtScore(maxTotal(c))})`,
        ...c.criteria.map((k) => `Avg ${k.name} (/${fmtScore(criterionMarks(c, k.weight))})`)],
    ];
    for (const r of boards[String(c.id)] ?? []) {
      rank.push([r.rank, r.stallNumber, r.stallName, byNumber.get(r.stallNumber)?.groupName ?? '', r.judges, round2(r.average),
        ...c.criteria.map((k) => round2(marksFor(c, k.weight, r.criteria[String(k.id)] ?? 0)))]);
    }
    sheets.push({ name: `${short} - Ranking`, rows: rank, widths: [6, 8, 28, 18, 8, 14, ...c.criteria.map(() => 16)] });

    const detail: Cell[][] = [
      ['Stall number', 'Stall name', 'Group', 'Judge', 'Judge email',
        ...c.criteria.flatMap((k) => [`${k.name} level (${c.scaleMin}-${c.scaleMax})`, `${k.name} marks (/${fmtScore(criterionMarks(c, k.weight))})`]),
        `Total (/${fmtScore(maxTotal(c))})`, 'Comment', 'Last saved'],
    ];
    for (const r of await exportRows(c.id)) {
      detail.push([r.stallNumber, r.stallName, byNumber.get(r.stallNumber)?.groupName ?? '', r.judge, r.email,
        ...c.criteria.flatMap((k): Cell[] => {
          const level = r.scores[String(k.id)];
          return level === undefined ? ['', ''] : [level, round2(marksFor(c, k.weight, level))];
        }),
        round2(totalOf(c, r.scores)), r.comment ?? '', r.updatedAt]);
    }
    sheets.push({ name: `${short} - Marks`, rows: detail, widths: [8, 28, 18, 30, 28, ...c.criteria.flatMap(() => [10, 10]), 10, 40, 22] });
  }

  const vote: Cell[][] = [['Rank', 'Stall number', 'Stall name', 'Group', 'Likes', 'Not for me', 'Total votes']];
  for (const v of votes) vote.push([v.rank, v.stallNumber, v.stallName, byNumber.get(v.stallNumber)?.groupName ?? '', v.likes, v.dislikes, v.likes + v.dislikes]);
  sheets.push({ name: 'Customer Choice', rows: vote, widths: [6, 8, 28, 18, 8, 10, 10] });

  return buildXlsx(sheets);
}

/**
 * GET /api/admin/export?type=xlsx                               ->  every award, one Excel workbook
 * GET /api/admin/export?competition=<id>&type=scores|leaderboard  ->  CSV for one award
 */
/** GET /api/admin/export?competition=<id>&type=scores|leaderboard  ->  CSV download */
export async function GET(req: Request, ctx: Ctx) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { resource } = await ctx.params;
  if (resource !== 'export') return bad('Unknown resource.', 404);

  const url = new URL(req.url);
  const comps = await listCompetitions();
  if (url.searchParams.get('type') === 'xlsx') {
    const file = await workbook(comps);
    const stamp = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leed26-marks-${stamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const comp = comps.find((c) => String(c.id) === url.searchParams.get('competition'));
  if (!comp) return bad('Unknown competition.', 404);
  const type = url.searchParams.get('type') === 'leaderboard' ? 'leaderboard' : 'scores';

  const lines: string[] = [];
  if (type === 'leaderboard') {
    const rows = (await leaderboards())[String(comp.id)] ?? [];
    lines.push(
      ['Rank', 'Stall number', 'Stall name', 'Judges', `Average (out of ${fmtScore(maxTotal(comp))})`, ...comp.criteria.map((k) => `Avg: ${k.name}`)]
        .map(csvCell)
        .join(','),
    );
    for (const r of rows) {
      lines.push(
        [r.rank, r.stallNumber, r.stallName, r.judges, r.average, ...comp.criteria.map((k) => (r.criteria[String(k.id)] ?? 0).toFixed(2))]
          .map(csvCell)
          .join(','),
      );
    }
  } else {
    const rows = await exportRows(comp.id);
    lines.push(
      ['Stall number', 'Stall name', 'Judge', 'Judge email', ...comp.criteria.map((k) => k.name), 'Total', 'Comment', 'Last saved']
        .map(csvCell)
        .join(','),
    );
    for (const r of rows) {
      lines.push(
        [
          r.stallNumber,
          r.stallName,
          r.judge,
          r.email,
          ...comp.criteria.map((k) => r.scores[String(k.id)] ?? ''),
          fmtScore(totalOf(comp, r.scores)),
          r.comment ?? '',
          r.updatedAt,
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }

  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leed26-${comp.slug}-${type}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * POST /api/admin/people      ->  add a judge or admin
 * POST /api/admin/stall-pins  ->  create team PINs; the new PINs are returned once, to hand out
 */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { resource } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('The request could not be read.');

  if (resource === 'stall-pins') {
    const stalls = await listStalls();
    const targets = body.replaceAll === true ? stalls : stalls.filter((s) => !s.hasPin);
    const pins = targets.map((s) => ({ number: s.number, name: s.name, pin: String(randomInt(100000, 1000000)) }));
    await setStallPins(pins);
    return NextResponse.json({ ok: true, pins });
  }

  if (resource === 'stalls') {
    const number = await addStall();
    return NextResponse.json({ ok: true, number });
  }

  if (resource === 'people-import') {
    const comps = await listCompetitions();
    const raw = Array.isArray(body.rows) ? body.rows.slice(0, 300) : [];
    const rows = [];
    const errors: string[] = [];
    for (const [i, r] of (raw as Record<string, unknown>[]).entries()) {
      const name = text(r.name, 80);
      const email = text(r.email, 200);
      const pin = typeof r.pin === 'string' ? r.pin.trim() : '';
      if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.push(`Row ${i + 2}: needs a name and a valid email.`);
        continue;
      }
      if (pin && (pin.length < 4 || pin.length > 72)) {
        errors.push(`Row ${i + 2} (${name}): the PIN needs at least 4 characters.`);
        continue;
      }
      const wanted = typeof r.awards === 'string' ? r.awards.toLowerCase() : '';
      const assigned =
        wanted.trim() === '' || wanted.trim() === 'all'
          ? comps.map((c) => c.id)
          : comps.filter((c) => wanted.split(/[;|]/).some((w) => {
              const t = w.trim();
              return t && (c.slug === t || c.name.toLowerCase().includes(t));
            })).map((c) => c.id);
      rows.push({ name, email, pin, role: r.role === 'admin' ? ('admin' as const) : ('judge' as const), assigned });
    }
    const result = await importPeople(rows);
    return NextResponse.json({ ok: true, ...result, errors: [...errors, ...result.errors] });
  }

  if (resource !== 'people') return bad('Unknown resource.', 404);
  const name = text(body.name, 80);
  const email = text(body.email, 200);
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!name) return bad('Enter the person’s name.');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('Enter a valid email address.');
  if (pin.length < 4 || pin.length > 72) return bad('The PIN needs at least 4 characters.');
  const role = body.role === 'admin' ? 'admin' : 'judge';

  const result = await createPerson({ name, email, pin, role, assigned: intList(body.assigned) });
  if (!result.ok) return bad(result.error, 409);
  return NextResponse.json({ ok: true });
}

/** PATCH /api/admin/{people|stalls|competitions|memories|settings} */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { resource } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('The request could not be read.');

  if (resource === 'people') {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return bad('Unknown person.', 404);
    const patch: { isActive?: boolean; pin?: string; assigned?: number[]; name?: string; email?: string } = {};
    const newName = text(body.name, 80);
    if (newName) patch.name = newName;
    if (typeof body.email === 'string' && body.email.trim()) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())) return bad('Enter a valid email address.');
      patch.email = body.email.trim();
    }
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
    if (typeof body.pin === 'string' && body.pin) {
      if (body.pin.length < 4 || body.pin.length > 72) return bad('The PIN needs at least 4 characters.');
      patch.pin = body.pin;
    }
    if (Array.isArray(body.assigned)) patch.assigned = intList(body.assigned);
    const res = await updatePerson(id, patch);
    if (!res.ok) return bad(res.error, 409);
    return NextResponse.json({ ok: true });
  }

  if (resource === 'stalls') {
    const number = Number(body.number);
    const name = text(body.name, 80);
    if (!Number.isInteger(number)) return bad('Unknown stall.', 404);
    if (!name) return bad('Enter a stall name.');
    const cluster = CLUSTERS.some((c) => c.id === body.cluster) ? (body.cluster as string) : null;
    const colour = STALL_COLOURS.includes(body.colour as StallColour) ? (body.colour as StallColour) : null;
    const instagram = text(body.instagram, 60)?.replace(/^@/, '') ?? null;
    const ok = await updateStall(number, {
      name,
      groupName: text(body.groupName, 80),
      cluster,
      colour,
      description: text(body.description, 300),
      instagram,
      pitchUrl: cleanLink(body.pitchUrl),
      promoUrls: (Array.isArray(body.promoUrls) ? body.promoUrls : []).map(cleanLink).filter((u): u is string => u !== null),
    });
    if (!ok) return bad('Unknown stall.', 404);
    if (typeof body.teamPin === 'string' && body.teamPin) {
      if (body.teamPin.length < 4 || body.teamPin.length > 72) return bad('The team PIN needs at least 4 characters.');
      await setStallPins([{ number, pin: body.teamPin }]);
    }
    return NextResponse.json({ ok: true });
  }

  if (resource === 'settings') {
    if (typeof body.resultsPublished === 'boolean') await setResultsPublished(body.resultsPublished);
    else if (typeof body.votingOpen === 'boolean') await setVotingOpen(body.votingOpen);
    else return bad('Nothing to change.');
    return NextResponse.json({ ok: true });
  }

  if (resource === 'competitions') {
    const id = Number(body.id);
    if (!Number.isInteger(id) || typeof body.isOpen !== 'boolean') return bad('Unknown competition.', 404);
    await setCompetitionOpen(id, body.isOpen);
    return NextResponse.json({ ok: true });
  }

  if (resource === 'memories') {
    const id = Number(body.id);
    const status = body.status;
    if (!Number.isInteger(id) || (status !== 'approved' && status !== 'hidden' && status !== 'pending')) {
      return bad('Unknown memory.', 404);
    }
    await setMemoryStatus(id, status);
    return NextResponse.json({ ok: true });
  }

  return bad('Unknown resource.', 404);
}
