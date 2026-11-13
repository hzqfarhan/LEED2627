'use client';

import type { KeyboardEvent, MouseEvent } from 'react';
import { BUILDING, CANOPIES, EXTINGUISHERS, LOT, PLOTS, WALKWAYS, canopyOf, type Plot } from '@/lib/venue';
import { CANOPY, type Stall } from '@/lib/shared';

export type StallMark = 'done' | 'queued';

interface Props {
  stalls: Stall[];
  selected?: number | null;
  onSelect?: (stallNumber: number) => void;
  /** Called when the empty map is tapped, to clear the selection. */
  onClear?: () => void;
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

const DIM = { fill: '#9DA2AB', ink: '#4A4E57' };

export default function Venue2D({ stalls, selected = null, onSelect, onClear, marks = {}, compact = false }: Props) {
  const byNumber = new Map(stalls.map((s) => [s.number, s]));
  const focus = !compact && selected != null;

  const stallNode = (p: Plot) => {
    const n = p.number!;
    const stall = byNumber.get(n);
    const isSelected = selected === n;
    const dimmed = focus && !isSelected;
    const tone = dimmed ? DIM : CANOPY[stall?.colour ?? 'none'];
    const mark = marks[n];
    const left = p.x - p.w / 2;
    const top = p.z - p.d / 2;
    const right = left + p.w;
    const bottom = top + p.d;
    const interactive = !compact && onSelect;
    const named = stall && stall.name !== `Stall ${String(n).padStart(2, '0')}` ? stall.name : null;
    const label = `Stall ${n}${named ? `, ${named}` : ''}${mark === 'done' ? ', scored' : mark === 'queued' ? ', score waiting to send' : ''}`;
    const onKey = (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(n);
      }
    };
    const i = 0.05; // hairline between the four stalls under one canopy
    const cx = p.x;
    const cz = p.z;
    // This stall is one quarter of a shared canopy roof, seen from above. The quarter is split along
    // the line from its outer corner to the canopy's peak; each half belongs to one roof face,
    // shaded as if lit from the top left.
    const can = canopyOf(p);
    const peakX = can ? can.x : cx;
    const peakZ = can ? can.z : cz;
    const ox = peakX >= cx ? left + i : right - i; // outer corner
    const oz = peakZ >= cz ? top + i : bottom - i;
    const shadeX = ox < peakX ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'; // west / east face
    const shadeZ = oz < peakZ ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)'; // north / south face
    const faces = can
      ? [
          { d: `M${ox} ${oz} L${ox} ${peakZ} L${peakX} ${peakZ}Z`, shade: shadeX },
          { d: `M${ox} ${oz} L${peakX} ${oz} L${peakX} ${peakZ}Z`, shade: shadeZ },
        ]
      : [
          { d: `M${left + i} ${top + i} L${right - i} ${top + i} L${cx} ${cz}Z`, shade: 'rgba(255,255,255,0.22)' },
          { d: `M${left + i} ${top + i} L${left + i} ${bottom - i} L${cx} ${cz}Z`, shade: 'rgba(255,255,255,0.08)' },
          { d: `M${right - i} ${top + i} L${right - i} ${bottom - i} L${cx} ${cz}Z`, shade: 'rgba(0,0,0,0.12)' },
          { d: `M${left + i} ${bottom - i} L${right - i} ${bottom - i} L${cx} ${cz}Z`, shade: 'rgba(0,0,0,0.2)' },
        ];
    const callout = named ?? `Stall ${n}`;
    const calloutW = Math.min(16, Math.max(5, callout.length * 0.62 + 1.6));
    return (
      <g
        key={p.key}
        className={`plan-stall${isSelected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}${interactive ? ' is-interactive' : ''}`}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : undefined}
        aria-pressed={interactive ? isSelected : undefined}
        onClick={interactive ? () => onSelect?.(n) : undefined}
        onKeyDown={interactive ? onKey : undefined}
      >
        <rect className="plan-shadow" x={left + i} y={top + i} width={p.w - 2 * i} height={p.d - 2 * i} rx={0.4} filter="url(#plan-soft)" />
        <g className="plan-lift">
          <rect x={left + i} y={top + i} width={p.w - 2 * i} height={p.d - 2 * i} rx={0.3} style={{ fill: tone.fill }} className="plan-canopy" />
          {faces.map((f, k) => (
            <path key={k} d={f.d} fill={f.shade} />
          ))}
          <rect x={left + i} y={top + i} width={p.w - 2 * i} height={p.d - 2 * i} rx={0.3} className="plan-edge" />
          <text x={cx + (cx - peakX) * 0.12} y={cz + (cz - peakZ) * 0.12} className="plan-number" fontSize={1.2} style={{ fill: tone.ink }} textAnchor="middle" dominantBaseline="central">
            {n}
          </text>
          {mark && (
            <g transform={`translate(${right - 0.45} ${top + 0.45}) scale(0.75)`}>
              <circle r={0.52} fill={mark === 'done' ? '#12683F' : '#23262B'} stroke="#fff" strokeWidth={0.1} />
              {mark === 'done' ? (
                <path d="M-0.24 0.02 L-0.06 0.2 L0.26 -0.16" fill="none" stroke="#fff" strokeWidth={0.13} strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M0 -0.24 V0.04 L0.18 0.16" fill="none" stroke="#fff" strokeWidth={0.12} strokeLinecap="round" />
              )}
            </g>
          )}
        </g>
        {isSelected && (
          <g className="plan-callout" aria-hidden="true">
            <rect x={cx - calloutW / 2} y={top - 4.9} width={calloutW} height={2.1} rx={1.05} />
            <path d={`M${cx - 0.55} ${top - 2.85} L${cx} ${top - 2.05} L${cx + 0.55} ${top - 2.85}Z`} />
            <text x={cx} y={top - 3.83} fontSize={1.05} textAnchor="middle" dominantBaseline="central">
              {callout.length > 24 ? `${callout.slice(0, 23)}…` : callout}
            </text>
          </g>
        )}
      </g>
    );
  };

  // The chosen stall is drawn last so it floats above its neighbours.
  const stallPlots = PLOTS.filter((p) => p.kind === 'stall').sort((a, b) => (a.number === selected ? 1 : b.number === selected ? -1 : 0));

  const onBackground = (e: MouseEvent<SVGSVGElement>) => {
    if (!onClear || compact) return;
    if (!(e.target as Element).closest('.plan-stall')) onClear();
  };

  return (
    <svg
      className={`plan${compact ? ' plan--compact' : ''}${focus ? ' has-focus' : ''}`}
      onClick={onBackground}
      viewBox={`${VIEW.x} ${VIEW.z} ${VIEW.w} ${VIEW.h}`}
      role={compact ? 'img' : 'group'}
      aria-label={compact ? 'Plan of the LEED 26 tents in the FSKTM parking lot' : 'Venue plan. Choose a stall.'}
    >
      <defs>
        <filter id="plan-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.35" />
        </filter>
        <marker id="plan-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0.5 0.5 L5.5 3 L0.5 5.5" fill="none" stroke="#FFC61A" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* faculty building */}
      <g className="plan-building-group">
        <rect x={BUILDING.x - BUILDING.w / 2} y={-27.6} width={BUILDING.w} height={4.4} rx={0.4} className="plan-building" />
        {Array.from({ length: 22 }, (_, k) => (
          <rect key={k} x={BUILDING.x - BUILDING.w / 2 + 1.2 + k * 2.18} y={-24.25} width={1.3} height={0.5} rx={0.1} className="plan-window" />
        ))}
        <rect x={BUILDING.x - 3.2} y={-28} width={6.4} height={5.6} rx={1.6} className="plan-tower" />
        <text x={BUILDING.x} y={-25.6} className="plan-building-label" fontSize={1.35} textAnchor="middle" dominantBaseline="central">
          FSKTM
        </text>
        <text x={BUILDING.x - 13} y={-25.9} className="plan-building-note" fontSize={0.95} textAnchor="middle" dominantBaseline="central">
          Faculty building
        </text>
      </g>

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

      {/* shared canopies: a shadow and a rim around each group of four pitches */}
      {CANOPIES.map((c) => (
        <rect
          key={c.key}
          x={c.x - c.w / 2 - 0.12}
          y={c.z - c.d / 2 - 0.12}
          width={c.w + 0.24}
          height={c.d + 0.24}
          rx={0.45}
          className="plan-canopy-frame"
        />
      ))}

      {/* stalls last, so the lifted stall sits on top */}
      {stallPlots.map(stallNode)}
    </svg>
  );
}
