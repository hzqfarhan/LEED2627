'use client';

import { useEffect, useState } from 'react';

interface Props {
  start: string;
  end: string;
  /** "hero" shows big tiles; "compact" a smaller row for guide pages. */
  size?: 'hero' | 'compact';
}

const UNITS = [
  { key: 'days', label: 'Days', tone: 'yellow' },
  { key: 'hours', label: 'Hours', tone: 'pink' },
  { key: 'minutes', label: 'Minutes', tone: 'mint' },
  { key: 'seconds', label: 'Seconds', tone: 'cream' },
] as const;

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export default function Countdown({ start, end, size = 'hero' }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (now != null && now >= endMs) {
    return <p className="cd-note">LEED 26 has wrapped up. Thank you for coming!</p>;
  }
  if (now != null && now >= startMs) {
    return (
      <p className="cd-note cd-note--live">
        <span className="cd-dot" aria-hidden="true" />
        Happening now at the FSKTM parking lot
      </p>
    );
  }

  // Rendered as dashes on the server so the first paint never shows a stale number.
  const parts = now == null ? null : split(startMs - now);
  const spoken = parts ? `${parts.days} days, ${parts.hours} hours and ${parts.minutes} minutes until LEED 26 opens` : 'Countdown to LEED 26';
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className={`cd cd--${size}`} role="timer" aria-label={spoken}>
      <p className="cd-title" aria-hidden="true">
        Opens Wednesday, 9 December, 9:00 am
      </p>
      <ol className="cd-tiles" aria-hidden="true">
        {UNITS.map((u) => (
          <li key={u.key} className={`cd-tile cd-tile--${u.tone}`}>
            <span className="cd-n" key={parts ? parts[u.key] : 'x'}>
              {parts ? (u.key === 'days' ? parts.days : pad(parts[u.key])) : '--'}
            </span>
            <span className="cd-label">{u.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
