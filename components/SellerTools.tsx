'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import type { StallMember } from '@/lib/shared';

/** Shrink a phone photo to at most 1600 px on its long side as JPEG, so uploads stay small and fast. */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('type');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86));
  } catch {
    return file;
  }
}

/** Shrink a logo to at most 512 px. PNG and WebP stay PNG so a transparent background survives. */
async function shrinkLogo(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('type');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 300 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, 0.9));
  } catch {
    return file;
  }
}

/** Optional company logo: add it any time, replace or remove it later. */
export function LogoPanel({ stallNumber, stallName, logoVersion }: { stallNumber: number; stallName: string; logoVersion: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const src = logoVersion ? `/api/logo/${stallNumber}?v=${logoVersion}` : null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const blob = await shrinkLogo(file);
      if (blob.size > 1024 * 1024) {
        setMsg({ ok: false, text: 'That logo is too big even after shrinking. Use one under 1 MB.' });
        return;
      }
      const res = await fetch('/api/stall/logo', { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setMsg({ ok: false, text: body?.error ?? 'The logo could not be uploaded. Try again.' });
      else {
        setMsg({ ok: true, text: logoVersion ? 'Logo updated.' : 'Logo added. It now shows next to your stall name.' });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: 'Use a JPEG, PNG or WebP image.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/stall/logo', { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    setAsking(false);
    if (res?.ok) {
      setMsg({ ok: true, text: 'Logo removed. Your stall number shows instead.' });
      router.refresh();
    } else setMsg({ ok: false, text: 'The logo could not be removed. Try again.' });
  };

  return (
    <section className="card stack logo-panel">
      <div className="logo-panel-head">
        <div>
          <h3>
            Company logo <span className="tag tag--optional">Optional</span>
          </h3>
          <p className="muted">Shown next to your stall name on the stall list, your stall page and the poster wall. Square works best; a PNG with a see-through background looks cleanest. You can change it any time.</p>
        </div>
      </div>
      <div className="logo-stage">
        <div className="logo-preview logo-preview--square" aria-label={src ? 'Your logo' : 'No logo yet'}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt={`${stallName} logo`} /> : <span>{stallNumber}</span>}
        </div>
        <div className="logo-uses" aria-hidden="true">
          <span className="logo-use">
            <span className="logo-use-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={src} alt="" /> : <b>{stallNumber}</b>}
            </span>
            <span>
              <strong>{stallName}</strong>
              <small>Stall list</small>
            </span>
          </span>
          <span className="logo-use logo-use--dark">
            <span className="logo-use-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={src} alt="" /> : <b>{stallNumber}</b>}
            </span>
            <span>
              <strong>{stallName}</strong>
              <small>On a dark background</small>
            </span>
          </span>
        </div>
      </div>
      <div className="row-actions">
        <label className={`btn btn--go btn--small file-btn${busy ? ' is-busy' : ''}`}>
          {busy ? 'Uploading…' : src ? 'Change logo' : 'Add logo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {src && (
          <button type="button" className="btn btn--quiet btn--small" disabled={busy} onClick={() => setAsking(true)}>
            Remove logo
          </button>
        )}
      </div>
      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <ConfirmDialog
        open={asking}
        title="Remove your logo?"
        art={src ? <span className="logo-preview logo-preview--small">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src} alt="" /></span> : undefined}
        confirmLabel="Remove logo"
        cancelLabel="Keep it"
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={() => void remove()}
      >
        <p className="muted">Your stall number shows in its place. You can add a logo again any time.</p>
      </ConfirmDialog>
    </section>
  );
}

export function PosterPanel({ stallNumber, posterVersion }: { stallNumber: number; posterVersion: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const blob = await shrink(file);
      if (blob.size > 3 * 1024 * 1024) {
        setMsg({ ok: false, text: 'That image is too big even after shrinking. Use one under 3 MB.' });
        return;
      }
      const res = await fetch('/api/stall/poster', { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setMsg({ ok: false, text: body?.error ?? 'The poster could not be uploaded. Try again.' });
      else {
        setMsg({ ok: true, text: 'Poster uploaded. It is now on the memory wall and your stall page.' });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: 'Use a JPEG, PNG or WebP image.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/stall/poster', { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setMsg({ ok: false, text: 'The poster could not be removed. Try again.' });
  };

  return (
    <section className="card stack poster-panel">
      <div>
        <h3>Stall poster</h3>
        <p className="muted">Shown on the memory wall and your stall page. Portrait works best. JPEG, PNG or WebP; big phone photos are shrunk for you.</p>
      </div>
      {posterVersion ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="poster-preview" src={`/api/poster/${stallNumber}?v=${posterVersion}`} alt="Your current stall poster" />
      ) : (
        <div className="poster-empty" aria-hidden="true">
          No poster yet
        </div>
      )}
      <div className="row-actions">
        <label className={`btn btn--go btn--small file-btn${busy ? ' is-busy' : ''}`}>
          {busy ? 'Uploading…' : posterVersion ? 'Replace poster' : 'Upload poster'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {posterVersion && (
          <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        )}
      </div>
      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/** "2 hours ago", "yesterday", "13 Nov": short and friendly. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.round((now - t) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function inviteText(stallName: string, stallNumber: number, email: string): string {
  const site = typeof window === 'undefined' ? '' : window.location.origin;
  return `Hi! I added you to our LEED 26 stall team, ${stallName} (Stall ${stallNumber}). Sign in at ${site}/login with UTHM SSO using ${email} and you will join the team straight away. You can then help with the stall details, poster and videos.`;
}

export function TeamPanel({
  team,
  me,
  canManage,
  stallName,
  stallNumber,
}: {
  team: StallMember[];
  me: string;
  canManage: boolean;
  stallName: string;
  stallNumber: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StallMember | null>(null);

  // Leader first, then people still to sign in (the ones to chase), then everyone connected.
  const sorted = [...team].sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || Number(a.joined) - Number(b.joined));
  const connected = team.filter((m) => m.joined).length;
  const waiting = team.length - connected;

  const call = async (method: 'POST' | 'DELETE' | 'PATCH', email: string, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/stall/team', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setMsg({ ok: false, text: body?.error ?? 'That did not work. Try again.' });
      else {
        setMsg({ ok: true, text: done });
        router.refresh();
      }
      return res.ok;
    } catch {
      setMsg({ ok: false, text: 'No connection. Check your internet and try again.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get('email') ?? '').trim().toLowerCase();
    if (await call('POST', email, `${email} added. Send them the invite so they sign in and join.`)) form.reset();
  };

  const copyInvite = async (email: string) => {
    try {
      await navigator.clipboard.writeText(inviteText(stallName, stallNumber, email));
      setCopied(email);
      window.setTimeout(() => setCopied((c) => (c === email ? null : c)), 2500);
    } catch {
      setMsg({ ok: false, text: 'Could not copy. Use the WhatsApp button instead.' });
    }
  };

  return (
    <section className="card stack team-panel">
      <div className="team-top">
        <div>
          <h3>Your team</h3>
          <p className="muted">
            {canManage
              ? 'Add groupmates by their UTHM email. Each one joins the moment they first sign in with UTHM SSO.'
              : 'Your team leader adds and removes groupmates.'}
          </p>
        </div>
        <div className={`team-meter${waiting === 0 ? ' team-meter--all' : ''}`} role="img" aria-label={`${connected} of ${team.length} connected`}>
          <span className="team-meter-count">
            <strong>{connected}</strong>/{team.length}
          </span>
          <span className="team-meter-label">connected</span>
          <span className="team-meter-bar" aria-hidden="true">
            {sorted.map((m) => (
              <i key={m.email} className={m.joined ? 'on' : ''} />
            ))}
          </span>
        </div>
      </div>

      {canManage && waiting > 0 && (
        <p className="team-nudge">
          <strong>
            {waiting} groupmate{waiting === 1 ? ' has' : 's have'} not signed in yet.
          </strong>{' '}
          Send {waiting === 1 ? 'them' : 'each one'} the invite below. They show as connected here once they sign in.
        </p>
      )}
      {canManage && waiting === 0 && team.length > 1 && <p className="team-nudge team-nudge--ok">Everyone has signed in. Your whole team can edit the stall.</p>}

      <ul className="member-list">
        {sorted.map((m) => {
          const you = m.email === me;
          return (
            <li key={m.email} className={`member ${m.joined ? 'member--on' : 'member--wait'}`}>
              <span className="member-face">
                <Avatar name={m.name ?? m.email} photos={m.photos} size={48} />
                <span className="member-dot" aria-hidden="true" />
              </span>
              <div className="member-text">
                <span className="member-name">
                  <strong>{m.name ?? m.email.split('@')[0].toUpperCase()}</strong>
                  {you && <span className="tag tag--you">You</span>}
                  {m.isLeader && <span className="tag tag--leader">Leader</span>}
                </span>
                <span className="member-email">{m.email}</span>
                {m.joined ? (
                  <span className="member-status member-status--on" suppressHydrationWarning>
                    Connected{m.lastSeen ? `, last signed in ${timeAgo(m.lastSeen)}` : ''}
                  </span>
                ) : (
                  <span className="member-status member-status--wait" suppressHydrationWarning>
                    Waiting for first sign-in{m.addedAt ? `, added ${timeAgo(m.addedAt)}` : ''}
                  </span>
                )}
              </div>
              {canManage && !you && (
                <div className="member-actions">
                  {!m.joined && (
                    <>
                      <a
                        className="btn btn--go btn--small"
                        href={`https://wa.me/?text=${encodeURIComponent(inviteText(stallName, stallNumber, m.email))}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Invite on WhatsApp
                      </a>
                      <button type="button" className="btn btn--line btn--small" onClick={() => void copyInvite(m.email)}>
                        {copied === m.email ? 'Copied' : 'Copy invite'}
                      </button>
                    </>
                  )}
                  {m.joined && !m.isLeader && (
                    <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => void call('PATCH', m.email, `${m.name ?? m.email} is now the team leader.`)}>
                      Make leader
                    </button>
                  )}
                  <button type="button" className="btn btn--quiet btn--small" disabled={busy} onClick={() => setRemoving(m)}>
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <form className="add-member" onSubmit={add}>
          <label className="field">
            <span>Add a groupmate by UTHM email</span>
            <input name="email" type="email" inputMode="email" required placeholder="ai230123@student.uthm.edu.my" pattern=".+@(student\.)?uthm\.edu\.my" title="An @student.uthm.edu.my or @uthm.edu.my email" />
          </label>
          <button type="submit" className="btn btn--go btn--small" disabled={busy}>
            Add to team
          </button>
        </form>
      )}
      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <ConfirmDialog
        open={removing != null}
        title={`Remove ${removing ? (removing.name ?? removing.email.split('@')[0].toUpperCase()) : ''} from ${stallName}?`}
        art={
          removing && (
            <span className="confirm-face">
              <Avatar name={removing.name ?? removing.email} photos={removing.photos} size={76} />
              <span className="confirm-x" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </span>
            </span>
          )
        }
        confirmLabel="Remove from team"
        cancelLabel="Keep them"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await call('DELETE', removing.email, `${removing.name ?? removing.email} removed from the team.`);
          setRemoving(null);
        }}
      >
        {removing && (
          <>
            <p className="confirm-email">{removing.email}</p>
            <ul className="confirm-list">
              {removing.joined ? (
                <>
                  <li>They can no longer edit the stall, poster or videos.</li>
                  <li>They stay signed in as a customer and can still like and rate stalls.</li>
                </>
              ) : (
                <li>Their invite stops working: signing in will no longer add them to your team.</li>
              )}
              <li>You can add them back any time with the same email.</li>
            </ul>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
