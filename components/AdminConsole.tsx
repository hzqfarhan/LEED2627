'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { CLUSTERS, clusterName } from '@/lib/event';
import {
  CANOPY,
  STALL_COLOURS,
  criterionMarks,
  fmtScore,
  marksFor,
  isAccepting,
  isUnnamed,
  maxTotal,
  type Competition,
  type LeaderboardRow,
  type Memory,
  type Person,
  type Stall,
  type VoteTally,
} from '@/lib/shared';
import { CUSTOMER_CHOICE, PENDING_EMAIL_DOMAIN } from '@/lib/awards';

interface Props {
  competitions: Competition[];
  boards: Record<string, LeaderboardRow[]>;
  people: Person[];
  stalls: Stall[];
  memories: Memory[];
  demoMode: boolean;
  resultsPublished: boolean;
  votes: VoteTally[];
  votingOpen: boolean;
}

type Tab = 'overview' | 'results' | 'progress' | 'stalls' | 'people' | 'memories';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'results', label: 'Results' },
  { id: 'progress', label: 'Judge progress' },
  { id: 'stalls', label: 'Stalls' },
  { id: 'people', label: 'Judges and admins' },
  { id: 'memories', label: 'Memory wall' },
];

export default function AdminConsole({ competitions, boards, people, stalls, memories, demoMode, resultsPublished, votes, votingOpen }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [newPins, setNewPins] = useState<{ number: number; name: string; pin: string }[] | null>(null);
  const [compId, setCompId] = useState<number>(competitions[0]?.id ?? 0);
  const [showVotes, setShowVotes] = useState(false);
  const [editPerson, setEditPerson] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editStall, setEditStall] = useState<number | null>(null);
  const [pinFor, setPinFor] = useState<number | null>(null);

  // Keep the leaderboard fresh while judging is under way.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [router]);

  const call = async (method: 'POST' | 'PATCH', resource: string, body: unknown): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${resource}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'That change could not be saved. Try again.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('No connection. Check your internet and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createPins = async (replaceAll: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stall-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replaceAll }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; pins?: { number: number; name: string; pin: string }[] } | null;
      if (!res.ok || !data?.pins) setError(data?.error ?? 'Team PINs could not be created.');
      else {
        setNewPins(data.pins);
        router.refresh();
      }
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const downloadPins = () => {
    if (!newPins) return;
    const csv = ['Stall number,Stall name,Team PIN', ...newPins.map((p) => `${p.number},"${p.name.replace(/"/g, '""')}",${p.pin}`)].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv + '\r\n'], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leed26-team-pins.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPending = (email: string) => email.endsWith(`@${PENDING_EMAIL_DOMAIN}`);

  const parseCsv = (textIn: string): Record<string, string>[] => {
    const lines = textIn.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const split = (line: string) => {
      const out: string[] = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') quoted = false;
          else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') {
          out.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    if (lines.length === 0) return [];
    const head = split(lines[0]).map((h) => h.toLowerCase());
    const hasHeader = head.includes('email');
    const cols = hasHeader ? head : ['name', 'email', 'pin', 'awards', 'role'];
    return (hasHeader ? lines.slice(1) : lines).map((l) => {
      const cells = split(l);
      const row: Record<string, string> = {};
      cols.forEach((c, i) => (row[c] = cells[i] ?? ''));
      return row;
    });
  };

  const runImport = async () => {
    const rows = parseCsv(importText);
    if (rows.length === 0) {
      setError('Paste at least one line: name, email, PIN, awards.');
      return;
    }
    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/people-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; created?: number; updated?: number; errors?: string[] } | null;
      if (!res.ok || !data) setError(data?.error ?? 'The import failed. Check the format and try again.');
      else {
        setImportResult({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? [] });
        if ((data.errors ?? []).length === 0) setImportText('');
        router.refresh();
      }
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const savePerson = async (e: FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const ok = await call('PATCH', 'people', {
      id,
      name: d.get('name'),
      email: d.get('email'),
      pin: d.get('pin') || undefined,
      isActive: d.get('active') === 'on',
    });
    if (ok) setEditPerson(null);
  };

  const pendingJudges = people.filter((p) => isPending(p.email)).length;
  const judgeCount = people.filter((p) => p.role === 'judge' && p.isActive).length;
  const named = stalls.filter((s) => !isUnnamed(s)).length;
  const withPins = stalls.filter((s) => s.hasPin).length;
  const withVideos = stalls.filter((s) => s.pitchUrl || s.promoUrls.length > 0).length;
  const unassigned = competitions.filter((c) => !people.some((p) => p.isActive && p.assigned.includes(c.id)));
  const setup = [
    { done: !demoMode, label: 'Connect the database', hint: 'Set DATABASE_URL and run the SQL files in the db folder.', tab: null },
    { done: !people.some((p) => p.email === 'admin@leed26.local'), label: 'Replace the sample admin account', hint: 'Add your own admin, sign in with it, then deactivate admin@leed26.local.', tab: 'people' as Tab },
    { done: pendingJudges === 0, label: 'Every preloaded judge has a real email and PIN', hint: pendingJudges ? `${pendingJudges} still have a placeholder email. Import a CSV or edit them one by one.` : 'All set.', tab: 'people' as Tab },
    { done: judgeCount > 0 && unassigned.length === 0, label: 'Every competition has a judge', hint: unassigned.length ? `No judge yet for: ${unassigned.map((c) => c.name.replace(' Competition', '')).join(', ')}.` : `${judgeCount} active judges.`, tab: 'people' as Tab },
    { done: withPins === stalls.length, label: 'Every stall team has a PIN', hint: `${withPins} of ${stalls.length} stalls.`, tab: 'stalls' as Tab },
    { done: named === stalls.length, label: 'Every stall is named', hint: `${named} of ${stalls.length} named. Teams can do this themselves once they have a PIN.`, tab: 'stalls' as Tab },
  ];

  const comp = competitions.find((c) => c.id === compId) ?? competitions[0];
  const rows = comp ? (boards[String(comp.id)] ?? []) : [];
  const judges = people.filter((p) => p.assigned.length > 0 || p.role === 'judge');
  const pending = memories.filter((m) => m.status === 'pending');

  const saveStall = async (e: FormEvent<HTMLFormElement>, number: number) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const ok = await call('PATCH', 'stalls', {
      number,
      name: d.get('name'),
      groupName: d.get('groupName'),
      cluster: d.get('cluster'),
      colour: d.get('colour'),
      description: d.get('description'),
      instagram: d.get('instagram'),
      pitchUrl: d.get('pitchUrl'),
      promoUrls: [d.get('promo1'), d.get('promo2'), d.get('promo3')],
      teamPin: d.get('teamPin'),
    });
    if (ok) setEditStall(null);
  };

  const addPerson = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const ok = await call('POST', 'people', {
      name: d.get('name'),
      email: d.get('email'),
      pin: d.get('pin'),
      role: d.get('role'),
      assigned: d.getAll('assigned').map(Number),
    });
    if (ok) form.reset();
  };

  const toggleAssignment = (p: Person, competitionId: number) => {
    const assigned = p.assigned.includes(competitionId)
      ? p.assigned.filter((id) => id !== competitionId)
      : [...p.assigned, competitionId];
    void call('PATCH', 'people', { id: p.id, assigned });
  };

  const savePin = async (e: FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const ok = await call('PATCH', 'people', { id, pin: d.get('pin') });
    if (ok) setPinFor(null);
  };

  const addMemory = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: d.get('link'), caption: d.get('caption'), author: d.get('author'), year: d.get('year') }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'The memory could not be added.');
      } else {
        form.reset();
        router.refresh();
      }
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin">
      {demoMode && (
        <p className="note note--warn">
          <strong>Demo mode.</strong> No database is connected. Changes work while the server runs and are lost when it restarts.
          Set DATABASE_URL and run the SQL files in the db folder to keep data.
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => { setTab(t.id); setError(null); }}>
            {t.label}
            {t.id === 'memories' && pending.length > 0 && <span className="tab-count">{pending.length}</span>}
          </button>
        ))}
      </div>

      {error && (
        <p className="note note--bad" role="alert">
          {error}
        </p>
      )}

      {tab === 'overview' && (
        <section className="stack">
          <div className="stats">
            {competitions.map((c) => {
              const scored = (boards[String(c.id)] ?? []).length;
              return (
                <button key={c.id} type="button" className="stat" onClick={() => { setCompId(c.id); setTab('results'); }}>
                  <span className="stat-label">{c.name.replace(' Competition', '')}</span>
                  <span className="stat-n">
                    {scored}
                    <span className="muted"> / {stalls.length}</span>
                  </span>
                  <span className="muted">stalls scored. Judging {isAccepting(c) ? 'open' : 'closed'}.</span>
                </button>
              );
            })}
            <button type="button" className="stat" onClick={() => { setShowVotes(true); setTab('results'); }}>
              <span className="stat-label">{CUSTOMER_CHOICE.name}</span>
              <span className="stat-n">{votes.reduce((n, v) => n + v.likes + v.dislikes, 0)}</span>
              <span className="muted">votes so far. Voting {votingOpen ? 'open' : 'closed'}.</span>
            </button>
          </div>

          <div className="card stack">
            <h3>Before the event</h3>
            <ul className="checklist">
              {setup.map((s) => (
                <li key={s.label} className={s.done ? 'is-done' : undefined}>
                  <span className="checkmark" aria-hidden="true" />
                  <span className="checklist-text">
                    <strong>{s.label}</strong>
                    <span className="muted">{s.hint}</span>
                  </span>
                  {!s.done && s.tab && (
                    <button type="button" className="btn btn--line btn--small" onClick={() => setTab(s.tab as Tab)}>
                      Fix this
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted">{withVideos} of {stalls.length} stalls have added at least one video link.</p>
          </div>

          <div className="card stack">
            <h3>Customer Choice voting</h3>
            <p>
              Visitors vote on each stall’s page with “I like it” or “Not for me”. Voting is <strong>{votingOpen ? 'open' : 'closed'}</strong>.
            </p>
            <div className="row-actions">
              <button type="button" className={`btn btn--small ${votingOpen ? 'btn--line' : 'btn--go'}`} disabled={busy} onClick={() => void call('PATCH', 'settings', { votingOpen: !votingOpen })}>
                {votingOpen ? 'Close voting' : 'Open voting'}
              </button>
            </div>
          </div>

          <div className="card stack">
            <h3>Marks for the committee</h3>
            <p className="muted">One Excel file: winners, then a ranking sheet and a detailed marks sheet (level and marks per criterion, per judge) for every award, plus Customer Choice votes.</p>
            <div>
              <a className="btn btn--dark btn--small" href="/api/admin/export?type=xlsx" download>
                Download all marks (Excel)
              </a>
            </div>
          </div>

          <div className="card stack">
            <h3>Results page</h3>
            <p>
              The public results page is <strong>{resultsPublished ? 'showing the top 3 of every competition' : 'hidden'}</strong>.
              {resultsPublished ? '' : ' Publish it after the closing ceremony.'}
            </p>
            <div className="row-actions">
              <button type="button" className={`btn btn--small ${resultsPublished ? 'btn--line' : 'btn--go'}`} disabled={busy} onClick={() => void call('PATCH', 'settings', { resultsPublished: !resultsPublished })}>
                {resultsPublished ? 'Hide results' : 'Publish results'}
              </button>
              <a className="btn btn--line btn--small" href="/results">
                Preview results page
              </a>
            </div>
          </div>
        </section>
      )}

      {tab === 'results' && comp && (
        <section className="stack">
          <div className="seg" role="group" aria-label="Award">
            {competitions.map((c) => (
              <button key={c.id} type="button" className="seg-btn" aria-pressed={!showVotes && c.id === comp.id} onClick={() => { setShowVotes(false); setCompId(c.id); }}>
                {c.name.replace(' Competition', '')}
              </button>
            ))}
            <button type="button" className="seg-btn" aria-pressed={showVotes} onClick={() => setShowVotes(true)}>
              Customer Choice
            </button>
          </div>

          {showVotes ? (
            votes.length === 0 ? (
              <div className="panel-empty">
                <h2>No votes yet</h2>
                <p className="muted">Votes appear here as visitors tap “I like it” or “Not for me” on stall pages.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Stall</th>
                      <th scope="col" className="num">Likes</th>
                      <th scope="col" className="num">Not for me</th>
                      <th scope="col" className="num">Total votes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {votes.map((v) => (
                      <tr key={v.stallNumber} className={v.rank <= 3 ? 'is-top' : undefined}>
                        <td className="rank">{v.rank}</td>
                        <td>
                          <span className="stall-plate stall-plate--small" style={{ background: CANOPY[v.colour ?? 'none'].fill, color: CANOPY[v.colour ?? 'none'].ink }}>
                            {v.stallNumber}
                          </span>{' '}
                          {v.stallName}
                        </td>
                        <td className="num strong">{v.likes}</td>
                        <td className="num">{v.dislikes}</td>
                        <td className="num">{v.likes + v.dislikes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
          <>

          <div className="results-bar">
            <p>
              <span className={`dot ${isAccepting(comp) ? 'dot--on' : 'dot--off'}`} aria-hidden="true" />
              Judging is <strong>{isAccepting(comp) ? 'open' : 'closed'}</strong>
              {comp.isOpen && !isAccepting(comp) ? ' (outside its time window)' : ''}. {rows.length} of {stalls.length} stalls have at
              least one score.
            </p>
            <div className="row-actions">
              <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', 'competitions', { id: comp.id, isOpen: !comp.isOpen })}>
                {comp.isOpen ? 'Close judging' : 'Reopen judging'}
              </button>
              <button type="button" className="btn btn--line btn--small" onClick={() => router.refresh()}>
                Refresh now
              </button>
              <a className="btn btn--dark btn--small" href="/api/admin/export?type=xlsx" download>
                Download all marks (Excel)
              </a>
              <a className="btn btn--line btn--small" href={`/api/admin/export?competition=${comp.id}&type=scores`} download>
                This award only (CSV)
              </a>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="panel-empty">
              <h2>No scores yet</h2>
              <p className="muted">The ranking appears here as soon as the first judge saves a score. It refreshes every 30 seconds.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Stall</th>
                    <th scope="col" className="num">Judges</th>
                    <th scope="col" className="num">Average out of {fmtScore(maxTotal(comp))}</th>
                    {comp.criteria.map((k) => (
                      <th key={k.id} scope="col" className="num">
                        {k.name} (/{fmtScore(criterionMarks(comp, k.weight))})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.stallNumber} className={r.rank <= 3 ? 'is-top' : undefined}>
                      <td className="rank">{r.rank}</td>
                      <td>
                        <span className="stall-plate stall-plate--small" style={{ background: CANOPY[r.colour ?? 'none'].fill, color: CANOPY[r.colour ?? 'none'].ink }}>
                          {r.stallNumber}
                        </span>{' '}
                        {r.stallName}
                      </td>
                      <td className="num">{r.judges}</td>
                      <td className="num strong">{r.average.toFixed(2)}</td>
                      {comp.criteria.map((k) => (
                        <td key={k.id} className="num">
                          {marksFor(comp, k.weight, r.criteria[String(k.id)] ?? 0).toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">
            A stall’s result is the average of its judges’ totals, so stalls reached by fewer judges are not penalised. Stalls with the
            same average share a rank.
          </p>
          </>
          )}
        </section>
      )}

      {tab === 'progress' && (
        <section className="stack">
          {judges.length === 0 ? (
            <div className="panel-empty">
              <h2>No judges yet</h2>
              <p className="muted">Add judges in the “Judges and admins” tab and assign them to competitions.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Judge</th>
                    {competitions.map((c) => (
                      <th key={c.id} scope="col">
                        {c.name.replace(' Competition', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {judges.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.name}
                        {!p.isActive && <span className="tag">Deactivated</span>}
                      </td>
                      {competitions.map((c) => {
                        const n = p.scored[String(c.id)] ?? 0;
                        if (!p.assigned.includes(c.id)) return <td key={c.id} className="muted">Not assigned</td>;
                        return (
                          <td key={c.id}>
                            <span className="meter meter--cell" aria-hidden="true">
                              <span style={{ width: `${(n / Math.max(stalls.length, 1)) * 100}%` }} />
                            </span>
                            {n} of {stalls.length}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'stalls' && (
        <section className="stack">
          <div className="card stack">
            <h3>Team PINs</h3>
            <p className="muted">
              Each stall team signs in with its stall number and a team PIN to fill in its own details and video links. {withPins} of{' '}
              {stalls.length} stalls have a PIN.
            </p>
            <div className="row-actions">
              <button type="button" className="btn btn--go btn--small" disabled={busy || withPins === stalls.length} onClick={() => void createPins(false)}>
                Create PINs for stalls without one
              </button>
              <button
                type="button"
                className="btn btn--line btn--small"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Replace every team PIN? Teams will need their new PIN to sign in.')) void createPins(true);
                }}
              >
                Replace all PINs
              </button>
            </div>
            {newPins && (
              <div className="note note--warn">
                <p>
                  <strong>{newPins.length} new PINs.</strong> They are shown only now. Download them and hand each team its own PIN.
                </p>
                {newPins.length > 0 && (
                  <div className="note-actions">
                    <button type="button" className="btn btn--dark btn--small" onClick={downloadPins}>
                      Download PINs (CSV)
                    </button>
                    <button type="button" className="btn btn--line btn--small" onClick={() => setNewPins(null)}>
                      I have saved them
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="results-bar">
            <p className="muted">
              Stalls 1 to 40 match the tent layout. Teams can edit everything except the canopy colour themselves. More groups than
              tents? Add a stall; it gets the next number and shows as “not on the layout yet” on the map.
            </p>
            <div className="row-actions">
              <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('POST', 'stalls', {})}>
                Add a stall
              </button>
            </div>
          </div>
          <ul className="rows">
            {stalls.map((s) =>
              editStall === s.number ? (
                <li key={s.number} className="row row--edit">
                  <form className="stack" onSubmit={(e) => void saveStall(e, s.number)}>
                    <h3>Stall {s.number}</h3>
                    <div className="field-row">
                      <label className="field">
                        <span>Stall name</span>
                        <input name="name" defaultValue={s.name} required maxLength={80} />
                      </label>
                      <label className="field">
                        <span>Group</span>
                        <input name="groupName" defaultValue={s.groupName ?? ''} maxLength={80} />
                      </label>
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span>Cluster</span>
                        <select name="cluster" defaultValue={s.cluster ?? ''}>
                          <option value="">Not set</option>
                          {CLUSTERS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Canopy colour</span>
                        <select name="colour" defaultValue={s.colour ?? ''}>
                          <option value="">Not set</option>
                          {STALL_COLOURS.map((c) => (
                            <option key={c} value={c}>
                              {CANOPY[c].label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Instagram handle</span>
                        <input name="instagram" defaultValue={s.instagram ?? ''} maxLength={60} />
                      </label>
                    </div>
                    <label className="field">
                      <span>What they sell</span>
                      <input name="description" defaultValue={s.description ?? ''} maxLength={300} />
                    </label>
                    <div className="field-row">
                      <label className="field">
                        <span>Pitch video link</span>
                        <input name="pitchUrl" type="url" defaultValue={s.pitchUrl ?? ''} />
                      </label>
                      {[0, 1, 2].map((k) => (
                        <label key={k} className="field">
                          <span>Promo video {k + 1}</span>
                          <input name={`promo${k + 1}`} type="url" defaultValue={s.promoUrls[k] ?? ''} />
                        </label>
                      ))}
                    </div>
                    <label className="field">
                      <span>New team PIN (leave empty to keep the current one)</span>
                      <input name="teamPin" minLength={4} maxLength={72} autoComplete="off" />
                    </label>
                    <div className="row-actions">
                      <button type="submit" className="btn btn--go btn--small" disabled={busy}>
                        Save stall
                      </button>
                      <button type="button" className="btn btn--line btn--small" onClick={() => setEditStall(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={s.number} className="row">
                  <span className="stall-plate" style={{ background: CANOPY[s.colour ?? 'none'].fill, color: CANOPY[s.colour ?? 'none'].ink }}>
                    {s.number}
                  </span>
                  <div className="row-main">
                    <strong>{s.name}</strong>
                    <span className="muted">
                      {clusterName(s.cluster)}
                      {s.groupName ? `, ${s.groupName}` : ''}
                    </span>
                  </div>
                  <span className="row-flags">
                    {!s.hasPin && <span className="tag tag--wait">No PIN</span>}
                    {(s.pitchUrl || s.promoUrls.length > 0) && <span className="tag">Videos</span>}
                  </span>
                  <button type="button" className="btn btn--line btn--small" onClick={() => setEditStall(s.number)}>
                    Edit<span className="sr-only"> stall {s.number}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {tab === 'people' && (
        <section className="stack">
          <div className="card stack import-box">
            <h3>Import judges from a spreadsheet</h3>
            <p className="muted">
              Paste rows copied from Excel or a CSV, one judge per line: <strong>name, email, PIN, awards</strong>. Awards can be “all” or
              names separated by semicolons (for example <em>Best Stall; Innovation</em>). A name that matches one of the{' '}
              {pendingJudges} preloaded judges fills in that account and switches it on.
            </p>
            <label className="field">
              <span className="sr-only">Judges to import</span>
              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value.replace(/\t/g, ','))}
                placeholder={'name,email,pin,awards\nDr Rahayu binti A.Hamid,rahayu@uthm.edu.my,482913,Best Stall; Innovation'}
              />
            </label>
            <div className="row-actions">
              <button type="button" className="btn btn--go btn--small" disabled={busy || !importText.trim()} onClick={() => void runImport()}>
                Import judges
              </button>
            </div>
            {importResult && (
              <div className={`note note--${importResult.errors.length ? 'warn' : 'ok'}`} role="status">
                <p>
                  {importResult.created} created, {importResult.updated} updated.
                  {importResult.errors.length ? ` ${importResult.errors.length} rows need fixing:` : ''}
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="import-errors">
                    {importResult.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <form className="card stack" onSubmit={addPerson}>
            <h3>Add one judge or admin</h3>
            <div className="field-row">
              <label className="field">
                <span>Name</span>
                <input name="name" required maxLength={80} />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" required maxLength={200} />
              </label>
              <label className="field">
                <span>PIN (at least 4 characters)</span>
                <input name="pin" required minLength={4} maxLength={72} autoComplete="off" />
              </label>
              <label className="field">
                <span>Role</span>
                <select name="role" defaultValue="judge">
                  <option value="judge">Judge</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <fieldset className="checks">
              <legend>Competitions to judge</legend>
              {competitions.map((c) => (
                <label key={c.id} className="check">
                  <input type="checkbox" name="assigned" value={c.id} />
                  <span>{c.name}</span>
                </label>
              ))}
            </fieldset>
            <div>
              <button type="submit" className="btn btn--go btn--small" disabled={busy}>
                Add person
              </button>
            </div>
          </form>

          <ul className="rows">
            {people.map((p) =>
              editPerson === p.id ? (
                <li key={p.id} className="row row--edit">
                  <form className="stack" onSubmit={(e) => void savePerson(e, p.id)}>
                    <div className="field-row">
                      <label className="field">
                        <span>Name</span>
                        <input name="name" defaultValue={p.name} required maxLength={80} />
                      </label>
                      <label className="field">
                        <span>Email</span>
                        <input name="email" type="email" defaultValue={isPending(p.email) ? '' : p.email} required maxLength={200} />
                      </label>
                      <label className="field">
                        <span>{isPending(p.email) ? 'PIN' : 'New PIN (optional)'}</span>
                        <input name="pin" minLength={4} maxLength={72} required={isPending(p.email)} autoComplete="off" />
                      </label>
                    </div>
                    <label className="check">
                      <input type="checkbox" name="active" defaultChecked={p.isActive || isPending(p.email)} />
                      <span>Account can sign in</span>
                    </label>
                    <div className="row-actions">
                      <button type="submit" className="btn btn--go btn--small" disabled={busy}>
                        Save
                      </button>
                      <button type="button" className="btn btn--line btn--small" onClick={() => setEditPerson(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
              <li key={p.id} className="row row--wrap">
                <div className="row-main">
                  <strong>
                    {p.name}
                    <span className="tag">{p.role === 'admin' ? 'Admin' : 'Judge'}</span>
                    {isPending(p.email) ? (
                      <span className="tag tag--pending">Needs email</span>
                    ) : (
                      !p.isActive && <span className="tag tag--off">Deactivated</span>
                    )}
                  </strong>
                  <span className="muted">{isPending(p.email) ? 'No email yet' : p.email}</span>
                </div>
                <fieldset className="checks checks--inline">
                  <legend className="sr-only">Competitions {p.name} judges</legend>
                  {competitions.map((c) => (
                    <label key={c.id} className="check">
                      <input type="checkbox" checked={p.assigned.includes(c.id)} disabled={busy} onChange={() => toggleAssignment(p, c.id)} />
                      <span>{c.name.replace(' Competition', '')}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="row-actions">
                  {pinFor === p.id ? (
                    <form className="inline-form" onSubmit={(e) => void savePin(e, p.id)}>
                      <label className="sr-only" htmlFor={`pin-${p.id}`}>
                        New PIN for {p.name}
                      </label>
                      <input id={`pin-${p.id}`} name="pin" placeholder="New PIN" required minLength={4} maxLength={72} autoComplete="off" />
                      <button type="submit" className="btn btn--go btn--small" disabled={busy}>
                        Save PIN
                      </button>
                      <button type="button" className="btn btn--line btn--small" onClick={() => setPinFor(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <button type="button" className="btn btn--line btn--small" onClick={() => setEditPerson(p.id)}>
                        {isPending(p.email) ? 'Add email and PIN' : 'Edit'}
                      </button>
                      {!isPending(p.email) && (
                        <>
                          <button type="button" className="btn btn--line btn--small" onClick={() => setPinFor(p.id)}>
                            Set new PIN
                          </button>
                          <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', 'people', { id: p.id, isActive: !p.isActive })}>
                            {p.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </li>
              ),
            )}
          </ul>
        </section>
      )}

      {tab === 'memories' && (
        <section className="stack">
          <form className="card stack" onSubmit={addMemory}>
            <h3>Add a memory to the wall</h3>
            <div className="field-row">
              <label className="field">
                <span>Link to a photo, video file or YouTube video</span>
                <input name="link" placeholder="https://  or  /memories/file.jpg" autoComplete="off" />
              </label>
              <label className="field">
                <span>Caption</span>
                <input name="caption" required maxLength={140} />
              </label>
              <label className="field">
                <span>Credit</span>
                <input name="author" maxLength={60} />
              </label>
              <label className="field">
                <span>Year</span>
                <input name="year" type="number" min={2015} max={2100} defaultValue={2025} />
              </label>
            </div>
            <div>
              <button type="submit" className="btn btn--go btn--small" disabled={busy}>
                Add to wall
              </button>
            </div>
            <p className="muted">Files placed in the project’s public/memories folder can be linked as /memories/filename.</p>
          </form>

          {memories.length === 0 && (
            <div className="panel-empty">
              <h2>No memories yet</h2>
              <p className="muted">Add the first one above, or wait for visitors to pin theirs.</p>
            </div>
          )}
          <ul className="rows">
            {[...pending, ...memories.filter((m) => m.status !== 'pending')].map((m) => (
              <li key={m.id} className="row row--wrap">
                <div className="row-main">
                  <strong>
                    {m.caption}
                    <span className={`tag${m.status === 'pending' ? ' tag--wait' : m.status === 'hidden' ? ' tag--off' : ''}`}>
                      {m.status === 'pending' ? 'Waiting for approval' : m.status === 'hidden' ? 'Hidden' : 'On the wall'}
                    </span>
                  </strong>
                  <span className="muted">
                    {m.kind === 'note' ? 'Note' : m.kind === 'youtube' ? `YouTube ${m.url}` : m.url}
                    {m.author ? `, from ${m.author}` : ''}
                  </span>
                </div>
                <div className="row-actions">
                  {m.status !== 'approved' && (
                    <button type="button" className="btn btn--go btn--small" disabled={busy} onClick={() => void call('PATCH', 'memories', { id: m.id, status: 'approved' })}>
                      Approve
                    </button>
                  )}
                  {m.status !== 'hidden' && (
                    <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', 'memories', { id: m.id, status: 'hidden' })}>
                      Hide
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
