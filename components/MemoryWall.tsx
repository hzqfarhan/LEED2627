'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Memory } from '@/lib/shared';

const OFFSETS_KEY = 'leed26.wallOffsets';
const LIKED_KEY = 'leed26.liked';

type Offsets = Record<string, { x: number; y: number }>;

/** Small repeatable scatter so the wall looks hand-pinned but is the same on every visit. */
function scatter(id: number) {
  // Integer hash only: floating-point trig can differ between the server and some browsers.
  const unit = (salt: number) => {
    let h = Math.imul(id + salt * 7919, 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    rot: round((unit(1) - 0.5) * 13),
    dx: round((unit(2) - 0.5) * 18),
    dy: round((unit(3) - 0.3) * 26),
    tone: Math.floor(unit(4) * 5),
  };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function Photo({ m, large = false }: { m: Memory; large?: boolean }) {
  const tone = scatter(m.id).tone;
  if (m.kind === 'image' && m.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="photo-media" src={m.url} alt={large ? m.caption : ''} loading="lazy" draggable={false} />;
  }
  if (m.kind === 'video' && m.url) {
    if (large) return <video className="photo-media" src={m.url} controls autoPlay playsInline />;
    return (
      <>
        <video
          className="photo-media"
          src={m.url}
          muted
          loop
          playsInline
          preload="metadata"
          onPointerEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
          onPointerLeave={(e) => e.currentTarget.pause()}
        />
        <span className="play-badge" aria-hidden="true" />
      </>
    );
  }
  if (m.kind === 'youtube' && m.url) {
    if (large) {
      return (
        <iframe
          className="photo-media"
          src={`https://www.youtube-nocookie.com/embed/${m.url}?autoplay=1&rel=0`}
          title={m.caption}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo-media" src={`https://i.ytimg.com/vi/${m.url}/hqdefault.jpg`} alt="" loading="lazy" draggable={false} />
        <span className="play-badge" aria-hidden="true" />
      </>
    );
  }
  return (
    <span className={`photo-note tone-${tone}`}>
      <span className="photo-note-year">{m.year ?? 'LEED'}</span>
    </span>
  );
}

export default function MemoryWall({ memories, isAdmin = false }: { memories: Memory[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(memories);
  const [offsets, setOffsets] = useState<Offsets>({});
  const [order, setOrder] = useState<number[]>([]);
  const [liked, setLiked] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<{ busy: boolean; error: string | null; done: string | null }>({
    busy: false,
    error: null,
    done: null,
  });
  const drag = useRef<{ id: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const pinner = useRef<HTMLDialogElement>(null);

  useEffect(() => setItems(memories), [memories]);

  useEffect(() => {
    setOffsets(readJson<Offsets>(OFFSETS_KEY, {}));
    setLiked(readJson<number[]>(LIKED_KEY, []));
  }, []);

  useEffect(() => {
    const d = viewer.current;
    if (!d) return;
    if (openId != null && !d.open) d.showModal();
    if (openId == null && d.open) d.close();
  }, [openId]);

  useEffect(() => {
    const d = pinner.current;
    if (!d) return;
    if (formOpen && !d.open) d.showModal();
    if (!formOpen && d.open) d.close();
  }, [formOpen]);

  const saveOffsets = (next: Offsets) => {
    try {
      window.localStorage.setItem(OFFSETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: number) => {
    if (e.button !== 0) return;
    const base = offsets[String(id)] ?? { x: 0, y: 0 };
    drag.current = { id, startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setOrder((o) => [...o.filter((n) => n !== id), id]);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    setOffsets((prev) => ({ ...prev, [String(d.id)]: { x: d.baseX + dx, y: d.baseY + dy } }));
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      suppressClick.current = true; // the click that follows a drag must not open the photo
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 80);
      setOffsets((prev) => {
        saveOffsets(prev);
        return prev;
      });
    }
  };

  const openMemory = (id: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setOpenId(id);
  };

  const like = async (id: number) => {
    if (liked.includes(id)) return;
    const nextLiked = [...liked, id];
    setLiked(nextLiked);
    setItems((list) => list.map((m) => (m.id === id ? { ...m, likes: m.likes + 1 } : m)));
    try {
      window.localStorage.setItem(LIKED_KEY, JSON.stringify(nextLiked));
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch(`/api/memories/${id}/like`, { method: 'POST' });
      if (res.ok) {
        const body = (await res.json()) as { likes: number };
        setItems((list) => list.map((m) => (m.id === id ? { ...m, likes: body.likes } : m)));
      }
    } catch {
      /* offline: the heart stays filled on this device */
    }
  };

  const tidy = () => {
    setOffsets({});
    setOrder([]);
    saveOffsets({});
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setFormState({ busy: true, error: null, done: null });
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: data.get('link'),
          caption: data.get('caption'),
          author: data.get('author'),
          year: data.get('year'),
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; status?: string } | null;
      if (!res.ok) {
        setFormState({ busy: false, error: body?.error ?? 'The memory could not be sent. Try again.', done: null });
        return;
      }
      form.reset();
      setFormState({
        busy: false,
        error: null,
        done:
          body?.status === 'approved'
            ? 'Pinned. It is on the wall now.'
            : 'Sent. It will appear on the wall once the committee approves it.',
      });
      if (body?.status === 'approved') router.refresh();
    } catch {
      setFormState({ busy: false, error: 'No connection. Check your internet and try again.', done: null });
    }
  };

  const index = items.findIndex((m) => m.id === openId);
  const open = index >= 0 ? items[index] : null;
  const step = (dir: 1 | -1) => {
    if (items.length === 0 || index < 0) return;
    setOpenId(items[(index + dir + items.length) % items.length].id);
  };
  const thisYear = new Date().getFullYear();

  return (
    <div className="wall">
      <div className="wall-bar">
        <button type="button" className="btn btn--go" onClick={() => { setFormState({ busy: false, error: null, done: null }); setFormOpen(true); }}>
          Pin a memory
        </button>
        <button type="button" className="btn btn--line" onClick={tidy} disabled={Object.keys(offsets).length === 0}>
          Straighten the wall
        </button>
        <p className="muted">Drag a photo to move it. Tap it to open it.</p>
      </div>

      <div className="wall-surface">
        <span className="wall-hook" aria-hidden="true" />
        {items.length === 0 ? (
          <div className="wall-empty">
            <h2>The wall is waiting for its first photo</h2>
            <p>Pin a photo or video from a past LEED and it will show up here once approved.</p>
          </div>
        ) : (
          <ul className="wall-grid">
            {items.map((m, i) => {
              const s = scatter(m.id);
              const off = offsets[String(m.id)] ?? { x: 0, y: 0 };
              const z = order.indexOf(m.id);
              const style = {
                transform: `translate(${s.dx + off.x}px, ${s.dy + off.y}px) rotate(${s.rot}deg)`,
                zIndex: z >= 0 ? 10 + z : undefined,
                '--i': i,
              } as CSSProperties;
              const isLiked = liked.includes(m.id);
              return (
                <li key={m.id} className="pin" style={style}>
                  <span className="peg" aria-hidden="true" />
                  <button
                    type="button"
                    className="polaroid"
                    aria-label={`Open memory: ${m.caption}`}
                    onPointerDown={(e) => onPointerDown(e, m.id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onClick={() => openMemory(m.id)}
                  >
                    <span className="photo">
                      <Photo m={m} />
                    </span>
                    <span className="caption">{m.caption}</span>
                  </button>
                  <button
                    type="button"
                    className="heart"
                    aria-pressed={isLiked}
                    aria-label={isLiked ? `Liked. ${m.likes} likes` : `Like this memory. ${m.likes} likes`}
                    onClick={() => void like(m.id)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
                    </svg>
                    {m.likes}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <dialog ref={viewer} className="viewer" onClose={() => setOpenId(null)} aria-label="Memory">
        {open && (
          <div className="viewer-card">
            <div className={`viewer-media viewer-media--${open.kind}`}>
              <Photo m={open} large />
            </div>
            <p className="viewer-caption">{open.caption}</p>
            <p className="muted">
              {[open.author, open.year].filter(Boolean).join(', ') || 'LEED memory'}
            </p>
            <div className="viewer-actions">
              <button type="button" className="btn btn--line btn--small" onClick={() => step(-1)}>
                Previous
              </button>
              <button type="button" className="btn btn--line btn--small" onClick={() => step(1)}>
                Next
              </button>
              <button
                type="button"
                className="heart heart--inline"
                aria-pressed={liked.includes(open.id)}
                onClick={() => void like(open.id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
                </svg>
                {open.likes}
              </button>
              <button type="button" className="btn btn--dark btn--small" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>

      <dialog ref={pinner} className="sheet-dialog" onClose={() => setFormOpen(false)} aria-labelledby="pin-title">
        <form onSubmit={submit} className="stack">
          <h2 id="pin-title">Pin a memory</h2>
          <p className="muted">
            {isAdmin
              ? 'As an admin, your memory goes straight onto the wall.'
              : 'Your memory appears on the wall after the committee approves it.'}
          </p>
          <label className="field">
            <span>Link to a photo, video file or YouTube video (optional)</span>
            <input name="link" type="text" inputMode="url" placeholder="https://" autoComplete="off" />
            <small>Leave this empty to pin a note with only a caption.</small>
          </label>
          <label className="field">
            <span>Caption</span>
            <input name="caption" type="text" required maxLength={140} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Your name or group (optional)</span>
              <input name="author" type="text" maxLength={60} autoComplete="name" />
            </label>
            <label className="field">
              <span>Year</span>
              <select name="year" defaultValue={String(thisYear)}>
                {Array.from({ length: 6 }, (_, k) => thisYear - k).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formState.error && (
            <p className="note note--bad" role="alert">
              {formState.error}
            </p>
          )}
          {formState.done && (
            <p className="note note--ok" role="status">
              {formState.done}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn--line" onClick={() => setFormOpen(false)}>
              Close
            </button>
            <button type="submit" className="btn btn--go" disabled={formState.busy}>
              {formState.busy ? 'Sending…' : 'Pin memory'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
