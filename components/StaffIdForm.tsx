'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function StaffIdForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const staffId = String(new FormData(e.currentTarget).get('staffId') ?? '');
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId }) }).catch(() => null);
    setBusy(false);
    setMsg(res?.ok ? 'Saved.' : 'Could not save. Use letters and numbers only.');
    if (res?.ok) router.refresh();
  };

  return (
    <form className="add-member" onSubmit={save}>
      <label className="field">
        <span>Staff ID</span>
        <input name="staffId" defaultValue={current ?? ''} maxLength={12} pattern="[A-Za-z0-9]{2,12}" placeholder="e.g. 01234" />
      </label>
      <button type="submit" className="btn btn--go btn--small" disabled={busy}>
        Save
      </button>
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
