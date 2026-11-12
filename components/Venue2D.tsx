'use client';

import type { KeyboardEvent } from 'react';
import { BUILDING, EXTINGUISHERS, LOT, PLOTS, WALKWAYS, type Plot } from '@/lib/venue';
import { CANOPY, type Stall } from '@/lib/shared';

export type StallMark = 'done' | 'queued';

interface Props {
  stalls: Stall[];
  selected?: number | null;
  onSelect?: (stallNumber: number) => void;
  marks?: Record<number, StallMark>;
  /** Decorative, non-interactive version (used on the home page). */
  compact?: boolean;
}

const VIEW = { x: -28.5, z: -28, w: 59, h: 48.5 };

function wrap(label: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of label.split(' ')) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function Label({ x, z, text, size, maxChars, className }: { x: number; z: number; text: string; size: number; maxChars: number; className: string }) {
  const lines = wrap(text, maxChars);
  const start = z - ((lines.length - 1) * size * 1.15) / 2;
  return (
    <text x={x} y={start} className={className} fontSize={size} textAnchor="middle" dominantBaseline="central">
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size * 1.15}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function bayTicks(): { x1: number; z1: number; x2: number; z2: number }[] {
  // Painted parking bay lines along the top and bottom edges of the lot.
  const out: { x1: number; z1: number; x2: number; z2: number }[] = [];
  for (let x = LOT.minX + 2.5; x < LOT.maxX - 1; x += 2.5) {
    out.push({ x1: x, z1: LOT.minZ + 0.2, x2: x, z2: LOT.minZ + 1.6 });
    if (x < -15.5 || x > 4.5) out.push({ x1: x, z1: LOT.maxZ - 1.6, x2: x, z2: LOT.maxZ - 0.2 });
  }
  return out;
}

export default function Venue2D({ stalls, selected = null, onSelect, marks = {}, compact = false }: Props) {
  const byNumber = new Map(stalls.map((s) => [s.number, s]));

  const stallNode = (p: Plot) => {
    const n = p.number!;
    const stall = byNumber.get(n);
    const tone = CANOPY[stall?.colour ?? 'none'];
    const isSelected = selected === n;
    const mark = marks[n];
    const left = p.x - p.w / 2;
    const top = p.z - p.d / 2;
    const interactive = !compact && onSelect;
    const label = `Stall ${n}${stall && stall.name !== `Stall ${String(n).padStart(2, '0')}` ? `, ${stall.name}` : ''}${
      mark === 'done' ? ', scored' : mark === 'queued' ? ', score waiting to send' : ''
    }`;
    const onKey = (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(n);
      }
    };
    return (
      <g
        key={p.key}
        className={`plan-stall${isSelected ? ' is-selected' : ''}${interactive ? ' is-interactive' : ''}`}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : undefined}
        aria-pressed={interactive ? isSelected : undefined}
        onClick={interactive ? () => onSelect?.(n) : undefined}
        onKeyDown={interactive ? onKey : undefined}
      >
        <rect x={left + 0.12} y={top + 0.12} width={p.w - 0.24} height={p.d - 0.24} rx={0.35} fill={tone.fill} />
        {/* canopy ridge lines, so each square reads as a tent seen from above */}
        <path
          d={`M${left + 0.3} ${top + 0.3} L${left + p.w - 0.3} ${top + p.d - 0.3} M${left + p.w - 0.3} ${top + 0.3} L${left + 0.3} ${top + p.d - 0.3}`}
          stroke={tone.ink}
          strokeOpacity={0.14}
          strokeWidth={0.07}
        />
        <text x={p.x} y={p.z} className="plan-number" fontSize={1.25} fill={tone.ink} textAnchor="middle" dominantBaseline="central">
          {n}
        </text>
        {mark && (
          <g transform={`translate(${left + p.w - 0.5} ${top + 0.5}) scale(0.8)`}>
            <circle r={0.52} fill={mark === 'done' ? '#12683F' : '#23262B'} stroke="#fff" strokeWidth={0.1} />
            {mark === 'done' ? (
              <path d="M-0.24 0.02 L-0.06 0.2 L0.26 -0.16" fill="none" stroke="#fff" strokeWidth={0.13} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M0 -0.24 V0.04 L0.18 0.16" fill="none" stroke="#fff" strokeWidth={0.12} strokeLinecap="round" />
            )}
          </g>
        )}
        {isSelected && <rect x={left - 0.1} y={top - 0.1} width={p.w + 0.2} height={p.d + 0.2} rx={0.5} className="plan-ring" />}
      </g>
    );
  };

  return (
    <svg
      className={`plan${compact ? ' plan--compact' : ''}`}
      viewBox={`${VIEW.x} ${VIEW.z} ${VIEW.w} ${VIEW.h}`}
      role={compact ? 'img' : 'group'}
      aria-label={compact ? 'Plan of the LEED 26 tents in the FSKTM parking lot' : 'Venue plan. Choose a stall.'}
    >
      <defs>
        <marker id="plan-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0.5 0.5 L5.5 3 L0.5 5.5" fill="none" stroke="#FFC61A" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* faculty building */}
      <rect x={BUILDING.x - BUILDING.w / 2} y={-27.3} width={BUILDING.w} height={4.6} rx={0.4} className="plan-building" />
      <text x={BUILDING.x} y={-25} className="plan-building-label" fontSize={1.5} textAnchor="middle" dominantBaseline="central">
        FSKTM building
      </text>

      {/* parking lot */}
      <rect x={LOT.minX} y={LOT.minZ} width={LOT.maxX - LOT.minX} height={LOT.maxZ - LOT.minZ} rx={0.8} className="plan-lot" />
      {bayTicks().map((t, i) => (
        <line key={i} x1={t.x1} y1={t.z1} x2={t.x2} y2={t.z2} className="plan-bay" />
      ))}

      {/* walkways */}
      {WALKWAYS.map((w, i) => (
        <polyline key={i} points={w.map(([x, z]) => `${x},${z}`).join(' ')} className="plan-walk" markerEnd="url(#plan-arrow)" />
      ))}

      {/* zones, official and support tents */}
      {PLOTS.filter((p) => p.kind !== 'stall').map((p) => {
        const left = p.x - p.w / 2;
        const top = p.z - p.d / 2;
        if (p.kind === 'zone') {
          return (
            <g key={p.key}>
              <rect x={left} y={top} width={p.w} height={p.d} rx={0.5} className="plan-zone" />
              <Label x={p.x} z={p.z} text={p.label} size={1.25} maxChars={11} className="plan-zone-label" />
            </g>
          );
        }
        if (p.kind === 'point') {
          return (
            <g key={p.key}>
              <circle cx={p.x} cy={p.z} r={0.9} className="plan-point" />
              {!compact && <Label x={p.x} z={p.z + 2.4} text={p.label} size={0.95} maxChars={16} className="plan-note" />}
            </g>
          );
        }
        return (
          <g key={p.key}>
            <rect x={left + 0.12} y={top + 0.12} width={p.w - 0.24} height={p.d - 0.24} rx={0.35} className={`plan-tent plan-tent--${p.kind}`} />
            <Label x={p.x} z={p.z} text={p.short ?? p.label} size={p.kind === 'support' ? 0.9 : 0.78} maxChars={12} className="plan-tent-label" />
          </g>
        );
      })}

      {/* fire extinguishers */}
      {!compact &&
        EXTINGUISHERS.map((e, i) => (
          <g key={i} transform={`translate(${e.x} ${e.z})`}>
            <rect x={-0.28} y={-0.5} width={0.56} height={1} rx={0.2} className="plan-ext" />
          </g>
        ))}

      {/* stalls last, so focus rings sit on top */}
      {PLOTS.filter((p) => p.kind === 'stall').map(stallNode)}
    </svg>
  );
}
