import Link from 'next/link';
import type { ReactNode } from 'react';

/** The LEED error and "not found" layout: a fallen tent, a plain message and ways out. */
export default function OopsScreen({
  code,
  title,
  children,
  actions,
  art = 'tent',
}: {
  code?: string | null;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  art?: 'tent' | 'map';
}) {
  return (
    <div className="oops">
      <div className="oops-card">
        <Link href="/" className="oops-logo" aria-label="LEED 26 home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/leed-logo-small.webp" width={360} height={242} alt="" />
        </Link>
        {art === 'tent' ? (
          <svg className="oops-art" viewBox="0 0 220 130" aria-hidden="true">
            <path d="M20 118h180" stroke="#1f0a45" strokeWidth="4" strokeLinecap="round" />
            <g transform="rotate(-14 110 70)">
              <path d="M44 66 112 24l68 42Z" fill="#F27BAE" stroke="#1f0a45" strokeWidth="4" strokeLinejoin="round" />
              <path d="M44 66h136v10c-11 9-23 9-34 0-11 9-23 9-34 0-11 9-23 9-34 0-11 9-23 9-34 0Z" fill="#ffd91a" stroke="#1f0a45" strokeWidth="4" strokeLinejoin="round" />
            </g>
            <path d="M60 118 70 88M162 118 150 60" stroke="#1f0a45" strokeWidth="5" strokeLinecap="round" />
            <path d="M84 118l6-10 6 10M128 118l5-8 5 8" fill="none" stroke="#1f0a45" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="186" cy="30" r="5" fill="#1fefd0" stroke="#1f0a45" strokeWidth="3" />
            <path d="M30 34l6 6m0-6-6 6" stroke="#ff1a9a" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        ) : (
          <div className="oops-404" aria-hidden="true">
            <span style={{ background: '#F27BAE' }}>4</span>
            <span style={{ background: '#ffd91a' }}>0</span>
            <span style={{ background: '#3F86E6' }}>4</span>
          </div>
        )}
        <h1>{title}</h1>
        <div className="oops-text">{children}</div>
        <div className="oops-actions">{actions}</div>
        {code && <p className="oops-code">Error code {code}. Tell the committee this code if it keeps happening.</p>}
      </div>
    </div>
  );
}
