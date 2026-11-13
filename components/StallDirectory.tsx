'use client';

import Link from 'next/link';
import StallLogo from './StallLogo';
import { useMemo, useState } from 'react';
import { CLUSTERS, clusterName } from '@/lib/event';
import { CANOPY, type Stall } from '@/lib/shared';

export default function StallDirectory({ stalls }: { stalls: Stall[] }) {
  const [query, setQuery] = useState('');
  const [cluster, setCluster] = useState<string>('all');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stalls.filter((s) => {
      if (cluster !== 'all' && s.cluster !== cluster) return false;
      if (!q) return true;
      return [String(s.number), s.name, s.groupName ?? '', s.description ?? ''].some((v) => v.toLowerCase().includes(q));
    });
  }, [stalls, query, cluster]);

  return (
    <div className="stack">
      <div className="dir-tools">
        <label className="field search">
          <span className="sr-only">Search stalls</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, number or product" />
        </label>
        <div className="chips" role="group" aria-label="Filter by cluster">
          <button type="button" className="chip" aria-pressed={cluster === 'all'} onClick={() => setCluster('all')}>
            All
          </button>
          {CLUSTERS.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={cluster === c.id} onClick={() => setCluster(c.id)}>
              {c.name.split(' ')[0] === 'Local' ? 'Local & Creative' : c.name.split(' & ')[0]}
            </button>
          ))}
        </div>
      </div>

      <p className="muted" aria-live="polite">
        {shown.length} of {stalls.length} stalls
      </p>

      {shown.length === 0 ? (
        <div className="panel-empty">
          <h2>No stalls match</h2>
          <p className="muted">Try a shorter search, or choose “All”.</p>
        </div>
      ) : (
        <ul className="dir">
          {shown.map((s) => {
            const tone = CANOPY[s.colour ?? 'none'];
            return (
              <li key={s.number}>
                <Link href={`/stalls/${s.number}`} className="dir-item">
                  {s.logoVersion ? (
                    <span className="logo-with-plate">
                      <StallLogo number={s.number} version={s.logoVersion} name={s.name} size={46} className="stall-logo--card" />
                      <span className="stall-plate stall-plate--tiny" style={{ background: tone.fill, color: tone.ink }}>
                        {s.number}
                      </span>
                    </span>
                  ) : (
                    <span className="stall-plate" style={{ background: tone.fill, color: tone.ink }}>
                      {s.number}
                    </span>
                  )}
                  <span className="dir-text">
                    <strong>{s.name}</strong>
                    <span className="muted">{s.description ?? clusterName(s.cluster)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
