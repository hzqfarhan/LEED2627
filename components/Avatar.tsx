'use client';

import { useState } from 'react';

interface Props {
  name: string | null;
  /** Photo URLs, best first. Each is tried in turn; initials show if none loads. */
  photos: string[];
  size?: number;
  className?: string;
}

function initials(name: string | null): string {
  const parts = (name ?? '').replace(/\b(bin|binti|bt|bte|a\/l|a\/p|dr|prof|madya|ts)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** A round profile photo with initials as the last fallback. */
export default function Avatar({ name, photos, size = 36, className }: Props) {
  const [i, setI] = useState(0);
  const src = photos[i];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (!src) {
    return (
      <span className={`avatar avatar--initials${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`avatar${className ? ` ${className}` : ''}`}
      style={style}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setI((n) => n + 1)}
    />
  );
}
