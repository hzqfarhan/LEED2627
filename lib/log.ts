// Activity log: a short, readable record of who did what.
// Writing to the log must never break the action itself, so every error is swallowed.

import { hasDb, q } from './db';
import { demo } from './demo';
import type { LogEntry, LogKind } from './shared';

export interface Actor {
  uid?: number | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

const KEEP_IN_DEMO = 500;

export async function logEvent(actor: Actor | null, kind: LogKind, action: string, summary: string, target: string | null = null): Promise<void> {
  try {
    if (!hasDb) {
      const d = demo();
      d.log.unshift({
        id: (d.log[0]?.id ?? 0) + 1,
        at: new Date().toISOString(),
        actorId: actor?.uid ?? null,
        actorEmail: actor?.email ?? null,
        actorName: actor?.name ?? null,
        actorRole: actor?.role ?? null,
        kind,
        action,
        summary: summary.slice(0, 300),
        target,
      });
      d.log.length = Math.min(d.log.length, KEEP_IN_DEMO);
      return;
    }
    await q(
      `INSERT INTO activity_log (actor_id, actor_email, actor_name, actor_role, kind, action, summary, target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actor?.uid ?? null, actor?.email ?? null, actor?.name ?? null, actor?.role ?? null, kind, action, summary.slice(0, 300), target],
    );
  } catch (err) {
    console.error('activity log', err);
  }
}

export interface LogQuery {
  kind?: LogKind | null;
  actorId?: number | null;
  /** Matches the person's email or name, the summary or the target. */
  search?: string | null;
  /** Only entries older than this id (for "Load older"). */
  before?: number | null;
  limit?: number;
}

export async function listLog(query: LogQuery = {}): Promise<LogEntry[]> {
  const limit = Math.min(Math.max(query.limit ?? 60, 1), 200);
  const s = query.search?.trim().toLowerCase() || null;
  if (!hasDb) {
    return demo()
      .log.filter(
        (e) =>
          (!query.kind || e.kind === query.kind) &&
          (!query.actorId || e.actorId === query.actorId) &&
          (!query.before || e.id < query.before) &&
          (!s || [e.actorEmail, e.actorName, e.summary, e.target].some((v) => v?.toLowerCase().includes(s))),
      )
      .slice(0, limit);
  }
  const rows = await q<Record<string, any>>(
    `SELECT id, at, actor_id, actor_email, actor_name, actor_role, kind, action, summary, target
     FROM activity_log
     WHERE ($1::text IS NULL OR kind = $1)
       AND ($2::int IS NULL OR actor_id = $2)
       AND ($3::bigint IS NULL OR id < $3)
       AND ($4::text IS NULL OR lower(coalesce(actor_email, '') || ' ' || coalesce(actor_name, '') || ' ' || summary || ' ' || coalesce(target, '')) LIKE '%' || $4 || '%')
     ORDER BY id DESC
     LIMIT $5`,
    [query.kind ?? null, query.actorId ?? null, query.before ?? null, s, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    kind: r.kind,
    action: r.action,
    summary: r.summary,
    target: r.target,
  }));
}

/** The fields of a signed-in session (or account) the log needs. */
export function asActor(s: { uid?: number; id?: number; email: string; name: string; role: string }): Actor {
  return { uid: s.uid ?? s.id ?? null, email: s.email, name: s.name, role: s.role };
}
