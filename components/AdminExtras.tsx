'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Avatar from './Avatar';
import { CANOPY, type Announcement, type Competition, type Person, type Stall, type StallMember } from '@/lib/shared';

type Call = (method: 'POST' | 'PATCH' | 'DELETE', resource: string, body: unknown) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Groups and teams: which group runs which stall, and who is on each team
// ---------------------------------------------------------------------------

export function TeamsTab({ stalls, teams, busy, call }: { stalls: Stall[]; teams: Record<number, StallMember[]>; busy: boolean; call: Call }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null);
  const [filter, setFilter] = useState<'all' | 'empty'>('all');
  const withTeam = stalls.filter((s) => (teams[s.number]?.length ?? 0) > 0).length;

  const runImport = async () => {
    const rows = importText
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.replace(/\t/g, ',').split(',').map((c) => c.trim()))
      .filter((c) => c.length >= 2 && /^\d+$/.test(c[0]))
      .map(([stall, group, leader, ...members]) => ({ stall: Number(stall), group, leader, members: members.join(';') }));
    if (rows.length === 0) return;
    const res = await fetch('/api/admin/teams-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    const data = (await res.json().catch(() => null)) as { added?: number; errors?: string[] } | null;
    setResult({ added: data?.added ?? 0, errors: data?.errors ?? (res.ok ? [] : ['The import failed. Check the format.']) });
    if (res.ok && !data?.errors?.length) setImportText('');
    router.refresh();
  };

  const add = async (e: FormEvent<HTMLFormElement>, stall: number) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    if (await call('POST', 'team', { stall, email: d.get('email'), leader: d.get('leader') === 'on' })) form.reset();
  };

  const shown = stalls.filter((s) => filter === 'all' || (teams[s.number]?.length ?? 0) === 0);

  return (
    <section className="stack">
      <div className="card stack import-box">
        <h3>Set up groups from a spreadsheet</h3>
        <p className="muted">
          One stall per line: <strong>stall number, group name, leader’s UTHM email, groupmates’ emails…</strong> The leader can add or remove
          groupmates later. Everyone sees their stall the first time they sign in with UTHM SSO.
        </p>
        <label className="field">
          <span className="sr-only">Groups to import</span>
          <textarea
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'7, Kumpulan 3 BIT21603, ai230007@student.uthm.edu.my, ai230011@student.uthm.edu.my, ai230015@student.uthm.edu.my'}
          />
        </label>
        <div className="row-actions">
          <button type="button" className="btn btn--go btn--small" disabled={busy || !importText.trim()} onClick={() => void runImport()}>
            Import groups
          </button>
        </div>
        {result && (
          <div className={`note note--${result.errors.length ? 'warn' : 'ok'}`} role="status">
            <p>
              {result.added} people added.{result.errors.length ? ` ${result.errors.length} need fixing:` : ''}
            </p>
            {result.errors.length > 0 && (
              <ul className="import-errors">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="results-bar">
        <p className="muted">
          {withTeam} of {stalls.length} stalls have a team.
        </p>
        <div className="seg" role="group" aria-label="Show">
          <button type="button" className="seg-btn" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All stalls
          </button>
          <button type="button" className="seg-btn" aria-pressed={filter === 'empty'} onClick={() => setFilter('empty')}>
            Without a team
          </button>
        </div>
      </div>

      <ul className="rows">
        {shown.map((s) => {
          const team = teams[s.number] ?? [];
          const tone = CANOPY[s.colour ?? 'none'];
          return (
            <li key={s.number} className="row row--wrap team-row">
              <span className="stall-plate" style={{ background: tone.fill, color: tone.ink }}>
                {s.number}
              </span>
              <div className="row-main">
                <strong>{s.name}</strong>
                <span className="muted">{s.groupName ?? 'No group name yet'}</span>
              </div>
              <span className="avatar-stack" aria-label={`${team.length} team members`}>
                {team.slice(0, 5).map((m) => (
                  <Avatar key={m.email} name={m.name ?? m.email} photos={m.photos} size={30} />
                ))}
                {team.length === 0 && <span className="tag tag--wait">No team</span>}
              </span>
              <button type="button" className="btn btn--line btn--small" aria-expanded={open === s.number} onClick={() => setOpen(open === s.number ? null : s.number)}>
                {open === s.number ? 'Close' : 'Manage team'}
              </button>
              {open === s.number && (
                <div className="team-manage">
                  <ul className="member-list">
                    {team.map((m) => (
                      <li key={m.email} className="member">
                        <Avatar name={m.name ?? m.email} photos={m.photos} size={36} />
                        <div className="member-text">
                          <strong>{m.name ?? m.email.split('@')[0]}</strong>
                          <span className="muted">{m.email}</span>
                          <span className="member-tags">
                            {m.isLeader && <span className="tag tag--leader">Leader</span>}
                            {!m.joined && <span className="tag tag--wait">Not signed in yet</span>}
                          </span>
                        </div>
                        <div className="member-actions">
                          {!m.isLeader && (
                            <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', 'team', { stall: s.number, email: m.email })}>
                              Make leader
                            </button>
                          )}
                          <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('DELETE', 'team', { stall: s.number, email: m.email })}>
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <form className="add-member" onSubmit={(e) => void add(e, s.number)}>
                    <label className="field">
                      <span>Add by UTHM email</span>
                      <input name="email" type="email" required placeholder="ai230123@student.uthm.edu.my" />
                    </label>
                    <label className="check">
                      <input type="checkbox" name="leader" defaultChecked={team.length === 0} />
                      <span>Team leader</span>
                    </label>
                    <button type="submit" className="btn btn--go btn--small" disabled={busy}>
                      Add
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const AUDIENCE = { everyone: 'Everyone', sellers: 'Sellers only', judges: 'Jury only' } as const;

export function NewsTab({ announcements, busy, call }: { announcements: Announcement[]; busy: boolean; call: Call }) {
  const post = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const ok = await call('POST', 'announcements', {
      title: d.get('title'),
      body: d.get('body'),
      audience: d.get('audience'),
      pinned: d.get('pinned') === 'on',
      email: d.get('email') === 'on',
    });
    if (ok) form.reset();
  };

  return (
    <section className="stack">
      <form className="card stack" onSubmit={post}>
        <h3>Post an announcement</h3>
        <p className="muted">“Everyone” shows on the home page. Seller and jury announcements show on their own pages. Everyone it is for also gets it under the bell.</p>
        <label className="field">
          <span>Title</span>
          <input name="title" required maxLength={120} placeholder="e.g. Judging starts at 12:00 pm" />
        </label>
        <label className="field">
          <span>Details (optional)</span>
          <textarea name="body" rows={3} maxLength={2000} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Who sees it</span>
            <select name="audience" defaultValue="everyone">
              {Object.entries(AUDIENCE).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" name="pinned" />
            <span>Pin to the top</span>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="email" defaultChecked />
          <span>Also email it: stall teams (leader, with teammates in CC) for Everyone and Sellers, and the jury for Everyone and Jury</span>
        </label>
        <div>
          <button type="submit" className="btn btn--go btn--small" disabled={busy}>
            Post announcement
          </button>
        </div>
      </form>

      {announcements.length === 0 ? (
        <div className="panel-empty">
          <h2>No announcements yet</h2>
          <p className="muted">Post one above, for example opening times or where to collect your stall kit.</p>
        </div>
      ) : (
        <ul className="rows">
          {announcements.map((a) => (
            <li key={a.id} className="row row--wrap">
              <div className="row-main">
                <strong>
                  {a.title}
                  <span className="tag">{AUDIENCE[a.audience]}</span>
                  {a.pinned && <span className="tag tag--leader">Pinned</span>}
                </strong>
                {a.body && <span className="muted">{a.body}</span>}
                <span className="muted">{new Date(a.createdAt).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', 'announcements', { id: a.id, pinned: !a.pinned })}>
                  {a.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  className="btn btn--line btn--small"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete “${a.title}”?`)) void call('DELETE', 'announcements', { id: a.id });
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Jury allocations
// ---------------------------------------------------------------------------

export function AllocationEditor({
  judge,
  competitions,
  stalls,
  current,
  busy,
  onSave,
}: {
  judge: Person;
  competitions: Competition[];
  stalls: Stall[];
  current: Record<string, number[]>;
  busy: boolean;
  onSave: (competitionId: number, stalls: number[]) => void;
}) {
  const [compId, setCompId] = useState<number>(competitions[0]?.id ?? 0);
  const [picked, setPicked] = useState<number[]>(current[String(competitions[0]?.id ?? 0)] ?? []);

  if (competitions.length === 0) {
    return <p className="muted alloc">Tick at least one competition for {judge.name} first.</p>;
  }

  const choose = (id: number) => {
    setCompId(id);
    setPicked(current[String(id)] ?? []);
  };
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  return (
    <div className="alloc">
      <div className="seg seg--wrap" role="group" aria-label="Competition">
        {competitions.map((c) => (
          <button key={c.id} type="button" className="seg-btn" aria-pressed={c.id === compId} onClick={() => choose(c.id)}>
            {c.name} ({(current[String(c.id)] ?? []).length || 'any'})
          </button>
        ))}
      </div>
      <p className="muted">
        Tap the stalls {judge.name} must judge. With none picked, they can judge any stall. {picked.length} picked.
      </p>
      <div className="alloc-grid" role="group" aria-label="Stalls">
        {stalls.map((s) => {
          const on = picked.includes(s.number);
          const tone = CANOPY[s.colour ?? 'none'];
          return (
            <button
              key={s.number}
              type="button"
              className="alloc-chip"
              aria-pressed={on}
              data-sfx="tick"
              style={on ? { background: tone.fill, color: tone.ink } : undefined}
              onClick={() => toggle(s.number)}
            >
              {s.number}
            </button>
          );
        })}
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn--go btn--small" disabled={busy} onClick={() => onSave(compId, picked)}>
          Save allocation
        </button>
        <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => setPicked([])}>
          Clear (any stall)
        </button>
      </div>
    </div>
  );
}

export function AutoAllocate({ competitions, people, busy, call }: { competitions: Competition[]; people: Person[]; busy: boolean; call: Call }) {
  const [compId, setCompId] = useState<number>(competitions[0]?.id ?? 0);
  const [perStall, setPerStall] = useState(2);
  const judges = people.filter((p) => p.role === 'judge' && p.isActive && p.assigned.includes(compId)).length;

  return (
    <div className="card stack">
      <h3>Allocate stalls to the jury</h3>
      <p className="muted">
        Share every stall in a competition among its active judges, so each stall gets the same number of judges. This replaces earlier
        allocations for that competition; adjust single judges below with “Allocated stalls”.
      </p>
      <div className="field-row">
        <label className="field">
          <span>Competition</span>
          <select value={compId} onChange={(e) => setCompId(Number(e.target.value))}>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Judges per stall</span>
          <input type="number" min={1} max={10} value={perStall} onChange={(e) => setPerStall(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn btn--go btn--small"
          disabled={busy || judges === 0}
          onClick={() => {
            if (window.confirm('Replace the stall allocations for this competition?')) void call('POST', 'allocate', { competitionId: compId, perStall });
          }}
        >
          Allocate automatically
        </button>
        <span className="muted">{judges} active judges assigned.</span>
      </div>
    </div>
  );
}
