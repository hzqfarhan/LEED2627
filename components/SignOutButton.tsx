'use client';

import { useState } from 'react';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';

export default function SignOutButton({ name, email, photos = [] }: { name: string; email?: string; photos?: string[] }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // Drop pages the service worker stored for this person, so the next person
      // using this phone cannot open them from the offline cache.
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.includes('pages')).map((n) => caches.delete(n)));
      }
    } finally {
      window.location.assign('/');
    }
  };

  return (
    <>
      <button type="button" className="nav-out" onClick={() => setAsking(true)} disabled={busy} title={`Signed in as ${name}`}>
        Sign out
      </button>
      <ConfirmDialog
        open={asking}
        title="Sign out of LEED 26?"
        tone="plain"
        art={
          <span className="confirm-face confirm-face--out">
            <Avatar name={name} photos={photos} size={76} />
            <span className="confirm-door" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11" />
              </svg>
            </span>
          </span>
        }
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        busy={busy}
        onConfirm={() => void signOut()}
        onCancel={() => setAsking(false)}
      >
        <p>
          You are signed in as <strong>{name}</strong>
          {email && <span className="confirm-email">{email}</span>}
        </p>
        <p className="muted">Your likes, ratings and stall work are saved. Sign back in any time with UTHM SSO.</p>
      </ConfirmDialog>
    </>
  );
}
