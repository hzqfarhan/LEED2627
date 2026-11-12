'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Venue2D, { type StallMark } from './Venue2D';
import { clusterName } from '@/lib/event';
import { QUEUE_EVENT, readQueue } from '@/lib/offlineQueue';
import { plotForStall } from '@/lib/venue';
import { CANOPY, fmtScore, maxTotal, totalOf, type Competition, type Stall, type Submission } from '@/lib/shared';

const Venue3D = dynamic(() => import('./Venue3D'), {
  ssr: false,
  loading: () => <div className="scene scene--loading">Building the 3D view…</div>,
});

type Mode = '2d' | '3d';
const MODE_KEY = 'leed26.mapMode';

interface Props {
  stalls: Stall[];
  /** Present when a judge is signed in: their competitions and score sheets. */
  judging?: { judgeId: number; competitions: Competition[]; submissions: Submission[] } | null;
  initialStall?: number | null;
}

export default function VenueExplorer({ stalls, judging = null, initialStall = null }: Props) {
  const [mode, setMode] = useState<Mode>('2d');
  const [selected, setSelected] = useState<number | null>(initialStall);
  const [compId, setCompId] = useState<number | null>(judging?.competitions[0]?.id ?? null);
  const [queued, setQueued] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === '3d' || saved === '2d') setMode(saved);
  }, []);

  useEffect(() => {
    const mine = judging?.judgeId;
    const sync = () =>
      setQueued(
        readQueue()
          .filter((q) => q.judgeId == null || q.judgeId === mine)
          .map((q) => `${q.competitionId}:${q.stallNumber}`),
      );
    sync();
    window.addEventListener(QUEUE_EVENT, sync);
    return () => window.removeEventListener(QUEUE_EVENT, sync);
  }, [judging?.judgeId]);

  const changeMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const marks = useMemo(() => {
    const out: Record<number, StallMark> = {};
    if (!judging || compId == null) return out;
    for (const s of judging.submissions) if (s.competitionId === compId) out[s.stallNumber] = 'done';
    for (const key of queued) {
      const [c, n] = key.split(':').map(Number);
      if (c === compId) out[n] = 'queued';
    }
    return out;
  }, [judging, compId, queued]);

  const stall = stalls.find((s) => s.number === selected) ?? null;
  const tone = CANOPY[stall?.colour ?? 'none'];
  const scoredCount = Object.keys(marks).length;

  return (
    <div className="explorer">
      <div className="explorer-bar">
        <div className="seg" role="group" aria-label="Map view">
          <button type="button" className="seg-btn" aria-pressed={mode === '2d'} onClick={() => changeMode('2d')}>
            2D plan
          </button>
          <button type="button" className="seg-btn" aria-pressed={mode === '3d'} onClick={() => changeMode('3d')}>
            3D view
          </button>
        </div>

        <label className="field field--inline">
          <span>Find a stall</span>
          <select value={selected ?? ''} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose…</option>
            {stalls.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.name}
              </option>
            ))}
          </select>
        </label>

        {judging && judging.competitions.length > 0 && (
          <label className="field field--inline">
            <span>Show my progress for</span>
            <select value={compId ?? ''} onChange={(e) => setCompId(Number(e.target.value))}>
              {judging.competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {notice && (
        <p className="note note--warn" role="status">
          {notice}
        </p>
      )}

      <div className="explorer-body">
        <div className={`explorer-stage explorer-stage--${mode}`}>
          {mode === '2d' ? (
            <Venue2D stalls={stalls} selected={selected} onSelect={setSelected} marks={marks} />
          ) : (
            <Venue3D
              stalls={stalls}
              selected={selected}
              onSelect={setSelected}
              marks={marks}
              onUnavailable={() => {
                setMode('2d');
                setNotice('This device could not start the 3D view, so the 2D plan is shown instead.');
              }}
            />
          )}
          {mode === '3d' && <p className="stage-hint">Drag to look around. Pinch or scroll to zoom. Tap a tent to choose it.</p>}
        </div>

        <aside className={`stall-panel${stall ? ' has-stall' : ''}`} aria-live="polite">
          {stall ? (
            <>
              <button type="button" className="panel-close" aria-label="Close stall details" onClick={() => setSelected(null)}>
                <span aria-hidden="true">×</span>
              </button>
              <div className="stall-head">
                <span className="stall-plate" style={{ background: tone.fill, color: tone.ink }}>
                  {stall.number}
                </span>
                <div>
                  <h2>{stall.name}</h2>
                  <p className="muted">
                    {clusterName(stall.cluster)}
                    {stall.groupName ? `, ${stall.groupName}` : ''}
                  </p>
                </div>
              </div>
              {!plotForStall(stall.number) && (
                <p className="note note--warn">This stall is not on the tent layout yet. Ask the committee where it is.</p>
              )}
              {stall.description && <p>{stall.description}</p>}
              <Link className="btn btn--line btn--small panel-link" href={`/stalls/${stall.number}`}>
                Open stall page
              </Link>
              <dl className="facts">
                <div>
                  <dt>Canopy</dt>
                  <dd>{tone.label}</dd>
                </div>
                {stall.instagram && (
                  <div>
                    <dt>Instagram</dt>
                    <dd>
                      <a href={`https://instagram.com/${stall.instagram}`} target="_blank" rel="noreferrer">
                        @{stall.instagram}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              {judging && (
                <div className="panel-judging">
                  <h3>Your scores for this stall</h3>
                  {judging.competitions.length === 0 && <p className="muted">You are not assigned to a competition yet.</p>}
                  <ul className="score-links">
                    {judging.competitions.map((c) => {
                      const sub = judging.submissions.find((s) => s.competitionId === c.id && s.stallNumber === stall.number);
                      const waiting = queued.includes(`${c.id}:${stall.number}`);
                      return (
                        <li key={c.id}>
                          <div>
                            <strong>{c.name}</strong>
                            <span className="muted">
                              {waiting
                                ? 'Saved on this phone, waiting to send'
                                : sub
                                  ? `Scored ${fmtScore(totalOf(c, sub.scores))} out of ${fmtScore(maxTotal(c))}`
                                  : 'Not scored yet'}
                            </span>
                          </div>
                          <Link className="btn btn--line btn--small" href={`/judge?c=${c.slug}&s=${stall.number}`}>
                            {sub || waiting ? 'Change score' : 'Score this stall'}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="panel-empty">
              <h2>Choose a stall</h2>
              <p className="muted">Tap a tent on the map, or pick a stall number from the list above.</p>
              {judging && compId != null && (
                <p className="muted">
                  You have scored {scoredCount} of {stalls.length} stalls in this competition. Scored tents show a green tick.
                </p>
              )}
            </div>
          )}

          <ul className="legend" aria-label="Map key">
            <li>
              <span className="key key--stall" /> Stall, in its canopy colour
            </li>
            <li>
              <span className="key key--support" /> Support and official tents
            </li>
            <li>
              <span className="key key--zone" /> Emergency assembly point
            </li>
            <li>
              <span className="key key--ext" /> Fire extinguisher
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
