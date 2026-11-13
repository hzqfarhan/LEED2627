'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import type { Role } from '@/lib/shared';

interface Who {
  name: string;
  shortName: string;
  email: string;
  photos: string[];
  role: Role;
  stall: number | null;
  isLeader: boolean;
}

const COOKIE = 'leed_welcome';
const COLOURS = ['#ffd91a', '#ff1a9a', '#1fefd0', '#7a35e0', '#3F86E6', '#ffffff', '#F27BAE'];

const ROLE_TEXT: Record<Role, string> = {
  customer: 'You can like and rate every stall you visit.',
  seller: 'Your stall desk is ready: team, poster and videos.',
  judge: 'Your score sheets are ready for your allocated stalls.',
  admin: 'The admin console is ready.',
};

/** Paper confetti from both bottom corners, drawn on one canvas, gone after about three seconds. */
function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  // Put the confetti in the browser's top layer (above the pop-up) where supported.
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.appendChild(canvas);
  document.body.appendChild(layer);
  const top = 'showPopover' in layer;
  if (top) {
    layer.setAttribute('popover', 'manual');
    (layer as HTMLElement & { showPopover: () => void }).showPopover();
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean };
  const parts: P[] = [];
  const burst = (x: number, dir: number) => {
    for (let i = 0; i < 90; i++) {
      const a = (-Math.PI / 2) + dir * (Math.random() * 0.75 + 0.1);
      const sp = 9 + Math.random() * 10;
      parts.push({ x, y: H + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 1.35, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, c: COLOURS[i % COLOURS.length], round: Math.random() < 0.25 });
    }
  };
  burst(W * 0.08, 1);
  burst(W * 0.92, -1);
  const start = performance.now();
  const step = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2200) / 900);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      ctx.restore();
    }
    if (age < 3200) requestAnimationFrame(step);
    else layer.remove();
  };
  requestAnimationFrame(step);
}

/** "You're signed in" pop-up with confetti, shown once right after UTHM SSO sign-in. */
export default function WelcomePop({ who }: { who: Who }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!document.cookie.split('; ').some((c) => c === `${COOKIE}=1`)) return;
    document.cookie = `${COOKIE}=; Max-Age=0; path=/`;
    setOpen(true);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    if (!d.open) d.showModal();
    confetti();
    const t = window.setTimeout(() => setOpen(false), 6000);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  const role = who.role === 'seller' && who.stall != null ? `Seller, stall ${who.stall}${who.isLeader ? ' (leader)' : ''}` : { customer: 'Customer', seller: 'Seller', judge: 'Jury', admin: 'Committee' }[who.role];

  return (
    <dialog ref={ref} className="sso-dialog welcome" aria-labelledby="welcome-title" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)}>
      <span className="welcome-face">
        <Avatar name={who.name} photos={who.photos} size={92} />
        <span className="welcome-check" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
      </span>
      <p className="welcome-kicker">Signed in with UTHM SSO</p>
      <h2 id="welcome-title">Welcome, {who.shortName}!</h2>
      <p className="welcome-email">{who.email}</p>
      <span className="welcome-role">{role}</span>
      <p className="muted">{ROLE_TEXT[who.role]}</p>
      <button type="button" className="btn btn--go welcome-go" onClick={() => setOpen(false)} autoFocus>
        Let’s go
      </button>
    </dialog>
  );
}
