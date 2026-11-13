'use client';

import { useEffect, useRef, useState } from 'react';

interface Persona {
  id: string;
  label: string;
  who: string;
}

interface Props {
  next: string | null;
  /** Why the last sign-in did not work, from the address bar. */
  error: string | null;
  /** The email Google returned, when it was not a UTHM one. */
  triedEmail: string | null;
  ssoReady: boolean;
  /** Sample people to sign in as, only in demo mode. */
  personas: Persona[];
}

const MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. Press the button to try again.',
  expired: 'That sign-in took too long or was opened twice. Please try again.',
  sso: 'UTHM SSO could not confirm your account just now. Please try again in a moment.',
  'sso-off': 'UTHM SSO is not set up on this server yet. Ask the committee.',
  disabled: 'Your account is switched off. Ask the carnival committee to switch it back on.',
};

const UthmMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="sso-mark">
    <path d="M12 2.5 3.5 6v5.5c0 5 3.600 8.700 8.500 10 4.900-1.300 8.500-5 8.500-10V6z" />
    <path d="m8.200 12.200 2.600 2.600 5-5.200" />
  </svg>
);

export default function SsoSignIn({ next, error, triedEmail, ssoReady, personas }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const ssoHref = `/api/auth/sso${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  const wrongDomain = error === 'domain';

  useEffect(() => {
    if (wrongDomain && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [wrongDomain]);

  const closeDialog = () => {
    dialog.current?.close();
    // drop ?error=… so a refresh does not bring the pop-up back
    window.history.replaceState(null, '', next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  };

  const demo = async (persona: string) => {
    setBusy(persona);
    setDemoError(null);
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, next }),
      });
      const data = (await res.json().catch(() => null)) as { home?: string; error?: string } | null;
      if (!res.ok || !data?.home) {
        setDemoError(data?.error ?? 'Could not sign in. Try again.');
        setBusy(null);
        return;
      }
      window.location.assign(data.home);
    } catch {
      setDemoError('No connection. Check your internet and try again.');
      setBusy(null);
    }
  };

  return (
    <div className="stack sso">
      {error && !wrongDomain && MESSAGES[error] && (
        <p className="note note--warn" role="alert">
          {MESSAGES[error]}
        </p>
      )}

      {ssoReady ? (
        <a className="btn btn--go sso-btn" href={ssoHref} data-sfx="pop">
          <UthmMark />
          Sign in with UTHM SSO
        </a>
      ) : (
        <p className="note note--warn">UTHM SSO is not set up on this server yet{personas.length ? '. Use a sample account below to look around.' : '.'}</p>
      )}

      <p className="muted sso-help">
        Use your official UTHM email: <strong>@student.uthm.edu.my</strong> for students or <strong>@uthm.edu.my</strong> for staff. Your role
        (customer, seller, jury or committee) is picked up automatically.
      </p>

      {personas.length > 0 && (
        <div className="demo-box">
          <p className="demo-box-title">Demo mode: sign in as a sample person</p>
          <div className="persona-grid">
            {personas.map((p) => (
              <button key={p.id} type="button" className="persona" disabled={busy !== null} onClick={() => void demo(p.id)}>
                <strong>{busy === p.id ? 'Signing in…' : p.label}</strong>
                <span className="muted">{p.who}</span>
              </button>
            ))}
          </div>
          {demoError && (
            <p className="note note--warn" role="alert">
              {demoError}
            </p>
          )}
        </div>
      )}

      <dialog ref={dialog} className="sso-dialog" aria-labelledby="sso-dialog-title" onCancel={closeDialog}>
        <div className="sso-dialog-badge" aria-hidden="true">
          <UthmMark />
        </div>
        <h2 id="sso-dialog-title">Please use your official UTHM email</h2>
        <p className="sso-dialog-rule">
          LEED 26 only accepts <strong>@student.uthm.edu.my</strong> and <strong>@uthm.edu.my</strong> accounts.
        </p>
        <p className="sso-dialog-tried">
          <span className="sso-dialog-email">{triedEmail || 'The account you chose'}</span> is not one of them. Please retry with your UTHM account.
        </p>
        <p className="muted">When Google asks, choose your UTHM account or pick “Use another account” and sign in with your UTHM email.</p>
        <div className="sso-dialog-actions">
          <a className="btn btn--go" href={ssoHref}>
            Retry with UTHM SSO
          </a>
          <button type="button" className="btn btn--line" onClick={closeDialog}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
