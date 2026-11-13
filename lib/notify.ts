// Notifications: the bell in the navbar, plus an email for each one.
// Stall emails go to the team leader, with every other team member in CC.
// Emails are sent after the response (next/server `after`), so the committee never waits on them.

import { after } from 'next/server';
import { teamOf } from './accounts';
import { hasDb, q } from './db';
import { demo } from './demo';
import { renderEmail, sendMail, type EmailContent, type Mail } from './email';
import type { Notice, Role } from './shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Audience = 'everyone' | 'sellers' | 'judges';

export interface NoticeInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/** Run email work after the response when we are inside a request; otherwise just start it. */
function later(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

async function insert(rows: { email: string | null; audience: Audience | null }[], n: NoticeInput): Promise<void> {
  if (rows.length === 0) return;
  if (!hasDb) {
    const d = demo();
    const createdAt = new Date().toISOString();
    for (const r of rows) d.notifications.push({ id: d.nextId++, email: r.email, audience: r.audience, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, createdAt });
    return;
  }
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    values.push(r.email, r.audience);
    return `($${i * 2 + 1}, $${i * 2 + 2}, $${rows.length * 2 + 1}, $${rows.length * 2 + 2}, $${rows.length * 2 + 3}, $${rows.length * 2 + 4})`;
  });
  values.push(n.kind, n.title, n.body ?? null, n.link ?? null);
  await q(`INSERT INTO notifications (email, audience, kind, title, body, link) VALUES ${tuples.join(', ')}`, values);
}

async function stallName(stallNumber: number): Promise<string> {
  if (!hasDb) return demo().stalls.find((s) => s.number === stallNumber)?.name ?? `Stall ${stallNumber}`;
  const rows = await q<Row>(`SELECT name FROM stalls WHERE number = $1`, [stallNumber]);
  return rows[0]?.name ?? `Stall ${stallNumber}`;
}

/** Leader in To, everyone else in CC. With no leader set, the first member is the To. */
async function teamMail(stallNumber: number, content: EmailContent, subject: string): Promise<Mail | null> {
  const team = await teamOf(stallNumber);
  if (team.length === 0) return null;
  const leader = team.find((m) => m.isLeader) ?? team[0];
  const { html, text } = renderEmail(content);
  return { to: [leader.email], cc: team.filter((m) => m.email !== leader.email).map((m) => m.email), subject, html, text };
}

/**
 * Tell a stall team about something: a bell notification for every member, and one email
 * (leader in To, teammates in CC).
 */
export async function notifyStall(stallNumber: number, n: NoticeInput, email?: { subject: string; content: Omit<EmailContent, 'reason'> }): Promise<void> {
  const team = await teamOf(stallNumber);
  await insert(
    team.map((m) => ({ email: m.email, audience: null })),
    n,
  );
  if (!email) return;
  later(async () => {
    const name = await stallName(stallNumber);
    const mail = await teamMail(
      stallNumber,
      { ...email.content, reason: `You get this email because you are on the team for stall ${stallNumber}, ${name}, at LEED 26.` },
      email.subject,
    );
    if (mail) await sendMail([mail]);
  });
}

/**
 * A committee announcement: one bell notification for the whole audience, and (if asked)
 * an email to every stall team (sellers, everyone) and every judge (judges, everyone).
 */
export async function notifyAudience(audience: Audience, n: NoticeInput, email?: { subject: string; content: Omit<EmailContent, 'reason'> }): Promise<void> {
  await insert([{ email: null, audience }], n);
  if (!email) return;
  later(async () => {
    const mails: Mail[] = [];
    if (audience !== 'judges') {
      const numbers = hasDb
        ? (await q<Row>(`SELECT DISTINCT s.number FROM stall_members m JOIN stalls s ON s.id = m.stall_id ORDER BY s.number`)).map((r) => r.number as number)
        : [...new Set(Object.values(demo().members).map((m) => m.stall))].sort((a, b) => a - b);
      for (const no of numbers) {
        const mail = await teamMail(no, { ...email.content, reason: `You get this email because you are on a stall team at LEED 26 (stall ${no}).` }, email.subject);
        if (mail) mails.push(mail);
      }
    }
    if (audience !== 'sellers') {
      const judges = hasDb
        ? (await q<Row>(`SELECT email FROM users WHERE role = 'judge' AND is_active`)).map((r) => r.email as string)
        : demo().users.filter((u) => u.role === 'judge' && u.isActive).map((u) => u.email);
      const { html, text } = renderEmail({ ...email.content, reason: 'You get this email because you are on the LEED 26 jury.' });
      for (const j of judges) mails.push({ to: [j], subject: email.subject, html, text });
    }
    await sendMail(mails);
  });
}

function audiencesFor(role: Role): Audience[] {
  if (role === 'seller') return ['everyone', 'sellers'];
  if (role === 'judge') return ['everyone', 'judges'];
  if (role === 'admin') return ['everyone', 'sellers', 'judges'];
  return ['everyone'];
}

/** The latest notifications for someone, newest first, and how many they have not seen. */
export async function listNotices(who: { email: string; role: Role }, limit = 30): Promise<{ items: Notice[]; unread: number }> {
  const auds = audiencesFor(who.role);
  if (!hasDb) {
    const d = demo();
    const seen = d.notifSeen[who.email] ?? '';
    const mine = d.notifications
      .filter((x) => x.email === who.email || (x.audience && auds.includes(x.audience)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const items = mine.slice(0, limit).map((x) => ({ id: x.id, kind: x.kind, title: x.title, body: x.body, link: x.link, createdAt: x.createdAt, unread: x.createdAt > seen }));
    return { items, unread: mine.filter((x) => x.createdAt > seen).length };
  }
  const rows = await q<Row>(
    `WITH me AS (SELECT notif_seen_at FROM users WHERE email = $1)
     SELECT n.id, n.kind, n.title, n.body, n.link, n.created_at,
            (n.created_at > COALESCE((SELECT notif_seen_at FROM me), '-infinity'::timestamptz)) AS unread,
            COUNT(*) FILTER (WHERE n.created_at > COALESCE((SELECT notif_seen_at FROM me), '-infinity'::timestamptz)) OVER () AS unread_total
     FROM notifications n
     WHERE n.email = $1 OR n.audience = ANY($2::text[])
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $3`,
    [who.email, auds, limit],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      unread: Boolean(r.unread),
    })),
    unread: Number(rows[0]?.unread_total ?? 0),
  };
}

/** Everything up to now counts as read. */
export async function markSeen(email: string): Promise<void> {
  if (!hasDb) {
    demo().notifSeen[email] = new Date().toISOString();
    return;
  }
  await q(`UPDATE users SET notif_seen_at = now() WHERE email = $1`, [email]);
}
