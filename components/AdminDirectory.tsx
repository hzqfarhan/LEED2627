'use client';

// Admin console: every registered group, every account (with a changeable role) and the activity log.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import StallLogo from './StallLogo';
import { timeAgo } from './SellerTools';
import { categoryName } from '@/lib/event';
import { CANOPY, isUnnamed, type LogEntry, type LogKind, type Stall, type StallMember, type UserRow } from '@/lib/shared';
import { photoCandidates } from '@/lib/uthm';

type Call = (method: 'POST' | 'PATCH' | 'DELETE', resource: string, body: unknown) => Promise<boolean>;

const ZONE = 'Asia/Kuala_Lumpur';
const ROLE_NAME: Record<UserRow['role'], string> = { customer: 'Customer', judge: 'Jury', admin: 'Committee' };

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

// ---------------------------------------------------------------------------
// Groups: every stall that has a team
// ---------------------------------------------------------------------------

export function GroupsTab({ stalls, teams, onShowLog }: { stalls: Stall[]; teams: Record<number, StallMember[]>; onShowLog: (search: string) => void }) {
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting' | 'complete'>('all');
  const [search, setSearch] = useState('');
  const ref = useDialog(openNo != null);

  const groups = stalls
    .filter((s) => (teams[s.number]?.length ?? 0) > 0)
    .map((s) => {
      const team = teams[s.number] ?? [];
      const on = team.filter((m) => m.joined).length;
      return { stall: s, team, on, waiting: team.length - on };
    });
  const members = groups.reduce((n, g) => n + g.team.length, 0);
  const connected = groups.reduce((n, g) => n + g.on, 0);
  const q = search.trim().toLowerCase();
  const shown = groups.filter(
    (g) =>
      (filter === 'all' || (filter === 'waiting' ? g.waiting > 0 : g.waiting === 0)) &&
      (!q ||
        [g.stall.name, g.stall.groupName ?? '', String(g.stall.number), ...g.team.flatMap((m) => [m.email, m.name ?? ''])].some((v) => v.toLowerCase().includes(q))),
  );
  const open = groups.find((g) => g.stall.number === openNo) ?? null;
  const tone = CANOPY[open?.stall.colour ?? 'none'];

  return (
    <section className="stack">
      <div className="dir-stats">
        <div>
          <strong>{groups.length}</strong>
          <span>groups registered</span>
        </div>
        <div>
          <strong>{members}</strong>
          <span>team members</span>
        </div>
        <div className={connected === members ? 'is-good' : 'is-warn'}>
          <strong>
            {connected}/{members}
          </strong>
          <span>signed in</span>
        </div>
        <div>
          <strong>{stalls.length - groups.length}</strong>
          <span>stalls without a group</span>
        </div>
      </div>

      <div className="dir-tools">
        <input type="search" className="dir-search" placeholder="Search stall, group, name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search groups" />
        <div className="seg" role="group" aria-label="Show">
          {(
            [
              ['all', `All ${groups.length}`],
              ['waiting', `Someone missing ${groups.filter((g) => g.waiting > 0).length}`],
              ['complete', `All signed in ${groups.filter((g) => g.waiting === 0).length}`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="seg-btn" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">{groups.length === 0 ? 'No groups yet. Add them under Team setup.' : 'No group matches.'}</p>
      ) : (
        <ul className="group-grid">
          {shown.map(({ stall, team, on, waiting }) => {
            const t = CANOPY[stall.colour ?? 'none'];
            return (
              <li key={stall.number}>
                <button type="button" className="group-card" onClick={() => setOpenNo(stall.number)} style={{ borderTopColor: t.fill }}>
                  <span className="group-card-head">
                    <span className="stall-plate stall-plate--small" style={{ background: t.fill, color: t.ink }}>
                      {stall.number}
                    </span>
                    <span>
                      <strong>{isUnnamed(stall) ? 'Not named yet' : stall.name}</strong>
                      <small>{stall.groupName ?? 'No group name'}</small>
                    </span>
                    <StallLogo number={stall.number} version={stall.logoVersion} name={stall.name} size={36} className="stall-logo--end" />
                  </span>
                  <span className="group-faces" aria-hidden="true">
                    {team.slice(0, 6).map((m) => (
                      <span key={m.email} className={m.joined ? '' : 'is-wait'}>
                        <Avatar name={m.name ?? m.email} photos={m.photos} size={34} />
                      </span>
                    ))}
                    {team.length > 6 && <span className="group-more">+{team.length - 6}</span>}
                  </span>
                  <span className={`group-state${waiting ? ' group-state--wait' : ''}`}>
                    {on}/{team.length} signed in{waiting ? `, ${waiting} waiting` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <dialog ref={ref} className="viewer dir-dialog" onClose={() => setOpenNo(null)} aria-labelledby="group-title">
        {open && (
          <div className="dir-dialog-card">
            <header className="dir-dialog-head" style={{ background: tone.fill, color: tone.ink }}>
              <span className="dir-dialog-no">{open.stall.number}</span>
              <StallLogo number={open.stall.number} version={open.stall.logoVersion} name={open.stall.name} size={56} className="stall-logo--hero" />
              <div>
                <h2 id="group-title">{isUnnamed(open.stall) ? `Stall ${open.stall.number}` : open.stall.name}</h2>
                <p>
                  {[open.stall.groupName, categoryName(open.stall.category), open.stall.ssmNumber && `SSM ${open.stall.ssmNumber}`].filter(Boolean).join(', ') || 'No details yet'}
                </p>
              </div>
            </header>
            <div className="dir-dialog-body">
              <div className="dir-dialog-pills">
                <span className={`pill ${open.waiting ? 'pill--warn' : 'pill--ok'}`}>
                  {open.on}/{open.team.length} signed in
                </span>
                <span className={`pill ${open.stall.posterVersion ? 'pill--ok' : 'pill--off'}`}>{open.stall.posterVersion ? 'Poster uploaded' : 'No poster'}</span>
                <span className={`pill ${open.stall.logoVersion ? 'pill--ok' : 'pill--off'}`}>{open.stall.logoVersion ? 'Logo added' : 'No logo'}</span>
                <span className={`pill ${open.stall.pitchUrl ? 'pill--ok' : 'pill--off'}`}>{open.stall.pitchUrl ? 'Pitch video added' : 'No pitch video'}</span>
              </div>
              <ul className="dir-members">
                {open.team.map((m) => (
                  <li key={m.email} className={m.joined ? '' : 'is-wait'}>
                    <span className="member-face">
                      <Avatar name={m.name ?? m.email} photos={m.photos} size={48} />
                      <span className="member-dot" aria-hidden="true" />
                    </span>
                    <span className="dir-member-text">
                      <span className="member-name">
                        <strong>{m.name ?? m.email.split('@')[0].toUpperCase()}</strong>
                        {m.isLeader && <span className="tag tag--leader">Leader</span>}
                      </span>
                      <span className="member-email">{m.email}</span>
                      <span className={`member-status ${m.joined ? 'member-status--on' : 'member-status--wait'}`} suppressHydrationWarning>
                        {m.joined ? `Last signed in ${timeAgo(m.lastSeen) || 'before'}` : `Not signed in yet${m.addedAt ? `, added ${timeAgo(m.addedAt)}` : ''}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="row-actions">
                <button type="button" className="btn btn--line btn--small" onClick={() => { setOpenNo(null); onShowLog(`stall ${open.stall.number}`); }}>
                  See this stall’s activity
                </button>
                <button type="button" className="btn btn--dark btn--small" onClick={() => setOpenNo(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Users: every account, with a changeable role
// ---------------------------------------------------------------------------

type Check = { level: 'block' | 'warn' | 'info'; text: string };

/** What the committee should know before changing someone's role or switching their account off. */
function checksFor(u: UserRow, role: UserRow['role'] | undefined, isActive: boolean | undefined, all: UserRow[]): Check[] {
  const out: Check[] = [];
  const otherAdmins = all.filter((x) => x.role === 'admin' && x.isActive && x.id !== u.id).length;
  if (role) {
    if (role === u.role) out.push({ level: 'block', text: `${u.name} is already ${ROLE_NAME[role].toLowerCase()}.` });
    if (u.role === 'admin' && otherAdmins === 0) out.push({ level: 'block', text: 'They are the only active committee member left. Make someone else committee first.' });
    if (!u.isActive) out.push({ level: 'warn', text: 'This account is switched off. Switch it on too, or they still cannot sign in.' });
    if (role === 'admin') out.push({ level: 'warn', text: 'Committee members see every mark, change any account and can publish the results.' });
    if (u.role === 'admin' && role !== 'admin') out.push({ level: 'warn', text: 'They lose the admin console straight away.' });
    if (role === 'judge') {
      if (u.stall != null) out.push({ level: 'warn', text: `They are on stall ${u.stall}'s team, so the app will not let them score stall ${u.stall}.` });
      out.push({ level: 'info', text: 'Next, choose their awards and stalls under Jury and admins.' });
    }
    if (u.role === 'judge' && role !== 'judge' && u.scored > 0) out.push({ level: 'warn', text: `Their ${u.scored} saved score sheet${u.scored === 1 ? '' : 's'} stay in the results.` });
  }
  if (isActive === false) {
    if (u.role === 'admin' && otherAdmins === 0) out.push({ level: 'block', text: 'They are the only active committee member left.' });
    out.push({ level: 'warn', text: 'They are signed out on their next page and cannot sign in until switched back on.' });
    if (u.role === 'judge' && u.scored > 0) out.push({ level: 'info', text: `Their ${u.scored} saved score sheet${u.scored === 1 ? '' : 's'} stay in the results.` });
    if (u.stall != null) out.push({ level: 'info', text: `They stay on stall ${u.stall}'s team list${u.isLeader ? ' as leader; hand the leader role to a groupmate under Team setup' : ''}.` });
  }
  if (!u.lastLoginAt && (role || isActive)) out.push({ level: 'info', text: 'They have not signed in yet. This applies from their first UTHM SSO sign-in.' });
  return out;
}

type RoleFilter = 'all' | 'customer' | 'seller' | 'judge' | 'admin' | 'off';

export function UsersTab({ users, me, busy, call }: { users: UserRow[]; me: number; busy: boolean; call: Call }) {
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(60);
  const [pending, setPending] = useState<{ user: UserRow; role?: UserRow['role']; isActive?: boolean } | null>(null);
  const [logFor, setLogFor] = useState<UserRow | null>(null);
  const logRef = useDialog(logFor != null);

  const counts = useMemo(
    () => ({
      all: users.length,
      customer: users.filter((u) => u.role === 'customer' && u.stall == null).length,
      seller: users.filter((u) => u.stall != null).length,
      judge: users.filter((u) => u.role === 'judge').length,
      admin: users.filter((u) => u.role === 'admin').length,
      off: users.filter((u) => !u.isActive).length,
    }),
    [users],
  );
  const q = search.trim().toLowerCase();
  const shown = users.filter((u) => {
    const byRole =
      filter === 'all' ||
      (filter === 'customer' && u.role === 'customer' && u.stall == null) ||
      (filter === 'seller' && u.stall != null) ||
      (filter === 'off' && !u.isActive) ||
      u.role === filter;
    return byRole && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q) || (u.stall != null && `stall ${u.stall}`.includes(q)));
  });

  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [pending]);
  const checks = pending ? checksFor(pending.user, pending.role, pending.isActive, users) : [];
  // Giving someone committee access, or taking it away, needs their ID typed in, so it is never a slip.
  const needsTyping = Boolean(pending?.role && (pending.role === 'admin' || pending.user.role === 'admin'));
  const typeWord = pending ? pending.user.email.split('@')[0].toLowerCase() : '';

  const apply = async () => {
    if (!pending) return;
    await call('PATCH', 'users', { id: pending.user.id, role: pending.role, isActive: pending.isActive });
    setPending(null);
  };

  const FILTERS: [RoleFilter, string][] = [
    ['all', 'Everyone'],
    ['customer', 'Customers'],
    ['seller', 'Sellers'],
    ['judge', 'Juries'],
    ['admin', 'Committee'],
    ['off', 'Switched off'],
  ];

  return (
    <section className="stack">
      <div className="dir-tools">
        <input type="search" className="dir-search" placeholder="Search name, email or stall" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(60); }} aria-label="Search accounts" />
      </div>
      <div className="chip-filter" role="group" aria-label="Filter by role">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setLimit(60); }}>
            {label} <span>{counts[id]}</span>
          </button>
        ))}
      </div>
      <p className="muted small">
        A seller is a customer on a stall team: change their team under Team setup. Juries and committee members keep their stall team if they have one.
      </p>

      <ul className="user-list">
        {shown.slice(0, limit).map((u) => (
          <li key={u.id} className={`user-row${u.isActive ? '' : ' is-off'}`}>
            <Avatar name={u.name} photos={u.photos} size={44} />
            <span className="user-text">
              <span className="member-name">
                <strong>{u.name}</strong>
                {u.id === me && <span className="tag tag--you">You</span>}
                {u.stall != null && <span className="tag tag--seller">Seller, stall {u.stall}{u.isLeader ? ' (leader)' : ''}</span>}
                {!u.isActive && <span className="tag tag--off">Switched off</span>}
              </span>
              <span className="member-email">{u.email}</span>
              <span className="user-seen" suppressHydrationWarning>
                {u.lastLoginAt ? `Last signed in ${timeAgo(u.lastLoginAt)}` : 'Never signed in'}
              </span>
            </span>
            <span className="user-controls">
              <label className={`role-select role-select--${u.role}`}>
                <span className="sr-only">Role for {u.name}</span>
                <select
                  value={u.role}
                  disabled={busy || u.id === me}
                  onChange={(e) => setPending({ user: u, role: e.target.value as UserRow['role'] })}
                >
                  <option value="customer">Customer</option>
                  <option value="judge">Jury</option>
                  <option value="admin">Committee</option>
                </select>
              </label>
              <button type="button" className="btn btn--line btn--small" onClick={() => setLogFor(u)}>
                Activity
              </button>
              {u.id !== me && (
                <button
                  type="button"
                  className={`icon-btn ${u.isActive ? 'icon-btn--off' : 'icon-btn--on'}`}
                  disabled={busy}
                  onClick={() => setPending({ user: u, isActive: !u.isActive })}
                  aria-label={`${u.isActive ? 'Switch off' : 'Switch on'} ${u.name}’s account`}
                  title={u.isActive ? 'Switch off account' : 'Switch on account'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v8" />
                    <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
                  </svg>
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {shown.length > limit && (
        <button type="button" className="btn btn--line" onClick={() => setLimit((n) => n + 60)}>
          Show more ({shown.length - limit} left)
        </button>
      )}
      {shown.length === 0 && <p className="muted">No account matches.</p>}

      <ConfirmDialog
        open={pending != null}
        tone={pending?.role === 'customer' || pending?.isActive === false || (pending?.role && pending.user.role === 'admin') ? 'danger' : 'plain'}
        title={
          pending?.role
            ? `Make ${pending.user.name} ${pending.role === 'admin' ? 'a committee member' : pending.role === 'judge' ? 'a jury' : 'a customer'}?`
            : pending?.isActive === false
              ? `Switch off ${pending?.user.name}’s account?`
              : `Switch on ${pending?.user.name}’s account?`
        }
        art={pending && <Avatar name={pending.user.name} photos={pending.user.photos} size={72} className="confirm-avatar" />}
        confirmLabel={pending?.role ? `Make ${ROLE_NAME[pending.role]}` : pending?.isActive === false ? 'Switch off' : 'Switch on'}
        cancelLabel="Cancel"
        busy={busy}
        confirmDisabled={checks.some((c) => c.level === 'block') || (needsTyping && typed.trim().toLowerCase() !== typeWord)}
        onCancel={() => setPending(null)}
        onConfirm={() => void apply()}
      >
        {pending && (
          <>
            <p className="confirm-email">{pending.user.email}</p>
            {pending.role && (
              <p className="role-change">
                <span className={`role-chip role-chip--${pending.user.role}`}>{ROLE_NAME[pending.user.role]}</span>
                <span aria-hidden="true">→</span>
                <span className={`role-chip role-chip--${pending.role}`}>{ROLE_NAME[pending.role]}</span>
              </p>
            )}
            {checks.length > 0 && (
              <ul className="checks">
                {checks.map((c) => (
                  <li key={c.text} className={`check check--${c.level}`}>
                    <span className="check-icon" aria-hidden="true">
                      {c.level === 'block' ? '✕' : c.level === 'warn' ? '!' : 'i'}
                    </span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {needsTyping && (
              <label className="field type-confirm">
                <span>
                  Type <strong>{typeWord}</strong> to confirm
                </span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={typeWord} />
              </label>
            )}
          </>
        )}
      </ConfirmDialog>

      <dialog ref={logRef} className="viewer dir-dialog" onClose={() => setLogFor(null)} aria-labelledby="user-log-title">
        {logFor && (
          <div className="dir-dialog-card">
            <header className="dir-dialog-head dir-dialog-head--user">
              <Avatar name={logFor.name} photos={logFor.photos} size={56} />
              <div>
                <h2 id="user-log-title">{logFor.name}</h2>
                <p>
                  {logFor.email}, {ROLE_NAME[logFor.role]}
                  {logFor.stall != null ? `, stall ${logFor.stall}` : ''}
                </p>
              </div>
            </header>
            <div className="dir-dialog-body">
              <LogFeed actorId={logFor.id} compact />
              <div className="row-actions">
                <button type="button" className="btn btn--dark btn--small" onClick={() => setLogFor(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

const KIND_NAME: Record<LogKind, string> = { admin: 'Admin', user: 'User', auth: 'Sign-in' };

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONE });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: ZONE });
}

/** The log, newest first, with "Load older". Used by the Activity log tab and each person's Activity pop-up. */
export function LogFeed({ kind = null, actorId = null, search = '', compact = false }: { kind?: LogKind | null; actorId?: number | null; search?: string; compact?: boolean }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (before: number | null) => {
      setState('loading');
      const p = new URLSearchParams();
      if (kind) p.set('kind', kind);
      if (actorId) p.set('actor', String(actorId));
      if (search.trim()) p.set('q', search.trim());
      if (before) p.set('before', String(before));
      try {
        const res = await fetch(`/api/admin/log?${p}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { entries: LogEntry[] };
        setEntries((old) => (before ? [...old, ...data.entries] : data.entries));
        setMore(data.entries.length >= 60);
        setState('ready');
      } catch {
        setState('error');
      }
    },
    [kind, actorId, search],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void load(null), search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, search]);

  if (state === 'error' && entries.length === 0) return <p className="note note--bad">The log could not be loaded. Check your connection and try again.</p>;
  if (state === 'ready' && entries.length === 0) return <p className="muted">Nothing recorded yet.</p>;

  let lastDay = '';
  return (
    <div className={`log${compact ? ' log--compact' : ''}`}>
      <ol className="log-list">
        {entries.map((e) => {
          const day = dayOf(e.at);
          const head = day !== lastDay;
          lastDay = day;
          return (
            <li key={e.id} className={`log-row log-row--${e.kind}`}>
              {head && <h4 className="log-day">{day}</h4>}
              <div className="log-item">
                <time dateTime={e.at} className="log-time">
                  {clock(e.at)}
                </time>
                {!compact && <Avatar name={e.actorName ?? e.actorEmail ?? '?'} photos={e.actorEmail ? photoCandidates(e.actorEmail) : []} size={34} />}
                <div className="log-text">
                  {!compact && (
                    <span className="log-who">
                      <strong>{e.actorName ?? e.actorEmail ?? 'Visitor'}</strong>
                      {e.actorRole && <span className={`role-chip role-chip--${e.actorRole}`}>{e.actorRole === 'judge' ? 'Jury' : e.actorRole === 'admin' ? 'Committee' : e.actorRole[0].toUpperCase() + e.actorRole.slice(1)}</span>}
                    </span>
                  )}
                  <span className="log-what">{e.summary}</span>
                </div>
                <span className={`log-kind log-kind--${e.kind}`}>{KIND_NAME[e.kind]}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {state === 'loading' && <p className="muted">Loading…</p>}
      {more && state !== 'loading' && (
        <button type="button" className="btn btn--line btn--small" onClick={() => void load(entries[entries.length - 1]?.id ?? null)}>
          Load older
        </button>
      )}
    </div>
  );
}

export function LogTab({ initialSearch = '' }: { initialSearch?: string }) {
  const [kind, setKind] = useState<LogKind | null>(null);
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => setSearch(initialSearch), [initialSearch]);

  const KINDS: [LogKind | null, string, string][] = [
    [null, 'Everything', 'Every action, newest first'],
    ['admin', 'Admin actions', 'Changes made in this console'],
    ['user', 'User activity', 'Votes, ratings, scores, stall and team changes'],
    ['auth', 'Sign-ins', 'Sign-ins, sign-outs and refused emails'],
  ];

  return (
    <section className="stack">
      <div className="log-kinds" role="group" aria-label="Show">
        {KINDS.map(([id, label, hint]) => (
          <button key={label} type="button" aria-pressed={kind === id} className={`log-kind-btn log-kind-btn--${id ?? 'all'}`} onClick={() => setKind(id)}>
            <strong>{label}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <input type="search" className="dir-search" placeholder="Search a name, email, stall (e.g. stall 7) or action" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the log" />
      <LogFeed kind={kind} search={search} />
    </section>
  );
}
