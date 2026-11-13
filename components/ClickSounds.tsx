'use client';

import { useEffect, useState } from 'react';

/**
 * Click sound effects, made with the Web Audio API (no sound files to download).
 * Every button, link, tab and checkbox plays a short sound; a few actions have their own:
 * liking a stall, "not for me", saving a form, and tapping a score level.
 * Add data-sfx="pop|tick|like|nope|save|toggle|off" to any element to choose its sound.
 * The speaker button in the nav mutes everything; the choice is remembered on the device.
 */

type Sfx = 'pop' | 'tick' | 'like' | 'nope' | 'save' | 'toggle';

const KEY = 'leed26.sound';
let ctx: AudioContext | null = null;
let muted = false;

/** Turn the click sounds on or off from anywhere (the Me page on phones, the speaker button on computers). */
export function setSoundOn(on: boolean) {
  muted = !on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
  window.dispatchEvent(new CustomEvent('leed:sound', { detail: on }));
}

export function soundIsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return !muted;
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One short tone: frequency sweeps from f0 to f1, volume fades out. */
function tone(ac: AudioContext, at: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playSfx(kind: Sfx) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  switch (kind) {
    case 'pop':
      tone(ac, t, 420, 880, 0.09, 0.14);
      break;
    case 'tick':
      tone(ac, t, 1500, 1100, 0.04, 0.08, 'square');
      break;
    case 'toggle':
      tone(ac, t, 660, 990, 0.06, 0.1);
      break;
    case 'like':
      tone(ac, t, 660, 700, 0.12, 0.14, 'sine');
      tone(ac, t + 0.09, 990, 1050, 0.2, 0.14, 'sine');
      break;
    case 'nope':
      tone(ac, t, 380, 220, 0.18, 0.12);
      break;
    case 'save':
      [523, 659, 784].forEach((f, i) => tone(ac, t + i * 0.07, f, f * 1.02, 0.14, 0.12, 'sine'));
      break;
  }
}

function soundFor(target: Element): Sfx | null {
  const el = target.closest<HTMLElement>(
    '[data-sfx], a[href], button, [role="button"], [role="tab"], summary, input[type="checkbox"], input[type="radio"], select',
  );
  if (!el) return null;
  if (el.matches(':disabled, [aria-disabled="true"]')) return null;
  const chosen = el.closest<HTMLElement>('[data-sfx]')?.dataset.sfx;
  if (chosen) return chosen === 'off' ? null : (chosen as Sfx);
  if (el.matches('.vote-btn--like')) return 'like';
  if (el.matches('.vote-btn--no')) return 'nope';
  if (el.matches('.scale-opt, .scale-opt *, .seg-btn, .role-opt, [role="tab"], .tabbar-item')) return 'tick';
  if (el.matches('input[type="checkbox"], input[type="radio"]')) return 'toggle';
  if (el.matches('button[type="submit"]')) return 'save';
  return 'pop';
}

export default function ClickSounds() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    try {
      muted = localStorage.getItem(KEY) === 'off';
    } catch {
      muted = false;
    }
    setOn(!muted);

    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      // Labels forward a second click to their input; play only once.
      if (e.target.closest('label') && !(e.target instanceof HTMLInputElement) && e.target.closest('label')?.querySelector('input')) return;
      const kind = soundFor(e.target);
      if (kind) playSfx(kind);
    };
    document.addEventListener('click', onClick, true);
    const onSetting = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener('leed:sound', onSetting);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('leed:sound', onSetting);
    };
  }, []);

  const toggle = () => {
    setSoundOn(!on);
    setOn(!on);
    if (!on) playSfx('toggle');
  };

  return (
    <button
      type="button"
      className="sound-btn"
      data-sfx="off"
      aria-pressed={on}
      aria-label={on ? 'Sound effects on. Turn off' : 'Sound effects off. Turn on'}
      title={on ? 'Sound on' : 'Sound off'}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z" />
        {on ? <path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11" /> : <path d="M16 9.500l5 5M21 9.500l-5 5" />}
      </svg>
    </button>
  );
}
