'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import StallLogo from './StallLogo';
import { CLUSTERS, categoryName } from '@/lib/event';
import { CANOPY, classifyMemoryUrl, type Stall } from '@/lib/shared';

/** What visitors may see about a team member (no emails). */
export interface PublicMember {
  name: string;
  isLeader: boolean;
  photos: string[];
}

interface Props {
  /** Stalls that have uploaded a poster. */
  stalls: Stall[];
  /** stall number -> members who have signed in */
  teams: Record<number, PublicMember[]>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

function tilt(n: number): number {
  return ((((n * 2654435761) >>> 0) % 900) / 100 - 4.5) * 0.9;
}

/** Stall posters pinned on the memory wall. Tapping one opens its video, details and team. */
export default function PosterBoard({ stalls, teams }: Props) {
  const [openNo, setOpenNo] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const open = stalls.find((s) => s.number === openNo) ?? null;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (stalls.length === 0) return null;

  const videos = open ? [open.pitchUrl, ...open.promoUrls].filter((u): u is string => Boolean(u)) : [];
  const yt = videos.map((u) => classifyMemoryUrl(u)).find((v) => v?.kind === 'youtube') ?? null;
  const team = open ? (teams[open.number] ?? []) : [];
  const tone = CANOPY[open?.colour ?? 'none'];
  const cluster = open ? CLUSTERS.find((c) => c.id === open.cluster)?.name : undefined;

  return (
    <section className="posters" aria-labelledby="posters-title">
      <div className="posters-head">
        <h2 id="posters-title">Stall posters</h2>
        <p className="muted">LEED 26 stalls. Tap a poster for the stall’s video, details and team.</p>
      </div>
      <ul className="poster-grid">
        {stalls.map((s) => (
          <li key={s.number} style={{ transform: `rotate(${tilt(s.number)}deg)` }}>
            <button type="button" className="poster-card" onClick={() => setOpenNo(s.number)} aria-label={`Stall ${s.number}, ${s.name}. Open details`}>
              <span className="poster-pin" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/poster/${s.number}?v=${s.posterVersion}`} alt="" loading="lazy" draggable={false} />
              <span className="poster-label">
                <span className="stall-plate stall-plate--small" style={{ background: CANOPY[s.colour ?? 'none'].fill, color: CANOPY[s.colour ?? 'none'].ink }}>
                  {s.number}
                </span>
                {s.name}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog ref={dialog} className="viewer poster-viewer" onClose={() => setOpenNo(null)} aria-labelledby="poster-viewer-title">
        {open && (
          <div className="poster-viewer-card">
            <div className="poster-viewer-media">
              {yt ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${yt.url}?rel=0`}
                  title={`${open.name} video`}
                  allow="encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/poster/${open.number}?v=${open.posterVersion}`} alt={`${open.name} poster`} />
              )}
            </div>
            <div className="poster-viewer-info">
              <div className="pv-head">
                <span className="stall-plate stall-plate--big" style={{ background: tone.fill, color: tone.ink }}>
                  {open.number}
                </span>
                <h2 id="poster-viewer-title">{open.name}</h2>
                <StallLogo number={open.number} version={open.logoVersion} name={open.name} size={56} className="stall-logo--hero" />
              </div>
              <ul className="pv-chips" aria-label="About this stall">
                {open.category && <li className="pv-chip pv-chip--cat">{categoryName(open.category)}</li>}
                {cluster && <li className="pv-chip">{cluster}</li>}
                {open.groupName && <li className="pv-chip pv-chip--group">{open.groupName}</li>}
              </ul>

              {open.description && <p className="pv-pitch">{open.description}</p>}

              {(open.ssmNumber || open.instagram) && (
                <div className="pv-facts">
                  {open.ssmNumber && (
                    <div className="pv-fact pv-fact--ssm">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
                        <path d="m8.5 12 2.5 2.5 4.5-5" />
                      </svg>
                      <span>
                        <small>SSM registered</small>
                        <strong>{open.ssmNumber}</strong>
                      </span>
                    </div>
                  )}
                  {open.instagram && (
                    <a className="pv-fact pv-fact--ig" href={`https://instagram.com/${encodeURIComponent(open.instagram)}`} target="_blank" rel="noreferrer">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="5" />
                        <circle cx="12" cy="12" r="4" />
                        <circle cx="17.3" cy="6.7" r="0.6" />
                      </svg>
                      <span>
                        <small>Instagram</small>
                        <strong>@{open.instagram}</strong>
                      </span>
                    </a>
                  )}
                </div>
              )}

              {videos.length > 0 && (
                <section className="pv-block" aria-labelledby="pv-videos">
                  <h3 id="pv-videos">
                    Videos <span className="pv-count">{videos.length}</span>
                  </h3>
                  <ul className="pv-videos">
                    {videos.map((u, i) => {
                      const pitch = i === 0 && open.pitchUrl === u;
                      return (
                        <li key={u}>
                          <a className={`pv-video${pitch ? ' pv-video--pitch' : ''}`} href={u} target="_blank" rel="noreferrer">
                            <span className="pv-play" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </span>
                            <span>
                              <strong>{pitch ? 'Business pitch' : `Promo video ${open.pitchUrl ? i : i + 1}`}</strong>
                              <small>{hostOf(u)}</small>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="pv-block" aria-labelledby="pv-team">
                <h3 id="pv-team">
                  The team {team.length > 0 && <span className="pv-count">{team.length}</span>}
                </h3>
                {team.length === 0 ? (
                  <p className="muted">The team has not signed in yet.</p>
                ) : (
                  <ul className="pv-team">
                    {team.map((m, i) => (
                      <li key={`${m.name}-${i}`} className={m.isLeader ? 'pv-member pv-member--lead' : 'pv-member'}>
                        <span className="pv-member-face">
                          <Avatar name={m.name} photos={m.photos} size={64} />
                          {m.isLeader && (
                            <span className="pv-crown" title="Team leader">
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
                              </svg>
                            </span>
                          )}
                        </span>
                        <strong>{m.name}</strong>
                        <small>{m.isLeader ? 'Leader' : 'Member'}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="row-actions pv-actions">
                <Link className="btn btn--go btn--small" href={`/stalls/${open.number}`}>
                  Like or rate this stall
                </Link>
                <Link className="btn btn--line btn--small" href={`/map?stall=${open.number}`}>
                  Find it on the map
                </Link>
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
