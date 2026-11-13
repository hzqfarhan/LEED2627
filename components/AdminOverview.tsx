'use client';

import type { Competition, LeaderboardRow, Stall, VoteTally } from '@/lib/shared';
import LowPoly3D from './LowPoly3D';

export interface SetupStep {
  done: boolean;
  label: string;
  hint: string;
  tab: string | null;
}

interface Props {
  competitions: Competition[];
  boards: Record<string, LeaderboardRow[]>;
  stalls: Stall[];
  votes: VoteTally[];
  votingOpen: boolean;
  resultsPublished: boolean;
  counts: { customers: number; sellers: number; signedIn: number };
  judgeCount: number;
  setup: SetupStep[];
  withVideos: number;
  pendingMemories: number;
  isAccepting: (c: Competition) => boolean;
  busy: boolean;
  onToggleVoting: () => void;
  onToggleResults: () => void;
  /** Open another admin section; for results, which award to show. */
  goTo: (tab: string, award?: { compId?: number; view?: string }) => void;
}

/** The admin's first screen: what is happening now, what still needs doing, and the switches. */
export default function AdminOverview(p: Props) {
  const total = p.stalls.length || 1;
  const voteCount = p.votes.reduce((n, v) => n + v.likes + v.dislikes, 0);
  const topVotes = [...p.votes].sort((a, b) => b.likes - a.likes).slice(0, 5);
  const maxLikes = Math.max(1, ...topVotes.map((v) => v.likes));
  const done = p.setup.filter((s) => s.done).length;
  const openComps = p.competitions.filter((c) => p.isAccepting(c)).length;
  const scoredAll = p.competitions.reduce((n, c) => n + (p.boards[String(c.id)] ?? []).length, 0);
  const judgingPct = p.competitions.length ? Math.round((scoredAll / (total * p.competitions.length)) * 100) : 0;
  const others = Math.max(0, p.counts.signedIn - p.counts.sellers - p.judgeCount);

  return (
    <section className="ov">
      <div className="ov-pulse">
        <div className="ov-pulse-main">
          <p className="ov-kicker">Judging is {judgingPct}% done</p>
          <div className="ov-meter" aria-hidden="true">
            <span style={{ width: `${judgingPct}%` }} />
          </div>
          <p className="ov-pulse-text">
            {scoredAll} score sheets across {p.competitions.length} awards. {openComps} of {p.competitions.length} awards are taking scores.
          </p>
        </div>
        <ul className="ov-switches">
          <li>
            <span>
              <strong>Visitor voting</strong>
              <small>{p.votingOpen ? `${voteCount} votes so far` : 'Visitors can’t like or rate yet'}</small>
            </span>
            <button type="button" role="switch" aria-checked={p.votingOpen} className="ov-switch" disabled={p.busy} onClick={p.onToggleVoting}>
              <span className="sr-only">Visitor voting</span>
            </button>
          </li>
          <li>
            <span>
              <strong>Public results</strong>
              <small>{p.resultsPublished ? 'Top 3 of every award are showing' : 'Hidden until the ceremony'}</small>
            </span>
            <button type="button" role="switch" aria-checked={p.resultsPublished} className="ov-switch" disabled={p.busy} onClick={p.onToggleResults}>
              <span className="sr-only">Public results</span>
            </button>
          </li>
        </ul>
        <LowPoly3D kind="console" label="A low-poly control desk" className="ov-model desk-only" />
      </div>

      <div className="ov-grid">
        <article className="ov-card ov-card--wide">
          <header className="ov-card-head">
            <h3>Judging by award</h3>
            <button type="button" className="ov-link" onClick={() => p.goTo('progress')}>
              Judge progress
            </button>
          </header>
          <ul className="ov-awards">
            {p.competitions.map((c) => {
              const rows = p.boards[String(c.id)] ?? [];
              const pct = Math.round((rows.length / total) * 100);
              const lead = rows.find((r) => r.rank === 1) ?? rows[0];
              const open = p.isAccepting(c);
              return (
                <li key={c.id}>
                  <button type="button" className="ov-award" onClick={() => p.goTo('results', { compId: c.id, view: 'sheet' })}>
                    <span className="ov-award-name">
                      {c.name.replace(' Competition', '')}
                      <em className={open ? 'is-open' : undefined}>{open ? 'Open' : 'Closed'}</em>
                    </span>
                    <span className="ov-bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="ov-award-meta">
                      <b>{rows.length}</b> of {p.stalls.length} stalls scored
                      {lead ? <> · leading: <b>{lead.stallName || `Stall ${lead.stallNumber}`}</b> ({lead.average.toFixed(1)})</> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="ov-card">
          <header className="ov-card-head">
            <h3>People Choice</h3>
            <button type="button" className="ov-link" onClick={() => p.goTo('results', { view: 'people-choice' })}>
              Full ranking
            </button>
          </header>
          {topVotes.length === 0 || voteCount === 0 ? (
            <p className="muted">No votes yet. They appear here as visitors like stalls.</p>
          ) : (
            <ol className="ov-votes">
              {topVotes.map((v) => (
                <li key={v.stallNumber}>
                  <span className="ov-votes-name">
                    <i>{v.stallNumber}</i>
                    {v.stallName || `Stall ${v.stallNumber}`}
                  </span>
                  <span className="ov-votes-bar" aria-hidden="true">
                    <span style={{ width: `${(v.likes / maxLikes) * 100}%` }} />
                  </span>
                  <b>{v.likes}</b>
                </li>
              ))}
            </ol>
          )}
        </article>

        <article className="ov-card">
          <header className="ov-card-head">
            <h3>Who has signed in</h3>
            <button type="button" className="ov-link" onClick={() => p.goTo('users')}>
              Users
            </button>
          </header>
          <div className="ov-people">
            <Donut
              parts={[
                { value: p.counts.sellers, colour: 'var(--pink)' },
                { value: p.judgeCount, colour: 'var(--violet)' },
                { value: others, colour: 'var(--line)' },
              ]}
              total={p.counts.signedIn}
            />
            <ul className="ov-legend">
              <li><i style={{ background: 'var(--pink)' }} />{p.counts.sellers} on stall teams</li>
              <li><i style={{ background: 'var(--violet)' }} />{p.judgeCount} judges</li>
              <li><i style={{ background: 'var(--line)' }} />{others} visitors</li>
            </ul>
          </div>
        </article>

        <article className="ov-card">
          <header className="ov-card-head">
            <h3>Before the event</h3>
            <span className="ov-count">{done} of {p.setup.length}</span>
          </header>
          <div className="ov-meter ov-meter--thin" aria-hidden="true">
            <span style={{ width: `${(done / Math.max(1, p.setup.length)) * 100}%` }} />
          </div>
          <ul className="checklist">
            {p.setup.map((s) => (
              <li key={s.label} className={s.done ? 'is-done' : undefined}>
                <span className="checkmark" aria-hidden="true" />
                <span className="checklist-text">
                  <strong>{s.label}</strong>
                  {!s.done && <span className="muted">{s.hint}</span>}
                </span>
                {!s.done && s.tab && (
                  <button type="button" className="btn btn--line btn--small" onClick={() => p.goTo(s.tab as string)}>
                    Fix this
                  </button>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="ov-card">
          <header className="ov-card-head">
            <h3>Needs a look</h3>
          </header>
          <ul className="ov-todo">
            <li>
              <button type="button" onClick={() => p.goTo('memories')} disabled={p.pendingMemories === 0}>
                <b>{p.pendingMemories}</b>
                <span>{p.pendingMemories === 1 ? 'memory is' : 'memories are'} waiting for approval</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => p.goTo('stalls')}>
                <b>{p.stalls.length - p.withVideos}</b>
                <span>stalls have no video link yet</span>
              </button>
            </li>
          </ul>
          <a className="btn btn--dark btn--small ov-export" href="/api/admin/export?type=xlsx" download>
            Download all marks (Excel)
          </a>
        </article>
      </div>
    </section>
  );
}

function Donut({ parts, total }: { parts: { value: number; colour: string }[]; total: number }) {
  const sum = Math.max(1, parts.reduce((n, x) => n + x.value, 0));
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg className="ov-donut" viewBox="0 0 120 120" role="img" aria-label={`${total} accounts signed in`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--concrete)" strokeWidth="16" />
      {parts.map((x, i) => {
        const len = (x.value / sum) * c;
        const el = (
          <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={x.colour} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
        );
        offset += len;
        return el;
      })}
      <text x="60" y="60" textAnchor="middle" className="ov-donut-n">{total}</text>
      <text x="60" y="78" textAnchor="middle" className="ov-donut-l">signed in</text>
    </svg>
  );
}
