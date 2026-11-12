'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CLUSTERS, EVENT } from '@/lib/event';
import { CANOPY, isUnnamed, type Competition, type Stall } from '@/lib/shared';

interface Props {
  stall: Stall;
  competitions: Competition[];
  /** competitionId -> number of judges who have scored this stall */
  coverage: Record<string, number>;
}

export default function StallTeamDesk({ stall, competitions, coverage }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(isUnnamed(stall));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tone = CANOPY[stall.colour ?? 'none'];

  const checklist = [
    { done: !isUnnamed(stall), label: 'Give your stall its name' },
    { done: Boolean(stall.cluster), label: 'Choose your cluster' },
    { done: Boolean(stall.description), label: 'Say what you sell' },
    { done: Boolean(stall.pitchUrl), label: 'Add your business pitch video (YouTube)' },
    { done: stall.promoUrls.length > 0, label: 'Add at least one promo video (TikTok or Instagram)' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/stall', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.get('name'),
          groupName: d.get('groupName'),
          cluster: d.get('cluster'),
          description: d.get('description'),
          instagram: d.get('instagram'),
          pitchUrl: d.get('pitchUrl'),
          promoUrls: [d.get('promo1'), d.get('promo2'), d.get('promo3')],
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? 'Your changes could not be saved. Try again.' });
      } else {
        setMsg({ ok: true, text: 'Saved. Judges and visitors now see these details.' });
        setEditing(false);
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: 'No connection. Check your internet and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="team">
      <section className="team-card" style={{ borderTopColor: tone.fill }}>
        <div className="sheet-head">
          <span className="stall-plate stall-plate--big" style={{ background: tone.fill, color: tone.ink }}>
            {stall.number}
          </span>
          <div>
            <h2>{stall.name}</h2>
            <p className="muted">
              {CLUSTERS.find((c) => c.id === stall.cluster)?.name ?? 'Cluster not chosen'}
              {stall.groupName ? `, ${stall.groupName}` : ''}
            </p>
          </div>
        </div>
        <div className="row-actions">
          <Link className="btn btn--line btn--small" href={`/map?stall=${stall.number}`}>
            Find my tent on the map
          </Link>
          <Link className="btn btn--line btn--small" href={`/stalls/${stall.number}`}>
            See my public page
          </Link>
          {!editing && (
            <button type="button" className="btn btn--dark btn--small" onClick={() => setEditing(true)}>
              Edit stall details
            </button>
          )}
        </div>
      </section>

      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      <div className="team-grid">
        <section className="card stack">
          <div>
            <h3>Get ready for judging</h3>
            <p className="muted">
              {doneCount} of {checklist.length} done. Judges open your videos from here, so add them before {EVENT.dates.split(' & ')[0]}{' '}
              December.
            </p>
          </div>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.label} className={c.done ? 'is-done' : undefined}>
                <span className="checkmark" aria-hidden="true" />
                <span>
                  {c.label}
                  <span className="sr-only">{c.done ? ', done' : ', to do'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <div>
            <h3>Judging so far</h3>
            <p className="muted">How many judges have visited your stall. Scores stay private until the committee publishes results.</p>
          </div>
          <ul className="coverage">
            {competitions.map((c) => {
              const n = coverage[String(c.id)] ?? 0;
              return (
                <li key={c.id}>
                  <span>{c.name.replace(' Competition', '')}</span>
                  <strong>
                    {n} {n === 1 ? 'judge' : 'judges'}
                  </strong>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <h3>Stall details</h3>
          <div className="field-row">
            <label className="field">
              <span>Stall name</span>
              <input name="name" defaultValue={isUnnamed(stall) ? '' : stall.name} required maxLength={80} placeholder="e.g. Kopi Kampus" />
            </label>
            <label className="field">
              <span>Group</span>
              <input name="groupName" defaultValue={stall.groupName ?? ''} maxLength={80} placeholder="e.g. Group 7, BIT 21603" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Cluster</span>
              <select name="cluster" defaultValue={stall.cluster ?? ''}>
                <option value="">Choose…</option>
                {CLUSTERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Instagram handle (optional)</span>
              <input name="instagram" defaultValue={stall.instagram ?? ''} maxLength={60} placeholder="yourstall" />
            </label>
          </div>
          <label className="field">
            <span>What you sell</span>
            <input name="description" defaultValue={stall.description ?? ''} maxLength={300} placeholder="One line visitors will see" />
          </label>

          <fieldset className="field-set">
            <legend>Videos for the judges</legend>
            <label className="field">
              <span>Business pitch video, 2 to 3 minutes (YouTube link)</span>
              <input name="pitchUrl" type="url" inputMode="url" defaultValue={stall.pitchUrl ?? ''} placeholder="https://youtu.be/…" />
            </label>
            {[0, 1, 2].map((i) => (
              <label key={i} className="field">
                <span>Promo video {i + 1}, up to 1 minute{i > 0 ? ' (optional)' : ''}</span>
                <input name={`promo${i + 1}`} type="url" inputMode="url" defaultValue={stall.promoUrls[i] ?? ''} placeholder="https://www.tiktok.com/…" />
              </label>
            ))}
            <small className="muted">Use the full link that starts with https://. At least one promo video should show your booth location at LEED 26.</small>
          </fieldset>

          <div className="row-actions">
            <button type="submit" className="btn btn--go" disabled={busy}>
              {busy ? 'Saving…' : 'Save stall details'}
            </button>
            {!isUnnamed(stall) && (
              <button type="button" className="btn btn--line" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
