'use client';

// Admin console: every stall's standing in every competition and award, and a full report per stall.

import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import StallLogo from './StallLogo';
import CustomerFeedbackCard from './CustomerFeedbackCard';
import { CUSTOMER_CHOICE, VIRAL_VIDEO } from '@/lib/awards';
import { categoryName } from '@/lib/event';
import {
  CANOPY,
  criterionMarks,
  fmtScore,
  isUnnamed,
  marksFor,
  maxTotal,
  totalOf,
  type Competition,
  type CustomerFeedback,
  type LeaderboardRow,
  type Stall,
  type StallAwardBoard,
  type StallMember,
  type ViralRow,
  type VoteTally,
} from '@/lib/shared';

interface Sheet {
  stallNumber: number;
  stallName: string;
  judge: string;
  email: string;
  comment: string | null;
  updatedAt: string;
  scores: Record<string, number>;
}

interface Report {
  sheets: Record<string, Sheet[]>;
  waiting: Record<string, string[]>;
  feedback: CustomerFeedback;
}

interface Props {
  competitions: Competition[];
  boards: Record<string, LeaderboardRow[]>;
  stallBoards: StallAwardBoard[];
  votes: VoteTally[];
  viral: ViralRow[];
  stalls: Stall[];
  teams: Record<number, StallMember[]>;
}

/** A column of the overview: one competition or award. */
interface Column {
  key: string;
  short: string;
  name: string;
  /** stall number -> [score text, rank] */
  cells: Map<number, { score: string; rank: number; sub?: string }>;
  out: number;
}

const short = (name: string) =>
  name
    .replace('Stall Competition', 'Stall (jury only)')
    .replace(' Competition', '')
    .replace('Most Popular & Viral Video Marketing', 'Viral video')
    .replace('Best Business Pitch with Innovation Element', 'Business pitch')
    .replace('Impressive Video Marketing', 'Video marketing')
    .replace('People Choice Award', 'People Choice');

function Rank({ rank }: { rank: number }) {
  if (!rank) return <span className="rank rank--none">-</span>;
  return <span className={`rank${rank <= 3 ? ` rank--${rank}` : ''}`}>{rank}</span>;
}

export function ReportsTab({ competitions, boards, stallBoards, votes, viral, stalls, teams }: Props) {
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string>('number');
  const [search, setSearch] = useState('');

  const columns: Column[] = useMemo(() => {
    const cols: Column[] = [];
    for (const c of competitions) {
      const rows = boards[String(c.id)] ?? [];
      cols.push({
        key: `c${c.id}`,
        short: short(c.name),
        name: c.name,
        out: maxTotal(c),
        cells: new Map(rows.map((r) => [r.stallNumber, { score: fmtScore(r.average), rank: r.rank, sub: `${r.judges} ${r.judges === 1 ? 'jury' : 'juries'}` }])),
      });
    }
    for (const b of stallBoards) {
      cols.push({
        key: `a${b.slug}`,
        short: short(b.name),
        name: b.name,
        out: b.juryMarks + b.customerMarks,
        cells: new Map(b.rows.map((r) => [r.stallNumber, { score: fmtScore(r.total), rank: r.rank, sub: `${fmtScore(r.jury)} + ${fmtScore(r.customer)}` }])),
      });
    }
    cols.push({
      key: 'people',
      short: 'People Choice',
      name: CUSTOMER_CHOICE.name,
      out: 0,
      cells: new Map(votes.map((v) => [v.stallNumber, { score: String(v.likes), rank: v.rank, sub: `${v.dislikes} not for me` }])),
    });
    cols.push({
      key: 'viral',
      short: 'Viral video',
      name: VIRAL_VIDEO.name,
      out: 0,
      cells: new Map(viral.filter((v) => v.total > 0).map((v) => [v.stallNumber, { score: String(v.total), rank: v.rank, sub: `${v.likes} likes, ${v.shares} shares` }])),
    });
    return cols;
  }, [competitions, boards, stallBoards, votes, viral]);

  const q = search.trim().toLowerCase();
  const rows = stalls
    .filter((s) => !q || String(s.number) === q || s.name.toLowerCase().includes(q) || (s.groupName ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (sortKey === 'number') return a.number - b.number;
      const col = columns.find((c) => c.key === sortKey);
      const ra = col?.cells.get(a.number)?.rank || 9999;
      const rb = col?.cells.get(b.number)?.rank || 9999;
      return ra - rb || a.number - b.number;
    });

  const winners = columns.map((c) => {
    const top = [...c.cells.entries()].filter(([, v]) => v.rank === 1).map(([n]) => stalls.find((s) => s.number === n));
    return { col: c, top: top.filter((s): s is Stall => Boolean(s)) };
  });

  return (
    <section className="stack">
      <div>
        <h2 className="h3">Leading now</h2>
        <p className="muted small">First place in every competition and award, as the marks stand right now.</p>
      </div>
      <ul className="lead-grid">
        {winners.map(({ col, top }) => (
          <li key={col.key}>
            <button type="button" className="lead-card" onClick={() => top[0] && setOpenNo(top[0].number)} disabled={!top[0]}>
              <small>{col.name}</small>
              {top[0] ? (
                <>
                  <span className="lead-stall">
                    <span className="stall-plate stall-plate--small" style={{ background: CANOPY[top[0].colour ?? 'none'].fill, color: CANOPY[top[0].colour ?? 'none'].ink }}>
                      {top[0].number}
                    </span>
                    <strong>{top[0].name}</strong>
                  </span>
                  <span className="lead-score">
                    {col.cells.get(top[0].number)?.score}
                    {col.out ? <small> / {fmtScore(col.out)}</small> : <small>{col.key === 'people' ? ' likes' : ' likes + shares'}</small>}
                    {top.length > 1 && <em> tied with {top.length - 1} more</em>}
                  </span>
                </>
              ) : (
                <span className="muted">No marks yet</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="dir-tools">
        <input type="search" className="dir-search" placeholder="Find a stall by number, name or group" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a stall" />
        <label className="sort-by">
          <span>Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="number">Stall number</option>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                Rank in {c.short}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col" className="matrix-stall">
                Stall
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.name}>
                  <button type="button" className={sortKey === c.key ? 'is-sorted' : ''} onClick={() => setSortKey(c.key)}>
                    {c.short}
                    {c.out ? <small>out of {fmtScore(c.out)}</small> : <small>{c.key === 'people' ? 'likes' : 'likes + shares'}</small>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const tone = CANOPY[s.colour ?? 'none'];
              return (
                <tr key={s.number} onClick={() => setOpenNo(s.number)}>
                  <th scope="row" className="matrix-stall">
                    <button type="button" onClick={() => setOpenNo(s.number)}>
                      <span className="stall-plate stall-plate--small" style={{ background: tone.fill, color: tone.ink }}>
                        {s.number}
                      </span>
                      <span>
                        <strong>{isUnnamed(s) ? 'Not named yet' : s.name}</strong>
                        <small>{(teams[s.number]?.length ?? 0) > 0 ? `${teams[s.number].length} in team` : 'No team'}</small>
                      </span>
                    </button>
                  </th>
                  {columns.map((c) => {
                    const cell = c.cells.get(s.number);
                    return (
                      <td key={c.key} className={cell?.rank && cell.rank <= 3 ? `is-top is-top--${cell.rank}` : undefined}>
                        {cell ? (
                          <span className="matrix-cell">
                            <Rank rank={cell.rank} />
                            <span>
                              <strong>{cell.score}</strong>
                              {cell.sub && <small>{cell.sub}</small>}
                            </span>
                          </span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Stall awards show jury marks + customer marks. Tap a stall for every jury’s sheet, the customers’ stars and its place in each award.</p>

      <StallReport
        number={openNo}
        onClose={() => setOpenNo(null)}
        stall={stalls.find((s) => s.number === openNo) ?? null}
        team={openNo != null ? (teams[openNo] ?? []) : []}
        competitions={competitions}
        columns={columns}
      />
    </section>
  );
}

function StallReport({
  number,
  stall,
  team,
  competitions,
  columns,
  onClose,
}: {
  number: number | null;
  stall: Stall | null;
  team: StallMember[];
  competitions: Competition[];
  columns: Column[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [compId, setCompId] = useState<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (number != null && !d.open) d.showModal();
    if (number == null && d.open) d.close();
  }, [number]);

  useEffect(() => {
    if (number == null) return;
    setReport(null);
    setState('loading');
    setCompId(competitions[0]?.id ?? null);
    fetch(`/api/admin/stall-report?number=${number}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Report) => {
        setReport(data);
        setState('idle');
      })
      .catch(() => setState('error'));
  }, [number, competitions]);

  const tone = CANOPY[stall?.colour ?? 'none'];
  const comp = competitions.find((c) => c.id === compId) ?? null;
  const sheets = comp && report ? (report.sheets[String(comp.id)] ?? []) : [];
  const waiting = comp && report ? (report.waiting[String(comp.id)] ?? []) : [];

  return (
    <dialog ref={ref} className="viewer report" onClose={onClose} aria-labelledby="report-title">
      {stall && (
        <div className="report-card">
          <header className="report-head" style={{ background: tone.fill, color: tone.ink }}>
            <span className="dir-dialog-no">{stall.number}</span>
            <StallLogo number={stall.number} version={stall.logoVersion} name={stall.name} size={56} className="stall-logo--hero" />
            <div>
              <h2 id="report-title">{isUnnamed(stall) ? `Stall ${stall.number}` : stall.name}</h2>
              <p>{[stall.groupName, categoryName(stall.category), stall.ssmNumber && `SSM ${stall.ssmNumber}`].filter(Boolean).join(', ') || 'No details yet'}</p>
            </div>
            <span className="report-faces" aria-label={`${team.length} in team`}>
              {team.slice(0, 5).map((m) => (
                <Avatar key={m.email} name={m.name ?? m.email} photos={m.photos} size={34} />
              ))}
            </span>
            <button type="button" className="report-x" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div className="report-body">
            <section>
              <h3 className="report-h">Place in every competition and award</h3>
              <ul className="report-places">
                {columns.map((c) => {
                  const cell = c.cells.get(stall.number);
                  return (
                    <li key={c.key} className={cell?.rank && cell.rank <= 3 ? `is-top--${cell.rank}` : undefined}>
                      <Rank rank={cell?.rank ?? 0} />
                      <span>
                        <small>{c.short}</small>
                        <strong>
                          {cell ? cell.score : '-'}
                          {c.out ? <em> / {fmtScore(c.out)}</em> : null}
                        </strong>
                        {cell?.sub && <small>{c.key.startsWith('a') ? `jury ${cell.sub.replace(' + ', ' + customers ')}` : cell.sub}</small>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h3 className="report-h">Jury score sheets</h3>
              <div className="seg" role="group" aria-label="Competition">
                {competitions.map((c) => (
                  <button key={c.id} type="button" className="seg-btn" aria-pressed={compId === c.id} onClick={() => setCompId(c.id)}>
                    {short(c.name)}
                    <span className="seg-count">{report?.sheets[String(c.id)]?.length ?? '…'}</span>
                  </button>
                ))}
              </div>
              {state === 'loading' && <p className="muted">Loading the score sheets…</p>}
              {state === 'error' && <p className="note note--bad">The report could not be loaded. Check your connection and try again.</p>}
              {comp && report && (
                <>
                  {sheets.length === 0 ? (
                    <p className="muted">No jury has scored this stall for the {comp.name} yet.</p>
                  ) : (
                    <div className="matrix-wrap">
                      <table className="sheet-table">
                        <thead>
                          <tr>
                            <th scope="col">Jury</th>
                            {comp.criteria.map((k) => (
                              <th key={k.id} scope="col">
                                {k.name}
                                <small>/ {fmtScore(criterionMarks(comp, k.weight))}</small>
                              </th>
                            ))}
                            <th scope="col">
                              Total<small>/ {fmtScore(maxTotal(comp))}</small>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sheets.map((sh) => (
                            <tr key={sh.email}>
                              <th scope="row">
                                <strong>{sh.judge}</strong>
                                {sh.comment && <q className="sheet-comment">{sh.comment}</q>}
                              </th>
                              {comp.criteria.map((k) => {
                                const lv = sh.scores[String(k.id)];
                                return (
                                  <td key={k.id}>
                                    {lv == null ? (
                                      <span className="muted">-</span>
                                    ) : (
                                      <>
                                        <strong>{fmtScore(marksFor(comp, k.weight, lv))}</strong>
                                        <small>level {lv}</small>
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="sheet-total">{fmtScore(totalOf(comp, sh.scores))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th scope="row">Average of {sheets.length}</th>
                            {comp.criteria.map((k) => {
                              const vals = sheets.map((sh) => sh.scores[String(k.id)]).filter((v): v is number => v != null);
                              const avg = vals.length ? vals.reduce((a, b) => a + marksFor(comp, k.weight, b), 0) / vals.length : 0;
                              return <td key={k.id}>{vals.length ? fmtScore(avg) : '-'}</td>;
                            })}
                            <td className="sheet-total">{fmtScore(sheets.reduce((a, sh) => a + totalOf(comp, sh.scores), 0) / sheets.length)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                  {waiting.length > 0 && (
                    <p className="report-waiting">
                      <strong>Still to score:</strong> {waiting.join(', ')}
                    </p>
                  )}
                </>
              )}
            </section>

            {report && <CustomerFeedbackCard feedback={report.feedback} title="Customers" note="People Choice votes and the star ratings that make up half of each stall award." />}
          </div>
        </div>
      )}
    </dialog>
  );
}
