'use client';

import { useState } from 'react';

export default function SignOutButton({ name }: { name: string }) {
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
    <button type="button" className="nav-out" onClick={signOut} disabled={busy} title={`Signed in as ${name}`}>
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
