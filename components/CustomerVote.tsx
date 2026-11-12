'use client';

import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Loads Cloudflare's Turnstile script once per page. */
function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let tag = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!tag) {
      tag = document.createElement('script');
      tag.id = SCRIPT_ID;
      tag.src = SCRIPT_SRC;
      tag.async = true;
      tag.defer = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'))));
    tag.addEventListener('error', () => reject(new Error('turnstile')));
  });
}

interface Props {
  stallNumber: number;
  stallName: string;
  /** This phone's current vote, read from its cookie on the server. */
  initial: boolean | null;
  open: boolean;
  /** True when this phone already holds a signed voter cookie (it passed the human check before). */
  verified: boolean;
  /** Turnstile site key, or null when the check is switched off. */
  siteKey: string | null;
}

export default function CustomerVote({ stallNumber, stallName, initial, open, verified, siteKey }: Props) {
  const [vote, setVote] = useState<boolean | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isVerified, setVerified] = useState(verified);
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  const needsCheck = Boolean(siteKey) && !isVerified && open;

  useEffect(() => {
    if (!needsCheck || !siteKey) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current || widget.current) return;
        widget.current = ts.render(box.current, {
          sitekey: siteKey,
          action: 'vote',
          appearance: 'interaction-only',
          callback: (t: string) => {
            setToken(t);
            setCheckFailed(false);
          },
          'expired-callback': () => setToken(null),
          'error-callback': () => {
            setToken(null);
            setCheckFailed(true);
          },
        });
      })
      .catch(() => !cancelled && setCheckFailed(true));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [needsCheck, siteKey]);

  const resetCheck = () => {
    setToken(null);
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  };

  const send = async (liked: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stall: stallNumber, liked, token: needsCheck ? token : undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; needCheck?: boolean } | null;
      if (!res.ok) {
        setMsg(body?.error ?? 'Your vote could not be sent. Try again.');
        if (body?.needCheck) resetCheck();
      } else {
        setVerified(true);
        setVote(liked);
        setMsg(liked ? 'Thanks. Your like counts towards the Customer Choice Award.' : 'Thanks for your feedback.');
      }
    } catch {
      setMsg('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="vote">
        <h2>Customer Choice Award</h2>
        <p className="muted">Voting is closed.</p>
      </section>
    );
  }

  return (
    <section className="vote" aria-labelledby="vote-title">
      <div>
        <h2 id="vote-title">Did you like {stallName}?</h2>
        <p className="muted">One vote per phone. You can change it any time while voting is open. The stall with the most likes wins the Customer Choice Award.</p>
      </div>
      {needsCheck && (
        <div className="vote-check">
          <div ref={box} />
          {!token && (
            <p className="muted" role="status">
              {checkFailed ? 'The human check did not load. Refresh the page and try again.' : 'Checking that you are a visitor, not a bot…'}
            </p>
          )}
        </div>
      )}
      <div className="vote-buttons">
        <button type="button" className="vote-btn vote-btn--like" aria-pressed={vote === true} disabled={busy || (needsCheck && !token)} onClick={() => void send(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 11v9H4v-9zM7 11l4-7c1.700 0 2.700 1.200 2.300 2.900L12.800 10H19a2 2 0 0 1 2 2.300l-1.200 6A2 2 0 0 1 17.800 20H7" />
          </svg>
          I like it
        </button>
        <button type="button" className="vote-btn vote-btn--no" aria-pressed={vote === false} disabled={busy || (needsCheck && !token)} onClick={() => void send(false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17 13V4h3v9zM17 13l-4 7c-1.700 0-2.700-1.200-2.300-2.900L11.200 14H5a2 2 0 0 1-2-2.300l1.200-6A2 2 0 0 1 6.200 4H17" />
          </svg>
          Not for me
        </button>
      </div>
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
