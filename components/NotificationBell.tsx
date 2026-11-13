'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notice } from '@/lib/shared';

const KIND_ICON: Record<string, string> = {
  payment: 'M3 7h18v12H3zM3 11h18M7 15h4',
  refund: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v8M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.4-5 1.2-5 3.6 0 1 1 1.8 2.5 1.8s2.5-.6 2.5-1.5',
  announcement: 'M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

/** The bell in the navbar: updates from the committee, with a count of unread ones. */
export default function NotificationBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const out = (await res.json()) as { items: Notice[]; unread: number };
      setItems(out.items);
      setUnread(out.unread);
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      void fetch('/api/notifications', { method: 'PATCH' }).catch(() => undefined);
    }
    if (!next) setItems((list) => list.map((n) => ({ ...n, unread: false })));
  };

  return (
    <div className="bell" ref={wrap}>
      <button type="button" className="bell-btn" aria-expanded={open} aria-haspopup="true" onClick={toggle} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9zM10 19a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <header className="bell-head">
            <strong>Notifications</strong>
            <small>From the LEED 26 committee. Stall teams also get these by email.</small>
          </header>
          {items.length === 0 ? (
            <p className="bell-empty">Nothing yet. When the committee checks your payments, changes your team or posts an announcement, it shows up here.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => {
                const inner = (
                  <>
                    <span className={`bell-icon bell-icon--${n.kind}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d={KIND_ICON[n.kind] ?? KIND_ICON.announcement} />
                      </svg>
                    </span>
                    <span className="bell-text">
                      <strong>{n.title}</strong>
                      {n.body && <span>{n.body}</span>}
                      <small>{ago(n.createdAt)}</small>
                    </span>
                    {n.unread && <span className="bell-dot" aria-label="new" />}
                  </>
                );
                return (
                  <li key={n.id} className={n.unread ? 'is-unread' : undefined}>
                    {n.link ? (
                      <Link href={n.link} className="bell-item" onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      <div className="bell-item">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
