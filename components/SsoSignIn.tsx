'use client';

import { useEffect, useRef, useState } from 'react';

interface Persona {
  id: string;
  label: string;
  who: string;
  username: string;
  password: string;
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

  const signIn = async (key: string, payload: Record<string, unknown>) => {
    setBusy(key);
    setDemoError(null);
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, next }),
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
  const demo = (persona: string) => signIn(persona, { persona });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const isDemo = personas.length > 0;

  return (
    <div className="stack sso">
      {error && !wrongDomain && MESSAGES[error] && (
        <p className="note note--warn" role="alert">
          {MESSAGES[error]}
        </p>
      )}

      {isDemo && (
        <form
          className="demo-login"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn('form', { username, password });
          }}
        >
          <p className="demo-box-title">Demo sign-in</p>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="e.g. admin" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button type="submit" className="btn btn--go" disabled={busy !== null}>
            {busy === 'form' ? 'Signing in…' : 'Sign in'}
          </button>
          {demoError && (
            <p className="note note--warn" role="alert">
              {demoError}
            </p>
          )}
        </form>
      )}

      {isDemo && (
        <div className="demo-box">
          <p className="demo-box-title">Or tap an account</p>
          <div className="persona-grid">
            {personas.map((p) => (
              <button key={p.id} type="button" className="persona" disabled={busy !== null} onClick={() => void demo(p.id)}>
                <strong>{busy === p.id ? 'Signing in…' : p.label}</strong>
                <span className="muted">{p.who}</span>
                <code className="persona-cred">
                  {p.username} / {p.password}
                </code>
              </button>
            ))}
          </div>
          <p className="muted demo-note">This is a demo with sample data. Changes you make may reset at any time.</p>
        </div>
      )}

      {ssoReady ? (
        <a className={`btn ${isDemo ? 'btn--line' : 'btn--go'} sso-btn`} href={ssoHref} data-sfx="pop">
          <UthmMark />
          Sign in with UTHM SSO
        </a>
      ) : (
        !isDemo && <p className="note note--warn">UTHM SSO is not set up on this server yet.</p>
      )}

      {!isDemo && (
        <p className="muted sso-help">
          Use your official UTHM email: <strong>@student.uthm.edu.my</strong> for students or <strong>@uthm.edu.my</strong> for staff. Your role
          (customer, seller, jury or committee) is picked up automatically.
        </p>
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
