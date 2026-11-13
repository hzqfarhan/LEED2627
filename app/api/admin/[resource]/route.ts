import { NextResponse } from 'next/server';
import {
  accountById,
  addMember,
  allAllocations,
  listUsers,
  setUserAccess,
  createAnnouncement,
  deleteAnnouncement,
  planAllocation,
  removeMember,
  setAllocation,
  setAnnouncementPinned,
  setLeader,
} from '@/lib/accounts';
import { getSession, type Session } from '@/lib/auth';
import { notifyAudience, notifyStall } from '@/lib/notify';
import { listLog, logEvent } from '@/lib/log';
import { isUthmEmail } from '@/lib/uthm';
import { CLUSTERS } from '@/lib/event';
import { buildXlsx, type Cell, type SheetSpec } from '@/lib/xlsx';
import {
  addStall,
  createPerson,
  exportRows,
  importPeople,
  setVotingOpen,
  setViral,
  stallAwards,
  customerAverages,
  customerFeedback,
  ratingCriteria,
  viralTallies,
  voteTallies,
  leaderboards,
  listCompetitions,
  listPeople,
  listStalls,
  setCompetitionOpen,
  setMemoryStatus,
  setResultsPublished,
  updatePerson,
  updateStall,
} from '@/lib/repo';
import { STALL_COLOURS, cleanLink, criterionMarks, fmtScore, marksFor, maxTotal, totalOf, type Competition, type StallColour } from '@/lib/shared';
import { CATEGORIES, CUSTOMER_CHOICE, VIRAL_VIDEO } from '@/lib/awards';

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

/**
 * One workbook for the committee:
 *   Winners             places for all nine categories
 *   <stall award>       Outstanding Stall and the four element awards: jury, customers, total
 *   <score sheet> - Ranking / - Marks   every judge's level and marks per criterion
 *   Customer ratings    average stars and customer marks per stall and element
 *   Viral video, People Choice
 */
async function workbook(comps: Competition[]): Promise<Buffer> {
  const [boards, stalls, votes, stallBoards, viral, cust, rateCrit] = await Promise.all([
    leaderboards(),
    listStalls(),
    voteTallies(),
    stallAwards(),
    viralTallies(),
    customerAverages(),
    ratingCriteria(),
  ]);
  const byNumber = new Map(stalls.map((s) => [s.number, s]));
  const group = (n: number) => byNumber.get(n)?.groupName ?? '';
  const sheets: SheetSpec[] = [];

  // --- Winners, in the order the categories are announced ---
  const summary: Cell[][] = [['Category', 'Place', 'Stall number', 'Stall name', 'Group', 'Result', 'Based on']];
  for (const cat of CATEGORIES) {
    const sb = stallBoards.find((x) => x.slug === cat.slug);
    const comp = comps.find((c) => c.slug === cat.slug);
    if (sb) {
      for (const r of sb.rows.filter((x) => x.rank <= cat.places)) {
        summary.push([cat.name, r.rank, r.stallNumber, r.stallName, group(r.stallNumber), r.total, `jury ${r.jury} + customers ${r.customer} (of ${sb.juryMarks + sb.customerMarks})`]);
      }
    } else if (comp) {
      for (const r of (boards[String(comp.id)] ?? []).filter((x) => x.rank <= cat.places)) {
        summary.push([cat.name, r.rank, r.stallNumber, r.stallName, group(r.stallNumber), round2(r.average), `${r.judges} judges (of ${fmtScore(maxTotal(comp))})`]);
      }
    } else if (cat.slug === VIRAL_VIDEO.slug) {
      for (const r of viral.filter((x) => x.rank <= cat.places)) {
        summary.push([cat.name, r.rank, r.stallNumber, r.stallName, group(r.stallNumber), r.total, `${r.likes} likes + ${r.shares} shares`]);
      }
    } else if (cat.slug === CUSTOMER_CHOICE.slug) {
      for (const v of votes.filter((x) => x.rank <= cat.places)) {
        summary.push([cat.name, v.rank, v.stallNumber, v.stallName, group(v.stallNumber), v.likes, `${v.likes + v.dislikes} votes`]);
      }
    }
  }
  sheets.push({ name: 'Winners', rows: summary, widths: [40, 7, 8, 28, 18, 10, 34] });

  // --- Stall awards: half jury, half customers ---
  for (const sb of stallBoards) {
    const rows: Cell[][] = [
      ['Rank', 'Stall number', 'Stall name', 'Group', 'Judges', `Jury (/${sb.juryMarks})`, 'Customers who rated', `Customers (/${sb.customerMarks})`, `Total (/${sb.juryMarks + sb.customerMarks})`],
    ];
    for (const r of sb.rows) rows.push([r.rank, r.stallNumber, r.stallName, group(r.stallNumber), r.judges, r.jury, r.raters, r.customer, r.total]);
    sheets.push({ name: sb.name.slice(0, 31), rows, widths: [6, 8, 28, 18, 8, 12, 12, 14, 12] });
  }

  // --- Every score sheet, per judge ---
  for (const c of comps) {
    const short = c.name.slice(0, 20).trim();
    const rank: Cell[][] = [
      ['Rank', 'Stall number', 'Stall name', 'Group', 'Judges', `Average (out of ${fmtScore(maxTotal(c))})`,
        ...c.criteria.map((k) => `Avg ${k.name} (/${fmtScore(criterionMarks(c, k.weight))})`)],
    ];
    for (const r of boards[String(c.id)] ?? []) {
      rank.push([r.rank, r.stallNumber, r.stallName, group(r.stallNumber), r.judges, round2(r.average),
        ...c.criteria.map((k) => round2(marksFor(c, k.weight, r.criteria[String(k.id)] ?? 0)))]);
    }
    sheets.push({ name: `${short} - Ranking`, rows: rank, widths: [6, 8, 28, 18, 8, 14, ...c.criteria.map(() => 16)] });

    const detail: Cell[][] = [
      ['Stall number', 'Stall name', 'Group', 'Judge', 'Judge email',
        ...c.criteria.flatMap((k) => [`${k.name} level (${c.scaleMin}-${c.scaleMax})`, `${k.name} marks (/${fmtScore(criterionMarks(c, k.weight))})`]),
        `Total (/${fmtScore(maxTotal(c))})`, 'Comment', 'Last saved'],
    ];
    for (const r of await exportRows(c.id)) {
      detail.push([r.stallNumber, r.stallName, group(r.stallNumber), r.judge, r.email,
        ...c.criteria.flatMap((k): Cell[] => {
          const level = r.scores[String(k.id)];
          return level === undefined ? ['', ''] : [level, round2(marksFor(c, k.weight, level))];
        }),
        round2(totalOf(c, r.scores)), r.comment ?? '', r.updatedAt]);
    }
    sheets.push({ name: `${short} - Marks`, rows: detail, widths: [8, 28, 18, 30, 28, ...c.criteria.flatMap(() => [10, 10]), 10, 40, 22] });
  }

  // --- Customer ratings ---
  const cr: Cell[][] = [
    ['Stall number', 'Stall name', 'Group', 'Customers who rated',
      ...rateCrit.flatMap((k) => [`${k.name} avg stars (1-5)`, `${k.name} customer marks (/${k.marks})`])],
  ];
  for (const s of stalls) {
    const c = cust[s.number];
    if (!c?.raters) continue;
    cr.push([s.number, s.name, s.groupName ?? '', c.raters,
      ...rateCrit.flatMap((k): Cell[] => {
        const avg = c.stars[String(k.id)];
        return avg === undefined ? ['', ''] : [round2(avg), round2((avg / 5) * k.marks)];
      })]);
  }
  sheets.push({ name: 'Customer ratings', rows: cr, widths: [8, 28, 18, 12, ...rateCrit.flatMap(() => [14, 16])] });

  const vr: Cell[][] = [['Rank', 'Stall number', 'Stall name', 'Group', 'Likes', 'Shares', 'Likes + shares', 'Video link']];
  for (const r of viral) vr.push([r.rank, r.stallNumber, r.stallName, group(r.stallNumber), r.likes, r.shares, r.total, r.url ?? '']);
  sheets.push({ name: 'Viral video', rows: vr, widths: [6, 8, 28, 18, 10, 10, 12, 40] });

  const vote: Cell[][] = [['Rank', 'Stall number', 'Stall name', 'Group', 'Likes', 'Not for me', 'Total votes']];
  for (const v of votes) vote.push([v.rank, v.stallNumber, v.stallName, group(v.stallNumber), v.likes, v.dislikes, v.likes + v.dislikes]);
  sheets.push({ name: 'People Choice', rows: vote, widths: [6, 8, 28, 18, 8, 10, 10] });

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
  if (resource === 'log') {
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind');
    const entries = await listLog({
      kind: kind === 'admin' || kind === 'user' || kind === 'auth' ? kind : null,
      actorId: Number(url.searchParams.get('actor')) || null,
      search: url.searchParams.get('q'),
      before: Number(url.searchParams.get('before')) || null,
      limit: 60,
    });
    return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (resource === 'users') return NextResponse.json({ users: await listUsers() }, { headers: { 'Cache-Control': 'no-store' } });
  if (resource === 'stall-report') {
    const number = Number(new URL(req.url).searchParams.get('number'));
    if (!Number.isInteger(number)) return bad('Unknown stall.', 404);
    const [comps, feedback, allocations, people] = await Promise.all([listCompetitions(), customerFeedback(number), allAllocations(), listPeople()]);
    const sheets: Record<string, Awaited<ReturnType<typeof exportRows>>> = {};
    const waiting: Record<string, string[]> = {};
    for (const c of comps) {
      sheets[c.id] = (await exportRows(c.id)).filter((r) => r.stallNumber === number);
      const done = new Set(sheets[c.id].map((r) => r.email));
      waiting[c.id] = Object.entries(allocations)
        .filter(([, byComp]) => byComp[String(c.id)]?.includes(number))
        .map(([judgeId]) => people.find((p) => p.id === Number(judgeId)))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.isActive && !done.has(p.email)))
        .map((p) => p.name);
    }
    return NextResponse.json({ sheets, waiting, feedback }, { headers: { 'Cache-Control': 'no-store' } });
  }
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

const uthmOnly = 'Use their official UTHM email (@uthm.edu.my or @student.uthm.edu.my): everyone signs in with UTHM SSO.';

/**
 * POST /api/admin/people          add a judge or admin by UTHM email
 * POST /api/admin/people-import   add or update many judges
 * POST /api/admin/stalls          add the next stall number
 * POST /api/admin/team            add someone to a stall team { stall, email, leader? }
 * POST /api/admin/teams-import    set up many stall teams { rows: [{ stall, group, leader, members }] }
 * POST /api/admin/announcements   { title, body, audience, pinned }
 * POST /api/admin/allocate        share a competition's stalls among its judges { competitionId, perStall }
 */
async function handlePOST(req: Request, ctx: Ctx) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { resource } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('The request could not be read.');
  const admin = (await getSession())!;

  if (resource === 'stalls') {
    const number = await addStall();
    return NextResponse.json({ ok: true, number });
  }

  if (resource === 'team') {
    const res = await addMember(Number(body.stall), String(body.email ?? ''), { isLeader: body.leader === true, addedBy: admin.email });
    if (!res.ok) return bad(res.error);
    const who = String(body.email ?? '').trim().toLowerCase();
    const no = Number(body.stall);
    await notifyStall(
      no,
      { kind: 'team', title: `${who} joined your team`, body: body.leader === true ? 'Added by the committee as team leader.' : 'Added by the committee.', link: '/stall' },
      {
        subject: `LEED 26: the committee updated your team (stall ${no})`,
        content: {
          preheader: `${who} is now on your stall team.`,
          status: { label: 'Team updated', tone: 'info' },
          heading: 'Your stall team has a new member',
          intro: [`The committee added ${who} to the team${body.leader === true ? ' as team leader' : ''}. They can sign in with their UTHM account to see your stall.`],
          rows: [['Stall', String(no)], ['Added', who]],
          cta: { label: 'See your team', path: '/stall' },
        },
      },
    );
    return NextResponse.json({ ok: true });
  }

  if (resource === 'teams-import') {
    const raw = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]).slice(0, 200) : [];
    const stalls = await listStalls();
    const errors: string[] = [];
    let added = 0;
    for (const [i, r] of raw.entries()) {
      const number = Number(r.stall);
      const stall = stalls.find((s) => s.number === number);
      if (!stall) {
        errors.push(`Row ${i + 2}: stall ${String(r.stall ?? '?')} does not exist.`);
        continue;
      }
      const group = text(r.group, 80);
      if (group) await updateStall(number, { ...stall, groupName: group });
      const emails = [
        ...(typeof r.leader === 'string' && r.leader.trim() ? [{ email: r.leader, leader: true }] : []),
        ...String(r.members ?? '')
          .split(/[;|\s]+/)
          .filter(Boolean)
          .map((email) => ({ email, leader: false })),
      ];
      for (const m of emails) {
        const res = await addMember(number, m.email, { isLeader: m.leader, addedBy: admin.email });
        if (res.ok) added++;
        else errors.push(`Row ${i + 2} (stall ${number}): ${res.error}`);
      }
    }
    return NextResponse.json({ ok: true, added, errors });
  }

  if (resource === 'announcements') {
    const title = text(body.title, 120);
    if (!title) return bad('Give the announcement a title.');
    const audience = body.audience === 'sellers' || body.audience === 'judges' ? body.audience : 'everyone';
    const message = text(body.body, 2000) ?? '';
    await createAnnouncement({ title, body: message, audience, pinned: body.pinned === true, by: admin.email });
    const link = audience === 'sellers' ? '/stall' : audience === 'judges' ? '/judge' : '/';
    await notifyAudience(
      audience,
      { kind: 'announcement', title, body: message || null, link },
      body.email === false
        ? undefined
        : {
            subject: `LEED 26: ${title}`,
            content: {
              preheader: message.slice(0, 120) || title,
              status: { label: 'From the committee', tone: 'info' },
              heading: title,
              intro: message ? message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [],
              cta: { label: 'Open LEED 26', path: link },
            },
          },
    );
    return NextResponse.json({ ok: true });
  }

  if (resource === 'allocate') {
    const competitionId = Number(body.competitionId);
    const perStall = Math.max(1, Math.min(10, Number(body.perStall) || 2));
    const [comps, people, stalls] = await Promise.all([listCompetitions(), listPeople(), listStalls()]);
    const comp = comps.find((c) => c.id === competitionId);
    if (!comp) return bad('Unknown competition.', 404);
    const judges = people.filter((p) => p.role === 'judge' && p.isActive && p.assigned.includes(comp.id)).map((p) => p.id);
    if (judges.length === 0) return bad(`No active judges are assigned to the ${comp.name} yet.`);
    const plan = planAllocation(judges, stalls.map((s) => s.number), perStall);
    for (const [judgeId, list] of Object.entries(plan)) await setAllocation(Number(judgeId), comp.id, list);
    return NextResponse.json({ ok: true, judges: judges.length, perStall: Math.min(perStall, judges.length) });
  }

  if (resource === 'people-import') {
    const comps = await listCompetitions();
    const raw = Array.isArray(body.rows) ? body.rows.slice(0, 300) : [];
    const rows = [];
    const errors: string[] = [];
    for (const [i, r] of (raw as Record<string, unknown>[]).entries()) {
      const name = text(r.name, 80);
      const email = text(r.email, 200);
      if (!name || !email) {
        errors.push(`Row ${i + 2}: needs a name and an email.`);
        continue;
      }
      if (!isUthmEmail(email)) {
        errors.push(`Row ${i + 2} (${name}): ${email} is not a UTHM email.`);
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
      rows.push({ name, email, role: r.role === 'admin' ? ('admin' as const) : ('judge' as const), assigned });
    }
    const result = await importPeople(rows);
    return NextResponse.json({ ok: true, ...result, errors: [...errors, ...result.errors] });
  }

  if (resource !== 'people') return bad('Unknown resource.', 404);
  const name = text(body.name, 80);
  const email = text(body.email, 200);
  if (!name) return bad('Enter the person’s name.');
  if (!email || !isUthmEmail(email)) return bad(uthmOnly);
  const role = body.role === 'admin' ? 'admin' : 'judge';

  const result = await createPerson({ name, email, role, assigned: intList(body.assigned) });
  if (!result.ok) return bad(result.error, 409);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/team           { stall, email }  remove someone from a stall team
 * DELETE /api/admin/announcements  { id }
 */
async function handleDELETE(req: Request, ctx: Ctx) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { resource } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('The request could not be read.');
  if (resource === 'team') {
    const ok = await removeMember(Number(body.stall), String(body.email ?? ''));
    if (!ok) return bad('That person is not on that team.', 404);
    const who = String(body.email ?? '').trim().toLowerCase();
    const no = Number(body.stall);
    await notifyStall(
      no,
      { kind: 'team', title: `${who} left your team`, body: 'Removed by the committee.', link: '/stall' },
      {
        subject: `LEED 26: the committee updated your team (stall ${no})`,
        content: {
          preheader: `${who} is no longer on your stall team.`,
          status: { label: 'Team updated', tone: 'info' },
          heading: 'A member was removed from your team',
          intro: [`The committee removed ${who} from the team. If this is a mistake, reply to this email.`],
          rows: [['Stall', String(no)], ['Removed', who]],
          cta: { label: 'See your team', path: '/stall' },
        },
      },
    );
    return NextResponse.json({ ok: true });
  }
  if (resource === 'announcements') {
    await deleteAnnouncement(Number(body.id));
    return NextResponse.json({ ok: true });
  }
  return bad('Unknown resource.', 404);
}

/** PATCH /api/admin/{people|stalls|competitions|memories|settings} */
async function handlePATCH(req: Request, ctx: Ctx) {
  const denied = await adminOnly();
  if (denied) return denied;
  const { resource } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('The request could not be read.');

  if (resource === 'users') {
    const id = Number(body.id);
    const me = (await getSession())!;
    if (!Number.isInteger(id)) return bad('Unknown account.', 404);
    const role = body.role === 'admin' || body.role === 'judge' || body.role === 'customer' ? body.role : undefined;
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : undefined;
    if (!role && isActive === undefined) return bad('Nothing to change.');
    if (id === me.uid && (role && role !== 'admin')) return bad('You cannot remove your own admin role. Ask another admin.');
    if (id === me.uid && isActive === false) return bad('You cannot switch off your own account.');
    const everyone = await listUsers();
    const target = everyone.find((u) => u.id === id);
    if (!target) return bad('Unknown account.', 404);
    if (role && role === target.role && isActive === undefined) return bad(`${target.name} already has that role.`);
    const losesAdmin = target.role === 'admin' && ((role && role !== 'admin') || isActive === false);
    if (losesAdmin && !everyone.some((u) => u.role === 'admin' && u.isActive && u.id !== id)) {
      return bad('They are the only active committee member. Make someone else committee first.', 409);
    }
    const before = await setUserAccess(id, { role, isActive });
    if (!before) return bad('Unknown account.', 404);
    const label = (r: string) => ({ admin: 'Committee (admin)', judge: 'Jury', customer: 'Customer' })[r] ?? r;
    if (role && role !== before.role) {
      await logEvent(actorOf(me), 'admin', 'users.role', `Changed ${before.name}'s role from ${label(before.role)} to ${label(role)}`, before.email);
    }
    if (isActive !== undefined && isActive !== before.isActive) {
      await logEvent(actorOf(me), 'admin', 'users.active', `${isActive ? 'Switched on' : 'Switched off'} ${before.name}'s account`, before.email);
    }
    return NextResponse.json({ ok: true });
  }

  if (resource === 'team') {
    const ok = await setLeader(Number(body.stall), String(body.email ?? ''));
    if (!ok) return bad('That person is not on that team.', 404);
    const who = String(body.email ?? '').trim().toLowerCase();
    const no = Number(body.stall);
    await notifyStall(
      no,
      { kind: 'team', title: `${who} is now your team leader`, body: 'Changed by the committee. Only the leader can submit payments.', link: '/stall' },
      {
        subject: `LEED 26: new team leader for stall ${no}`,
        content: {
          preheader: `${who} now leads your stall team.`,
          status: { label: 'Team updated', tone: 'info' },
          heading: 'Your team has a new leader',
          intro: [`The committee made ${who} the team leader. The leader manages the team and submits the RM40 and RM70 payments.`],
          rows: [['Stall', String(no)], ['Team leader', who]],
          cta: { label: 'Open My stall', path: '/stall' },
        },
      },
    );
    return NextResponse.json({ ok: true });
  }

  if (resource === 'announcements') {
    await setAnnouncementPinned(Number(body.id), body.pinned === true);
    return NextResponse.json({ ok: true });
  }

  if (resource === 'allocate') {
    const judgeId = Number(body.judgeId);
    const competitionId = Number(body.competitionId);
    if (!Number.isInteger(judgeId) || !Number.isInteger(competitionId)) return bad('Choose a judge and a competition.');
    await setAllocation(judgeId, competitionId, intList(body.stalls));
    return NextResponse.json({ ok: true });
  }

  if (resource === 'viral') {
    const number = Number(body.stall);
    const count = (v: unknown) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : null;
    };
    const likes = count(body.likes);
    const shares = count(body.shares);
    if (!Number.isInteger(number)) return bad('Unknown stall.', 404);
    if (likes == null || shares == null) return bad('Likes and shares must be whole numbers, 0 or more.');
    const url = typeof body.url === 'string' && body.url.trim() ? cleanLink(body.url.trim()) : null;
    if (typeof body.url === 'string' && body.url.trim() && !url) return bad('The video link must start with https://');
    const ok = await setViral(number, likes, shares, url);
    if (!ok) return bad('Unknown stall.', 404);
    return NextResponse.json({ ok: true });
  }

  if (resource === 'people') {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return bad('Unknown person.', 404);
    const patch: { isActive?: boolean; assigned?: number[]; name?: string; email?: string; role?: 'admin' | 'judge' } = {};
    const newName = text(body.name, 80);
    if (newName) patch.name = newName;
    if (typeof body.email === 'string' && body.email.trim()) {
      if (!isUthmEmail(body.email)) return bad(uthmOnly);
      patch.email = body.email.trim();
    }
    if (body.role === 'admin' || body.role === 'judge') patch.role = body.role;
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
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

// ---------------------------------------------------------------------------
// Every successful admin change is written to the activity log.
// ---------------------------------------------------------------------------

function actorOf(s: Session) {
  return { uid: s.uid, email: s.email, name: s.name, role: s.role };
}

type Body = Record<string, any> | null;

async function describe(method: string, resource: string, b: Body, out: Body): Promise<{ summary: string; target: string | null } | null> {
  const stall = b?.stall ?? b?.number;
  const who = async (id: unknown) => (await accountById(Number(id)))?.name ?? `account ${String(id)}`;
  switch (`${method} ${resource}`) {
    case 'POST stalls':
      return { summary: `Added stall ${out?.number ?? ''}`.trim(), target: out?.number ? `stall ${out.number}` : null };
    case 'POST team':
      return { summary: `Added ${b?.email} to stall ${stall}${b?.leader ? ' as leader' : ''}`, target: `stall ${stall}` };
    case 'POST teams-import':
      return { summary: `Imported groups: ${out?.added ?? 0} members added${out?.errors?.length ? `, ${out.errors.length} rows skipped` : ''}`, target: null };
    case 'POST announcements':
      return { summary: `Posted announcement "${b?.title}" to ${b?.audience === 'sellers' ? 'sellers' : b?.audience === 'judges' ? 'juries' : 'everyone'}`, target: null };
    case 'POST allocate':
      return { summary: `Allocated stalls automatically (${b?.perStall ?? 2} juries per stall)`, target: `competition ${b?.competitionId}` };
    case 'POST people-import':
      return { summary: `Imported juries: ${out?.created ?? 0} added, ${out?.updated ?? 0} updated`, target: null };
    case 'POST people':
      return { summary: `Added ${b?.name} as ${b?.role === 'admin' ? 'admin' : 'jury'}`, target: String(b?.email ?? '') };
    case 'DELETE team':
      return { summary: `Removed ${b?.email} from stall ${stall}`, target: `stall ${stall}` };
    case 'DELETE announcements':
      return { summary: `Deleted announcement ${b?.id}`, target: null };
    case 'PATCH team':
      return { summary: `Made ${b?.email} the leader of stall ${stall}`, target: `stall ${stall}` };
    case 'PATCH announcements':
      return { summary: `${b?.pinned ? 'Pinned' : 'Unpinned'} announcement ${b?.id}`, target: null };
    case 'PATCH allocate':
      return { summary: `Set ${await who(b?.judgeId)}'s stalls: ${Array.isArray(b?.stalls) && b.stalls.length ? b.stalls.join(', ') : 'any stall'}`, target: `competition ${b?.competitionId}` };
    case 'PATCH viral':
      return { summary: `Updated viral video counts for stall ${stall} (${b?.likes} likes, ${b?.shares} shares)`, target: `stall ${stall}` };
    case 'PATCH people': {
      const parts = [b?.role && `role ${b.role}`, typeof b?.isActive === 'boolean' && (b.isActive ? 'switched on' : 'switched off'), Array.isArray(b?.assigned) && 'awards changed', b?.email && `email ${b.email}`, b?.name && 'name changed'].filter(Boolean);
      return { summary: `Updated ${await who(b?.id)}: ${parts.join(', ') || 'details'}`, target: null };
    }
    case 'PATCH stalls':
      return { summary: `Edited stall ${stall} (${b?.name})`, target: `stall ${stall}` };
    case 'PATCH settings':
      if (typeof b?.resultsPublished === 'boolean') return { summary: b.resultsPublished ? 'Published the results' : 'Hid the results', target: null };
      return { summary: b?.votingOpen ? 'Opened customer voting' : 'Closed customer voting', target: null };
    case 'PATCH competitions':
      return { summary: `${b?.isOpen ? 'Opened' : 'Closed'} judging for competition ${b?.id}`, target: `competition ${b?.id}` };
    case 'PATCH memories':
      return { summary: `Set memory ${b?.id} to ${b?.status}`, target: `memory ${b?.id}` };
    default:
      return null; // 'users' logs itself, with the before and after
  }
}

async function logged(method: 'POST' | 'DELETE' | 'PATCH', req: Request, ctx: Ctx, handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  const body = (await req.clone().json().catch(() => null)) as Body;
  const res = await handler(req, ctx);
  if (res.ok) {
    try {
      const session = await getSession();
      const { resource } = await ctx.params;
      const out = (await res.clone().json().catch(() => null)) as Body;
      const d = session ? await describe(method, resource, body, out) : null;
      if (session && d) await logEvent(actorOf(session), 'admin', `${resource}.${method.toLowerCase()}`, d.summary, d.target);
    } catch (err) {
      console.error('admin log', err);
    }
  }
  return res;
}

/** POST /api/admin/{stalls|team|teams-import|announcements|allocate|people-import|people} */
export const POST = (req: Request, ctx: Ctx) => logged('POST', req, ctx, handlePOST);
/** DELETE /api/admin/{team|announcements} */
export const DELETE = (req: Request, ctx: Ctx) => logged('DELETE', req, ctx, handleDELETE);
/** PATCH /api/admin/{users|people|team|announcements|allocate|viral|stalls|settings|competitions|memories} */
export const PATCH = (req: Request, ctx: Ctx) => logged('PATCH', req, ctx, handlePATCH);
