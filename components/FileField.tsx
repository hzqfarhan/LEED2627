'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** A file already on the server, to preview before the person chooses a new one. */
export interface CurrentFile {
  url: string;
  type: string;
  name: string | null;
}

interface Props {
  name: string;
  label: string;
  accept?: string;
  /** Required only when nothing is on file yet. */
  required?: boolean;
  current?: CurrentFile | null;
  /** Largest file in bytes; bigger files are refused before upload. */
  maxBytes?: number;
  hint?: string;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * A file input that shows what was attached: a thumbnail for photos, a card for PDFs. The person can
 * open it, replace it or remove it before sending. When a file is already on the server, that one is
 * shown until they choose a new one.
 */
export default function FileField({ name, label, accept = 'image/jpeg,image/png,image/webp,application/pdf', required, current, maxBytes = 5 * 1024 * 1024, hint }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = () => input.current?.click();
  const clear = () => {
    if (input.current) input.current.value = '';
    setFile(null);
    setError(null);
  };

  const shown = file
    ? { url: url ?? '', type: file.type, name: file.name, size: file.size, isNew: true }
    : current
      ? { url: current.url, type: current.type, name: current.name, size: null, isNew: false }
      : null;
  const isImage = shown?.type.startsWith('image/');

  return (
    <div className="ff">
      <span className="ff-label" id={`${id}-label`}>
        {label}
      </span>
      <input
        ref={input}
        id={id}
        className="ff-input"
        type="file"
        name={name}
        accept={accept}
        required={required && !current}
        aria-labelledby={`${id}-label`}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && f.size > maxBytes) {
            e.target.value = '';
            setFile(null);
            setError(`${f.name} is ${kb(f.size)}. Choose a file under ${kb(maxBytes)}.`);
            return;
          }
          setError(null);
          setFile(f);
        }}
      />

      {!shown ? (
        <button type="button" className="ff-drop" onClick={pick}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span>
            <strong>Choose a photo or PDF</strong>
            <small>{hint ?? `Up to ${kb(maxBytes)}`}</small>
          </span>
        </button>
      ) : (
        <div className={`ff-card${shown.isNew ? ' is-new' : ''}`}>
          <a className="ff-thumb" href={shown.url} target="_blank" rel="noreferrer" aria-label={`Open ${shown.name ?? 'file'}`}>
            {isImage && shown.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown.url} alt="" />
            ) : (
              <span className="ff-pdf" aria-hidden="true">
                PDF
              </span>
            )}
          </a>
          <div className="ff-meta">
            <strong title={shown.name ?? undefined}>{shown.name ?? (isImage ? 'Photo' : 'PDF document')}</strong>
            <small>
              {shown.isNew ? `New, ${shown.size != null ? kb(shown.size) : ''}. Sent when you submit.` : 'On file'}
            </small>
            <div className="ff-actions">
              <a className="ff-btn" href={shown.url} target="_blank" rel="noreferrer">
                Open
              </a>
              <button type="button" className="ff-btn" onClick={pick}>
                Replace
              </button>
              {shown.isNew && (
                <button type="button" className="ff-btn ff-btn--quiet" onClick={clear}>
                  {current ? 'Keep the one on file' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="ff-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
