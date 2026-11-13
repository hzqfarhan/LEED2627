'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  /** Picture at the top, e.g. the person's photo. */
  art?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red, for things that remove or end something. */
  tone?: 'danger' | 'plain';
  busy?: boolean;
  /** Keep the confirm button off until the person has done something (e.g. typed a word). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small "are you sure?" pop-up. The safe choice gets the focus, so Enter never removes anything by accident. */
export default function ConfirmDialog({ open, title, art, children, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', busy, confirmDisabled, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      keep.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sso-dialog confirm confirm--${tone}`}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel();
      }}
    >
      {art && <div className="confirm-art">{art}</div>}
      <h2 id="confirm-title">{title}</h2>
      {children && <div className="confirm-body">{children}</div>}
      <div className="confirm-actions">
        <button ref={keep} type="button" className="btn btn--line" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--dark'}`} onClick={onConfirm} disabled={busy || confirmDisabled} data-sfx={tone === 'danger' ? 'nope' : undefined}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
