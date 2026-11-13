'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EVENT } from '@/lib/event';

/**
 * The floating top bar. It slides away while you scroll down to read, and comes back
 * as soon as you scroll up a little (or reach the top, or tab into it).
 */
export default function NavShell({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [lifted, setLifted] = useState(false);
  const last = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    last.current = window.scrollY;
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const dy = y - last.current;
        if (y < 80) setHidden(false);
        else if (dy > 8) setHidden(true);
        else if (dy < -6) setHidden(false);
        if (Math.abs(dy) > 6 || y < 80) last.current = y;
        setLifted(y > 8);
        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className={`nav nav--float${hidden ? ' is-hidden' : ''}${lifted ? ' is-lifted' : ''}`} onFocusCapture={() => setHidden(false)}>
        <Link href="/" className="nav-brand" aria-label={`${EVENT.name} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/leed-logo-small.webp" width={360} height={242} alt="" />
        </Link>
        {children}
      </header>
      <div className="nav-spacer" aria-hidden="true" />
    </>
  );
}
