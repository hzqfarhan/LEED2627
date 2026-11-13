'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';
import SignOutButton from './SignOutButton';
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
  type Announcement,
  type StallAwardBoard,
  type StallMember,
  type ViralRow,
  type VoteTally,
  type UserRow,
} from '@/lib/shared';
import { CUSTOMER_CHOICE, PENDING_EMAIL_DOMAIN, VIRAL_VIDEO } from '@/lib/awards';
import { AllocationEditor, AutoAllocate, NewsTab, TeamsTab } from './AdminExtras';
import { GroupsTab, LogTab, UsersTab } from './AdminDirectory';
import { ReportsTab } from './AdminReports';
import AdminOverview from './AdminOverview';
import AdminPayments from './AdminPayments';

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
  stallBoards: StallAwardBoard[];
  /** Every stall's social media counts, for the viral video form. */
  viral: ViralRow[];
  /** stall number -> team members */
  teams: Record<number, StallMember[]>;
  /** judge id -> competition id -> stall numbers */
  allocations: Record<string, Record<string, number[]>>;
  announcements: Announcement[];
  ssoReady: boolean;
  counts: { customers: number; sellers: number; signedIn: number };
  users: UserRow[];
  /** The signed-in admin's account id. */
  me: number;
  /** The signed-in admin, for the profile at the foot of the side navigation. */
  profile: { name: string; shortName: string; email: string; photos: string[] };
}

type Tab = 'overview' | 'reports' | 'results' | 'progress' | 'stalls' | 'payments' | 'groups' | 'teams' | 'users' | 'people' | 'news' | 'log' | 'memories';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports', label: 'Stall reports' },
  { id: 'results', label: 'Results' },
  { id: 'progress', label: 'Judge progress' },
  { id: 'payments', label: 'Payments' },
  { id: 'groups', label: 'Groups' },
  { id: 'users', label: 'Users' },
  { id: 'people', label: 'Jury and admins' },
  { id: 'teams', label: 'Team setup' },
  { id: 'stalls', label: 'Stalls' },
  { id: 'news', label: 'Announcements' },
  { id: 'memories', label: 'Memory wall' },
  { id: 'log', label: 'Activity log' },
];

/** The side navigation, grouped by what the committee is doing. */
const SECTIONS: { title: string; tabs: Tab[] }[] = [
  { title: 'Event', tabs: ['overview', 'reports', 'results', 'progress'] },
  { title: 'People', tabs: ['groups', 'payments', 'users', 'people', 'teams'] },
  { title: 'Content', tabs: ['stalls', 'news', 'memories'] },
  { title: 'Records', tabs: ['log'] },
];

const TAB_ICON: Record<Tab, string> = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  results: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  progress: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  groups: 'M3 9l9-6 9 6M5 9v11h14V9M9 20v-6h6v6',
  payments: 'M3 7h18v12H3zM3 11h18M7 15h4M16 3l2 4',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  people: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM9 12l2 2 4-4',
  teams: 'M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4',
  stalls: 'M3 10l2-6h14l2 6M3 10h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 14v6h14v-6',
  news: 'M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14',
  memories: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  log: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
};

export default function AdminConsole({ competitions, boards, people, stalls, memories, demoMode, resultsPublished, votes, votingOpen, stallBoards, viral, teams, allocations, announcements, ssoReady, counts, users, me, profile }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [logSearch, setLogSearch] = useState('');
  // Phones: the side navigation slides in as a drawer.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('drawer-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('drawer-open');
    };
  }, [menuOpen]);
  const [compId, setCompId] = useState<number>(competitions[0]?.id ?? 0);
  // Results tab: a stall award slug, 'sheet' (a judges' score sheet), 'viral' or 'people-choice'.
  const [view, setView] = useState<string>(stallBoards[0]?.slug ?? 'sheet');
  const showVotes = view === 'people-choice';
  const stallBoard = stallBoards.find((b) => b.slug === view) ?? null;
  const [editPerson, setEditPerson] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editStall, setEditStall] = useState<number | null>(null);
  const [allocFor, setAllocFor] = useState<number | null>(null);

  // Keep the leaderboard fresh while judging is under way.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [router]);

  const call = async (method: 'POST' | 'PATCH' | 'DELETE', resource: string, body: unknown): Promise<boolean> => {
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
    const cols = hasHeader ? head : ['name', 'email', 'awards', 'role'];
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
      setError('Paste at least one line: name, UTHM email, awards.');
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
      isActive: d.get('active') === 'on',
    });
    if (ok) setEditPerson(null);
  };

  const pendingJudges = people.filter((p) => isPending(p.email)).length;
  const judgeCount = people.filter((p) => p.role === 'judge' && p.isActive).length;
  const named = stalls.filter((s) => !isUnnamed(s)).length;
  const withTeams = stalls.filter((s) => (teams[s.number]?.length ?? 0) > 0).length;
  const withVideos = stalls.filter((s) => s.pitchUrl || s.promoUrls.length > 0).length;
  const unassigned = competitions.filter((c) => !people.some((p) => p.isActive && p.assigned.includes(c.id)));
  const setup = [
    { done: !demoMode, label: 'Connect the database', hint: 'Set DATABASE_URL and run the SQL files in the db folder.', tab: null },
    { done: ssoReady, label: 'Turn on UTHM SSO', hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the README).', tab: null },
    { done: pendingJudges === 0, label: 'Every preloaded judge has their UTHM email', hint: pendingJudges ? `${pendingJudges} still have a placeholder email. Import a CSV or edit them one by one.` : 'All set.', tab: 'people' as Tab },
    { done: judgeCount > 0 && unassigned.length === 0, label: 'Every competition has a judge', hint: unassigned.length ? `No judge yet for: ${unassigned.map((c) => c.name.replace(' Competition', '')).join(', ')}.` : `${judgeCount} active judges.`, tab: 'people' as Tab },
    { done: withTeams === stalls.length, label: 'Every stall has its group', hint: `${withTeams} of ${stalls.length} stalls have team members. Add a leader per stall; leaders add their groupmates.`, tab: 'teams' as Tab },
    { done: named === stalls.length, label: 'Every stall is named', hint: `${named} of ${stalls.length} named. Teams do this themselves once they sign in.`, tab: 'stalls' as Tab },
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
    <div className="admin admin-layout">
      <div className="admin-menubar">
        <button type="button" className="admin-menu-btn" aria-expanded={menuOpen} aria-controls="admin-side" onClick={() => setMenuOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
          <span className="sr-only">Open admin sections</span>
        </button>
        <span className="admin-menubar-text">
          <small>Admin console</small>
          <strong>{TABS.find((t) => t.id === tab)?.label}</strong>
        </span>
        {pending.length > 0 && tab !== 'memories' && <span className="tab-count" title="Memories waiting for approval">{pending.length}</span>}
      </div>
      {menuOpen && <button type="button" className="admin-scrim" aria-label="Close admin sections" onClick={() => setMenuOpen(false)} />}

      <aside id="admin-side" className={`admin-side${menuOpen ? ' is-open' : ''}`} aria-label="Admin sections">
        <div className="admin-side-top">
          <p className="admin-side-title">Admin console</p>
          <button type="button" className="admin-side-close" onClick={() => setMenuOpen(false)} aria-label="Close admin sections">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div role="tablist" aria-orientation="vertical" aria-label="Admin sections" className="admin-side-list">
          {SECTIONS.map((sec) => (
            <div key={sec.title} className="admin-side-group" role="presentation">
              <p className="admin-side-head" role="presentation">
                {sec.title}
              </p>
              {sec.tabs.map((id) => {
                const t = TABS.find((x) => x.id === id)!;
                return (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} className="admin-side-item" onClick={() => { setTab(id); setError(null); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={TAB_ICON[id]} />
                    </svg>
                    <span>{t.label}</span>
                    {id === 'memories' && pending.length > 0 && <span className="tab-count">{pending.length}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="admin-side-foot">
          <Link href="/me" className="admin-side-me" title={`${profile.name}, ${profile.email}`}>
            <Avatar name={profile.name} photos={profile.photos} size={40} />
            <span>
              <strong>{profile.shortName}</strong>
              <small>Committee</small>
            </span>
          </Link>
          <SignOutButton name={profile.name} email={profile.email} photos={profile.photos} />
        </div>
      </aside>

      <div className="admin-main">
      <div className="admin-main-head">
        <h2 className="admin-main-title">{TABS.find((t) => t.id === tab)?.label}</h2>
      </div>
      {demoMode && (
        <p className="note note--warn">
          <strong>Demo mode.</strong> No database is connected. Changes work while the server runs and are lost when it restarts.
          Set DATABASE_URL and run the SQL files in the db folder to keep data.
        </p>
      )}


      {error && (
        <p className="note note--bad" role="alert">
          {error}
        </p>
      )}

      {tab === 'overview' && (
        <AdminOverview
          competitions={competitions}
          boards={boards}
          stalls={stalls}
          votes={votes}
          votingOpen={votingOpen}
          resultsPublished={resultsPublished}
          counts={counts}
          judgeCount={judgeCount}
          setup={setup}
          withVideos={withVideos}
          pendingMemories={pending.length}
          isAccepting={isAccepting}
          busy={busy}
          onToggleVoting={() => void call('PATCH', 'settings', { votingOpen: !votingOpen })}
          onToggleResults={() => void call('PATCH', 'settings', { resultsPublished: !resultsPublished })}
          goTo={(t, award) => {
            if (award?.compId) setCompId(award.compId);
            if (award?.view) setView(award.view);
            setTab(t as Tab);
          }}
        />
      )}

      {tab === 'results' && comp && (
        <section className="stack">
          <div className="results-groups">
            <div>
              <p className="results-group-label">Stall awards (jury + customers)</p>
              <div className="seg seg--wrap" role="group" aria-label="Stall awards">
                {stallBoards.map((b) => (
                  <button key={b.slug} type="button" className="seg-btn" aria-pressed={view === b.slug} onClick={() => setView(b.slug)}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="results-group-label">Judges’ score sheets</p>
              <div className="seg seg--wrap" role="group" aria-label="Score sheets">
                {competitions.map((c) => (
                  <button key={c.id} type="button" className="seg-btn" aria-pressed={view === 'sheet' && c.id === comp.id} onClick={() => { setView('sheet'); setCompId(c.id); }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="results-group-label">Other awards</p>
              <div className="seg seg--wrap" role="group" aria-label="Other awards">
                <button type="button" className="seg-btn" aria-pressed={view === 'viral'} onClick={() => setView('viral')}>
                  Viral video
                </button>
                <button type="button" className="seg-btn" aria-pressed={showVotes} onClick={() => setView('people-choice')}>
                  {CUSTOMER_CHOICE.name}
                </button>
              </div>
            </div>
          </div>

          {stallBoard ? (
            <>
              <p className="muted">
                {stallBoard.element}: average jury marks (out of {fmtScore(stallBoard.juryMarks)}) plus customers’ average stars converted to
                marks (out of {fmtScore(stallBoard.customerMarks)}). Top 3 win.
              </p>
              {stallBoard.rows.length === 0 ? (
                <div className="panel-empty">
                  <h2>Nothing to rank yet</h2>
                  <p className="muted">Rankings appear once judges score stalls or visitors rate them.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Stall</th>
                        <th scope="col" className="num">Judges</th>
                        <th scope="col" className="num">Jury (/{fmtScore(stallBoard.juryMarks)})</th>
                        <th scope="col" className="num">Raters</th>
                        <th scope="col" className="num">Customers (/{fmtScore(stallBoard.customerMarks)})</th>
                        <th scope="col" className="num">Total (/{fmtScore(stallBoard.juryMarks + stallBoard.customerMarks)})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stallBoard.rows.map((r) => (
                        <tr key={r.stallNumber} className={r.rank <= 3 ? 'is-top' : undefined}>
                          <td className="rank">{r.rank}</td>
                          <td>
                            <span className="stall-plate stall-plate--small" style={{ background: CANOPY[r.colour ?? 'none'].fill, color: CANOPY[r.colour ?? 'none'].ink }}>
                              {r.stallNumber}
                            </span>{' '}
                            {r.stallName}
                          </td>
                          <td className="num">{r.judges}</td>
                          <td className="num">{r.jury.toFixed(2)}</td>
                          <td className="num">{r.raters}</td>
                          <td className="num">{r.customer.toFixed(2)}</td>
                          <td className="num strong">{r.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : view === 'viral' ? (
            <>
              <p className="muted">
                {VIRAL_VIDEO.description} Ranked by likes plus shares; one winner. Press Save on each row you change.
              </p>
              <div className="table-wrap">
                <table className="table viral-table">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Stall</th>
                      <th scope="col">Likes</th>
                      <th scope="col">Shares</th>
                      <th scope="col">Video link</th>
                      <th scope="col">
                        <span className="sr-only">Save</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...viral].sort((a, b) => a.stallNumber - b.stallNumber).map((r) => (
                      <tr key={r.stallNumber} className={r.total > 0 && r.rank === 1 ? 'is-top' : undefined}>
                        <td className="rank">{r.total > 0 ? r.rank : '–'}</td>
                        <td>
                          <span className="stall-plate stall-plate--small" style={{ background: CANOPY[r.colour ?? 'none'].fill, color: CANOPY[r.colour ?? 'none'].ink }}>
                            {r.stallNumber}
                          </span>{' '}
                          {r.stallName}
                        </td>
                        <td>
                          <input name="likes" type="number" min={0} inputMode="numeric" defaultValue={r.likes} aria-label={`Likes for stall ${r.stallNumber}`} />
                        </td>
                        <td>
                          <input name="shares" type="number" min={0} inputMode="numeric" defaultValue={r.shares} aria-label={`Shares for stall ${r.stallNumber}`} />
                        </td>
                        <td>
                          <input name="url" type="url" placeholder="https://" defaultValue={r.url ?? ''} aria-label={`Video link for stall ${r.stallNumber}`} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--line btn--small"
                            disabled={busy}
                            onClick={(e) => {
                              const row = e.currentTarget.closest('tr');
                              const val = (n: string) => (row?.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)?.value ?? '';
                              void call('PATCH', 'viral', { stall: r.stallNumber, likes: Number(val('likes') || 0), shares: Number(val('shares') || 0), url: val('url') });
                            }}
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : showVotes ? (
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
          <div className="results-bar">
            <p className="muted">
              Stalls 1 to 40 match the tent layout. Teams edit everything except the canopy colour themselves after signing in. More groups than
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
                    {(teams[s.number]?.length ?? 0) === 0 && <span className="tag tag--wait">No team</span>}
                    {s.posterVersion && <span className="tag">Poster</span>}
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
          <AutoAllocate competitions={competitions} people={people} busy={busy} call={call} />
          <div className="card stack import-box">
            <h3>Import judges from a spreadsheet</h3>
            <p className="muted">
              Paste rows copied from Excel or a CSV, one judge per line: <strong>name, UTHM email, awards</strong>. They sign in with UTHM SSO
              using that email; no PINs. Awards can be “all” or
              names separated by semicolons (for example <em>Stall Competition; Video Marketing</em>). A name that matches one of the{' '}
              {pendingJudges} preloaded judges fills in that account and switches it on.
            </p>
            <label className="field">
              <span className="sr-only">Judges to import</span>
              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value.replace(/\t/g, ','))}
                placeholder={'name,email,awards\nDr Rahayu binti A.Hamid,rahayu@uthm.edu.my,Stall Competition; Video Marketing'}
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
                <span>UTHM email</span>
                <input name="email" type="email" required maxLength={200} placeholder="name@uthm.edu.my" pattern=".+@(student\.)?uthm\.edu\.my" title="An @uthm.edu.my or @student.uthm.edu.my email" />
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
                        <span>UTHM email</span>
                        <input name="email" type="email" defaultValue={isPending(p.email) ? '' : p.email} required maxLength={200} pattern=".+@(student\.)?uthm\.edu\.my" title="An @uthm.edu.my or @student.uthm.edu.my email" />
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
                  <button type="button" className="btn btn--line btn--small" onClick={() => setEditPerson(p.id)}>
                    {isPending(p.email) ? 'Add UTHM email' : 'Edit'}
                  </button>
                  {p.role === 'judge' && p.isActive && !isPending(p.email) && (
                    <button type="button" className="btn btn--line btn--small" onClick={() => setAllocFor(allocFor === p.id ? null : p.id)} aria-expanded={allocFor === p.id}>
                      Allocated stalls
                    </button>
                  )}
                  {!isPending(p.email) && (
                    <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', 'people', { id: p.id, isActive: !p.isActive })}>
                      {p.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </div>
                {allocFor === p.id && (
                  <AllocationEditor
                    judge={p}
                    competitions={competitions.filter((c) => p.assigned.includes(c.id))}
                    stalls={stalls}
                    current={allocations[String(p.id)] ?? {}}
                    busy={busy}
                    onSave={(competitionId, list) => void call('PATCH', 'allocate', { judgeId: p.id, competitionId, stalls: list })}
                  />
                )}
              </li>
              ),
            )}
          </ul>
        </section>
      )}

      {tab === 'reports' && <ReportsTab competitions={competitions} boards={boards} stallBoards={stallBoards} votes={votes} viral={viral} stalls={stalls} teams={teams} />}

      {tab === 'groups' && <GroupsTab stalls={stalls} teams={teams} onShowLog={(q) => { setLogSearch(q); setTab('log'); }} />}

      {tab === 'payments' && <AdminPayments />}

      {tab === 'users' && <UsersTab users={users} me={me} busy={busy} call={call} />}

      {tab === 'log' && <LogTab initialSearch={logSearch} />}

      {tab === 'teams' && <TeamsTab stalls={stalls} teams={teams} busy={busy} call={call} />}

      {tab === 'news' && <NewsTab announcements={announcements} busy={busy} call={call} />}

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
    </div>
  );
}
