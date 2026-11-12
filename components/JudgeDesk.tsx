'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { clusterName } from '@/lib/event';
import { QUEUE_EVENT, enqueue, readQueue } from '@/lib/offlineQueue';
import {
  CANOPY,
  criterionMarks,
  fmtScore,
  marksFor,
  isAccepting,
  isComplete,
  materialsFor,
  maxTotal,
  totalOf,
  type Competition,
  type Stall,
  type Submission,
} from '@/lib/shared';

interface Entry {
  scores: Record<string, number>;
  comment: string;
}

interface Sheet extends Entry {
  /** Saved on this phone only; not yet received by the server. */
  pending: boolean;
}

interface Props {
  judgeId: number;
  judgeName: string;
  competitions: Competition[];
  stalls: Stall[];
  submissions: Submission[];
  initialSlug?: string | null;
  initialStall?: number | null;
}

type TileState = 'todo' | 'draft' | 'pending' | 'done';
type Status = { kind: 'saved' | 'queued' | 'error'; text: string } | null;

const keyOf = (competitionId: number, stallNumber: number) => `${competitionId}:${stallNumber}`;
const BLANK: Entry = { scores: {}, comment: '' };

export default function JudgeDesk({ judgeId, judgeName, competitions, stalls, submissions, initialSlug, initialStall }: Props) {
  const first = competitions.find((c) => c.slug === initialSlug) ?? competitions[0] ?? null;
  const [compId, setCompId] = useState<number | null>(first?.id ?? null);
  const [openStall, setOpenStall] = useState<number | null>(
    initialStall && stalls.some((s) => s.number === initialStall) ? initialStall : null,
  );
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [jump, setJump] = useState('');
  const [sheets, setSheets] = useState<Record<string, Sheet>>(() => {
    const out: Record<string, Sheet> = {};
    for (const s of submissions) out[keyOf(s.competitionId, s.stallNumber)] = { scores: s.scores, comment: s.comment ?? '', pending: false };
    return out;
  });
  // Unsaved work, kept per stall so moving between stalls never loses a half-filled sheet.
  const [drafts, setDrafts] = useState<Record<string, Entry>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const draftsKey = `leed26.drafts.${judgeId}`;

  const comp = competitions.find((c) => c.id === compId) ?? null;
  const stall = stalls.find((s) => s.number === openStall) ?? null;
  const accepting = comp ? isAccepting(comp) : false;
  const openKey = comp && stall ? keyOf(comp.id, stall.number) : null;

  // Fold in score sheets that are waiting on this phone, and keep in step with the queue.
  useEffect(() => {
    const sync = () => {
      const queue = readQueue().filter((q) => q.judgeId == null || q.judgeId === judgeId);
      setSheets((prev) => {
        const next: Record<string, Sheet> = {};
        for (const [k, v] of Object.entries(prev)) next[k] = v.pending ? { ...v, pending: false } : v;
        for (const q of queue) next[keyOf(q.competitionId, q.stallNumber)] = { scores: q.scores, comment: q.comment, pending: true };
        return next;
      });
    };
    sync();
    window.addEventListener(QUEUE_EVENT, sync);
    return () => window.removeEventListener(QUEUE_EVENT, sync);
  }, [judgeId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftsKey);
      if (raw) setDrafts(JSON.parse(raw) as Record<string, Entry>);
    } catch {
      /* ignore */
    }
  }, [draftsKey]);

  const writeDrafts = (next: Record<string, Entry>) => {
    setDrafts(next);
    try {
      window.localStorage.setItem(draftsKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!openKey) return;
    setStatus(null);
    sheetRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [openKey]);

  const progress = useMemo(() => {
    const out: Record<number, number> = {};
    for (const c of competitions) out[c.id] = stalls.filter((s) => sheets[keyOf(c.id, s.number)]).length;
    return out;
  }, [competitions, stalls, sheets]);

  if (!comp) {
    return (
      <div className="panel-empty">
        <h2>No competitions assigned yet</h2>
        <p className="muted">
          You are signed in as {judgeName}, but the committee has not assigned you a competition. Ask them to add you in the admin
          console, then reload this page.
        </p>
      </div>
    );
  }

  const stateOf = (n: number): TileState => {
    const k = keyOf(comp.id, n);
    if (drafts[k]) return 'draft';
    const sheet = sheets[k];
    return sheet ? (sheet.pending ? 'pending' : 'done') : 'todo';
  };

  const current: Entry = openKey ? (drafts[openKey] ?? sheets[openKey] ?? BLANK) : BLANK;
  const edit = (patch: Partial<Entry>) => {
    if (!openKey) return;
    writeDrafts({ ...drafts, [openKey]: { scores: current.scores, comment: current.comment, ...patch } });
    setStatus(null);
  };
  const dropDraft = (k: string) => {
    const next = { ...drafts };
    delete next[k];
    writeDrafts(next);
  };

  const nextTodo = (after: number | null): number | null => {
    const todo = stalls.filter((s) => stateOf(s.number) === 'todo' || stateOf(s.number) === 'draft').map((s) => s.number);
    const others = todo.filter((n) => n !== after);
    if (others.length === 0) return null;
    return others.find((n) => after == null || n > after) ?? others[0];
  };

  const index = stall ? stalls.findIndex((s) => s.number === stall.number) : -1;
  const step = (dir: 1 | -1) => {
    if (index < 0) return;
    setOpenStall(stalls[(index + dir + stalls.length) % stalls.length].number);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!stall || !openKey) return;
    if (!isComplete(comp, current.scores)) {
      setStatus({ kind: 'error', text: `Give every criterion a score from ${comp.scaleMin} to ${comp.scaleMax} before saving.` });
      return;
    }
    const entry: Entry = { scores: current.scores, comment: current.comment };
    const payload = { judgeId, competitionId: comp.id, stallNumber: stall.number, ...entry };
    const keepLocally = (text: string) => {
      enqueue(payload);
      setSheets((prev) => ({ ...prev, [openKey]: { ...entry, pending: true } }));
      dropDraft(openKey);
      setStatus({ kind: 'queued', text });
    };
    setBusy(true);
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSheets((prev) => ({ ...prev, [openKey]: { ...entry, pending: false } }));
        dropDraft(openKey);
        setStatus({ kind: 'saved', text: `Score saved for stall ${stall.number}.` });
      } else if (res.status === 401) {
        keepLocally('Your sign-in has expired. This score is kept on this phone. Sign in again and it will be sent.');
      } else if (res.status >= 500) {
        keepLocally('The server is not responding. This score is kept on this phone and will be sent automatically.');
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus({ kind: 'error', text: body?.error ?? 'The score could not be saved. Try again.' });
      }
    } catch {
      keepLocally('No connection. This score is kept on this phone and will be sent automatically when you are back online.');
    } finally {
      setBusy(false);
    }
  };

  const openJump = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(jump);
    if (stalls.some((s) => s.number === n)) {
      setOpenStall(n);
      setJump('');
    }
  };

  const values = Array.from({ length: comp.scaleMax - comp.scaleMin + 1 }, (_, i) => comp.scaleMin + i);
  const visible = onlyTodo ? stalls.filter((s) => stateOf(s.number) !== 'done' && stateOf(s.number) !== 'pending') : stalls;
  const done = progress[comp.id] ?? 0;
  const upNext = stall ? nextTodo(stall.number) : null;
  const materials = stall ? materialsFor(comp.slug, stall) : [];
  const stateLabel = (n: number): string => {
    const st = stateOf(n);
    const sheet = sheets[keyOf(comp.id, n)];
    if (st === 'draft') return 'Not saved yet';
    if (st === 'pending') return 'Waiting to send';
    if (st === 'done' && sheet) return `Scored ${fmtScore(totalOf(comp, sheet.scores))} of ${fmtScore(maxTotal(comp))}`;
    return 'Not scored';
  };

  return (
    <div className="desk">
      <div className="comp-tabs" role="group" aria-label="Competition">
        {competitions.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === comp.id}
            className="comp-tab"
            onClick={() => {
              setCompId(c.id);
              setStatus(null);
            }}
          >
            <span className="comp-tab-name">{c.name.replace(' Competition', '')}</span>
            <span className="comp-tab-count">
              {progress[c.id] ?? 0} of {stalls.length}
            </span>
          </button>
        ))}
      </div>

      {!accepting && (
        <p className="note note--warn" role="status">
          Judging for the {comp.name} is closed. You can read your scores but not change them.
        </p>
      )}

      {stall ? (
        <div className="sheet" ref={sheetRef} tabIndex={-1} aria-label={`Score sheet for stall ${stall.number}`}>
          <div className="sheet-nav">
            <button type="button" className="link-back" onClick={() => setOpenStall(null)}>
              All stalls
            </button>
            <div className="stepper">
              <button type="button" className="stepper-btn" aria-label="Previous stall" onClick={() => step(-1)}>
                <span className="chev chev--left" aria-hidden="true" />
              </button>
              <span>
                {index + 1} of {stalls.length}
              </span>
              <button type="button" className="stepper-btn" aria-label="Next stall" onClick={() => step(1)}>
                <span className="chev chev--right" aria-hidden="true" />
              </button>
            </div>
          </div>

          <header className="sheet-head">
            <span
              className="stall-plate stall-plate--big"
              style={{ background: CANOPY[stall.colour ?? 'none'].fill, color: CANOPY[stall.colour ?? 'none'].ink }}
            >
              {stall.number}
            </span>
            <div>
              <h2>{stall.name}</h2>
              <p className="muted">
                {clusterName(stall.cluster)}
                {stall.groupName ? `, ${stall.groupName}` : ''}
              </p>
              <p className="sheet-comp">{comp.name}</p>
            </div>
          </header>

          {comp.description && <p className="sheet-brief">{comp.description}</p>}

          {(comp.slug === 'business-pitch' || comp.slug === 'video-marketing') && (
            <div className="materials">
              {materials.length > 0 ? (
                materials.map((m) => (
                  <a key={m.url} className="btn btn--line btn--small" href={m.url} target="_blank" rel="noreferrer">
                    {m.label}
                  </a>
                ))
              ) : (
                <p className="muted">This team has not added a video link yet.</p>
              )}
              {stall.instagram && (
                <a className="btn btn--line btn--small" href={`https://instagram.com/${stall.instagram}`} target="_blank" rel="noreferrer">
                  Instagram @{stall.instagram}
                </a>
              )}
            </div>
          )}

          <form onSubmit={save}>
            {comp.criteria.map((k) => {
              const picked = current.scores[String(k.id)];
              const full = criterionMarks(comp, k.weight);
              return (
                <fieldset key={k.id} className="criterion" disabled={!accepting || busy}>
                  <legend>
                    <span className="criterion-name">
                      {k.position}. {k.name}
                      <span className="criterion-marks">{fmtScore(full)} marks</span>
                    </span>
                    {k.description && <span className="criterion-desc">{k.description}</span>}
                  </legend>
                  <div className="scale" style={{ '--n': values.length } as CSSProperties}>
                    {values.map((v) => (
                      <label key={v} className="scale-opt" title={k.levels?.[v - comp.scaleMin] ?? undefined}>
                        <input
                          type="radio"
                          name={`criterion-${k.id}`}
                          value={v}
                          checked={picked === v}
                          onChange={() => edit({ scores: { ...current.scores, [String(k.id)]: v } })}
                          aria-describedby={k.levels ? `lvl-${k.id}` : undefined}
                        />
                        <span>{v}</span>
                      </label>
                    ))}
                  </div>
                  {k.levels ? (
                    <p id={`lvl-${k.id}`} className={`level-text${picked === undefined ? ' is-empty' : ''}`} aria-live="polite">
                      {picked === undefined ? (
                        'Pick a level to see what it means.'
                      ) : (
                        <>
                          <strong>
                            Level {picked}, {fmtScore(marksFor(comp, k.weight, picked))} of {fmtScore(full)} marks.
                          </strong>{' '}
                          {k.levels[picked - comp.scaleMin]}
                        </>
                      )}
                    </p>
                  ) : (
                    <div className="scale-ends" aria-hidden="true">
                      <span>Poor</span>
                      <span>Excellent</span>
                    </div>
                  )}
                </fieldset>
              );
            })}

            <label className="field">
              <span>Comment for the committee (optional)</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={current.comment}
                disabled={!accepting || busy}
                onChange={(e) => edit({ comment: e.target.value })}
              />
            </label>

            {status && (
              <div className={`note note--${status.kind === 'error' ? 'bad' : status.kind === 'queued' ? 'warn' : 'ok'}`} role="status">
                <p>{status.text}</p>
                {status.kind !== 'error' && (
                  <div className="note-actions">
                    {upNext != null ? (
                      <button type="button" className="btn btn--dark btn--small" onClick={() => setOpenStall(upNext)}>
                        Score stall {upNext} next
                      </button>
                    ) : (
                      <span>You have scored every stall in this competition.</span>
                    )}
                    <button type="button" className="btn btn--line btn--small" onClick={() => setOpenStall(null)}>
                      Back to all stalls
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="sheet-foot">
              <p className="sheet-total">
                <span className="sheet-total-n">{fmtScore(totalOf(comp, current.scores))}</span>
                <span className="muted"> of {fmtScore(maxTotal(comp))}</span>
                {openKey && drafts[openKey] && <span className="sheet-flag">Not saved yet</span>}
              </p>
              <button type="submit" className="btn btn--go" disabled={!accepting || busy}>
                {busy ? 'Saving…' : 'Save score'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="desk-bar">
            <p className="desk-progress">
              <strong>
                {done} of {stalls.length}
              </strong>{' '}
              stalls scored
              <span className="meter" aria-hidden="true">
                <span style={{ width: `${(done / Math.max(stalls.length, 1)) * 100}%` }} />
              </span>
            </p>
            {nextTodo(null) != null && accepting && (
              <button type="button" className="btn btn--go btn--small" onClick={() => setOpenStall(nextTodo(null))}>
                {done === 0 ? 'Start with' : 'Continue with'} stall {nextTodo(null)}
              </button>
            )}
          </div>

          <div className="desk-tools">
            <form className="inline-form" onSubmit={openJump}>
              <label htmlFor="jump">Go to stall</label>
              <input id="jump" inputMode="numeric" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))} placeholder="No." />
              <button type="submit" className="btn btn--line btn--small">
                Open
              </button>
            </form>
            <label className="check">
              <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
              <span>Only stalls left to score</span>
            </label>
            <div className="seg" role="group" aria-label="Layout">
              <button type="button" className="seg-btn" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                Grid
              </button>
              <button type="button" className="seg-btn" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                List
              </button>
            </div>
            <Link className="btn btn--line btn--small" href="/map">
              Pick from the map
            </Link>
          </div>

          {visible.length === 0 ? (
            <div className="panel-empty">
              <h2>Every stall is scored</h2>
              <p className="muted">Untick the filter to review or change a score while judging is open.</p>
            </div>
          ) : view === 'grid' ? (
            <>
              <ul className="tiles">
                {visible.map((s) => {
                  const st = stateOf(s.number);
                  const sheet = sheets[keyOf(comp.id, s.number)];
                  return (
                    <li key={s.number}>
                      <button
                        type="button"
                        className={`tile is-${st}`}
                        style={{ '--tone': CANOPY[s.colour ?? 'none'].fill } as CSSProperties}
                        aria-label={`Stall ${s.number}, ${s.name}. ${stateLabel(s.number)}`}
                        title={s.name}
                        onClick={() => setOpenStall(s.number)}
                      >
                        <span className="tile-n">{s.number}</span>
                        <span className="tile-s">
                          {st === 'done' && sheet ? fmtScore(totalOf(comp, sheet.scores)) : st === 'pending' ? 'Queued' : st === 'draft' ? 'Draft' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="tiles-key muted">
                <span className="swatch swatch--done" /> Scored (your total) <span className="swatch swatch--pending" /> Queued on this phone{' '}
                <span className="swatch swatch--draft" /> Draft, not saved
              </p>
            </>
          ) : (
            <ul className="stall-grid">
              {visible.map((s) => {
                const st = stateOf(s.number);
                const tone = CANOPY[s.colour ?? 'none'];
                return (
                  <li key={s.number}>
                    <button type="button" className={`stall-chip is-${st}`} onClick={() => setOpenStall(s.number)}>
                      <span className="stall-plate" style={{ background: tone.fill, color: tone.ink }}>
                        {s.number}
                      </span>
                      <span className="stall-chip-text">
                        <span className="stall-chip-name">{s.name}</span>
                        <span className="stall-chip-state">{stateLabel(s.number)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
