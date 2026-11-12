'use client';

import { useState, type FormEvent, type ReactNode } from 'react';

export type LoginRole = 'judge' | 'stall' | 'committee';

const ROLES: { id: LoginRole; label: string; icon: ReactNode }[] = [
  {
    id: 'judge',
    label: 'Judge',
    icon: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4h6v3H9zM8.500 13l2.300 2.300 4.700-4.800" />
      </>
    ),
  },
  {
    id: 'stall',
    label: 'Stall team',
    icon: (
      <>
        <path d="M4 9h16l-1.500-4h-13z" />
        <path d="M5 9v10h14V9M9 19v-5h6v5" />
      </>
    ),
  },
  {
    id: 'committee',
    label: 'Committee',
    icon: <path d="M5 7h9M18 7h1M5 12h2M11 12h8M5 17h9M18 17h1M16 5v4M9 10v4M16 15v4" />,
  },
];

interface Props {
  next: string | null;
  initialRole?: LoginRole;
  /** Shown only when the app runs without a database. */
  demoLogins?: { label: string; email: string; pin: string }[];
  demoStall?: { stall: number; pin: string } | null;
}

export default function LoginForm({ next, initialRole = 'judge', demoLogins = [], demoStall = null }: Props) {
  const [role, setRole] = useState<LoginRole>(initialRole);
  const mode = role === 'stall' ? 'stall' : 'staff';
  const [email, setEmail] = useState('');
  const [stall, setStall] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchRole = (r: LoginRole) => {
    setRole(r);
    setPin('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'stall' ? { mode: 'stall', stall: Number(stall), pin } : { email, pin }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; home?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? 'Sign-in failed. Try again.');
        setBusy(false);
        return;
      }
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      window.location.assign(mode === 'staff' && safeNext ? safeNext : (body?.home ?? '/'));
    } catch {
      setError('No connection. Check your internet and try again.');
      setBusy(false);
    }
  };

  const demo = demoLogins.length > 0 || demoStall != null;

  return (
    <form className="stack login-form" onSubmit={submit}>
      <fieldset className="role-fieldset">
        <legend>I am signing in as a</legend>
        <div className="role-pick">
          {ROLES.map((r) => (
            <button key={r.id} type="button" className="role-opt" aria-pressed={role === r.id} onClick={() => switchRole(r.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {r.icon}
              </svg>
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>

      {mode === 'staff' ? (
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" required />
        </label>
      ) : (
        <label className="field">
          <span>Stall number</span>
          <input type="text" value={stall} onChange={(e) => setStall(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={3} required />
          <small>The number on your tent in the layout.</small>
        </label>
      )}

      <label className="field">
        <span>{mode === 'staff' ? 'PIN' : 'Team PIN'}</span>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" required />
        <small>
          {mode === 'staff'
            ? role === 'judge'
              ? 'The committee gave you this PIN with your judging assignment.'
              : 'Your committee account PIN.'
            : 'The committee gives one PIN to each team. Share it only within your group.'}
        </small>
      </label>

      {error && (
        <p className="note note--bad" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn--go" disabled={busy}>
        {busy ? 'Signing in…' : role === 'judge' ? 'Sign in and start judging' : role === 'stall' ? 'Open my stall' : 'Open the admin console'}
      </button>

      {demo && (
        <div className="note note--warn">
          <p>
            <strong>Demo mode.</strong> No database is connected, so sample accounts are used and nothing is saved.
          </p>
          <div className="note-actions">
            {mode === 'staff'
              ? demoLogins
                  .filter((d) => (role === 'committee') === (d.label === 'Admin'))
                  .map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    className="btn btn--line btn--small"
                    onClick={() => {
                      setEmail(d.email);
                      setPin(d.pin);
                    }}
                  >
                    Fill in {d.label.toLowerCase()} account
                  </button>
                ))
              : demoStall && (
                  <button
                    type="button"
                    className="btn btn--line btn--small"
                    onClick={() => {
                      setStall(String(demoStall.stall));
                      setPin(demoStall.pin);
                    }}
                  >
                    Fill in stall {demoStall.stall}
                  </button>
                )}
          </div>
        </div>
      )}
    </form>
  );
}
