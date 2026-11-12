// Venue layout, in metres. Shared by the 2D plan (SVG) and the 3D scene (Three.js),
// so the two views can never disagree.
//
// Source: docs/layout Khemah LEED25.pdf. Coordinates were measured off that drawing
// with one 3 m x 3 m canopy per stall.
//   x runs left to right across the drawing.
//   z runs top to bottom (the officiating tents sit at the bottom, +z).
// The drawing does not show the faculty building. It is placed along the top edge here;
// if the tents face the other way on the day, change BUILDING.z and the sign of its depth.

export type PlotKind = 'stall' | 'support' | 'official' | 'zone' | 'point';
export type Facing = 'west' | 'east' | 'north';

export interface Plot {
  key: string;
  kind: PlotKind;
  label: string;
  short?: string;
  number?: number;
  x: number; // centre
  z: number; // centre
  w: number; // size along x
  d: number; // size along z
  facing?: Facing;
}

export const TENT = 3;

const plots: Plot[] = [];

function cell(left: number, top: number, col: 0 | 1, row: number) {
  return {
    x: left + TENT / 2 + col * TENT,
    z: top + TENT / 2 + row * TENT,
    w: TENT,
    d: TENT,
    facing: (col === 0 ? 'west' : 'east') as Facing,
  };
}

function stall(n: number, left: number, top: number, col: 0 | 1, row: number) {
  plots.push({ key: `stall-${n}`, kind: 'stall', label: `Stall ${n}`, number: n, ...cell(left, top, col, row) });
}

function support(key: string, label: string, short: string, left: number, top: number, col: 0 | 1, row: number) {
  plots.push({ key, kind: 'support', label, short, ...cell(left, top, col, row) });
}

// Block A: stalls 1-16. Left column counts up from the bottom, right column back down.
for (let n = 1; n <= 8; n++) stall(n, -22, -16, 0, 8 - n);
for (let n = 9; n <= 16; n++) stall(n, -22, -16, 1, n - 9);

// Block B: stalls 17-28, six rows, set in from both ends.
for (let n = 17; n <= 22; n++) stall(n, -8.6, -13, 0, 22 - n);
for (let n = 23; n <= 28; n++) stall(n, -8.6, -13, 1, n - 23);

// Block C: stalls 29-40, with four support tents at the bottom.
for (let n = 29; n <= 34; n++) stall(n, 4.6, -16, 0, 34 - n);
for (let n = 35; n <= 40; n++) stall(n, 4.6, -16, 1, n - 35);
support('itc-1', 'ITC FSKTM tent', 'ITC', 4.6, -16, 0, 6);
support('pp', 'PP tent', 'PP', 4.6, -16, 1, 6);
support('itc-2', 'ITC FSKTM tent', 'ITC', 4.6, -16, 0, 7);
support('itc-3', 'ITC FSKTM tent', 'ITC', 4.6, -16, 1, 7);

plots.push(
  { key: 'officiating-1', kind: 'official', label: 'Officiating tent', short: 'Officiating', x: -11.45, z: 13.8, w: 6, d: 6, facing: 'north' },
  { key: 'officiating-2', kind: 'official', label: 'Officiating tent', short: 'Officiating', x: -5.45, z: 13.8, w: 6, d: 6, facing: 'north' },
  { key: 'committee', kind: 'official', label: 'Carnival committee tent', short: 'Committee', x: 0.55, z: 13.8, w: 6, d: 6, facing: 'north' },
  { key: 'refreshment-1', kind: 'official', label: 'Refreshment tent', short: 'Refreshments', x: 20, z: -0.75, w: 6, d: 6, facing: 'west' },
  { key: 'refreshment-2', kind: 'official', label: 'Refreshment tent', short: 'Refreshments', x: 20, z: 5.25, w: 6, d: 6, facing: 'west' },
  { key: 'assembly', kind: 'zone', label: 'Emergency assembly point', short: 'Emergency assembly point', x: 20.95, z: -10.7, w: 11.4, d: 10.8 },
  { key: 'oil', kind: 'point', label: 'Used cooking oil collection', short: 'Used oil', x: 21.6, z: 12.7, w: 2, d: 2 },
);

export const PLOTS: Plot[] = plots;
export const STALL_PLOTS: Plot[] = plots.filter((p) => p.kind === 'stall');
export const STALL_COUNT = STALL_PLOTS.length;

export const EXTINGUISHERS: { x: number; z: number }[] = [
  { x: -16.5, z: -17 },
  { x: -3, z: -13.8 },
  { x: 10.1, z: -17 },
  { x: -3, z: 5.9 },
  { x: -16.7, z: 8.6 },
  { x: 10.1, z: 8.6 },
  { x: 18, z: 9 },
  { x: 4.1, z: 11.4 },
];

/** Visitor walkways from the drawing (dashed arrows). Each is a polyline of [x, z] points. */
export const WALKWAYS: [number, number][][] = [
  [[-24.2, -16.5], [-24.2, 8]],
  [[-12.4, -16.5], [-12.4, 8]],
  [[0.8, -16.5], [0.8, 8]],
  [[13.2, -16.5], [13.2, 8]],
  [[-24.2, -18.7], [20, -18.7]],
  [[-24.2, 10], [25.5, 10]],
];

/** Asphalt of the parking lot. */
export const LOT = { minX: -27, maxX: 29, minZ: -21, maxZ: 19 };

/** Faculty building footprint, behind the top edge of the lot. */
export const BUILDING = { x: 1, z: -31, w: 50, d: 14, h: 13 };

export function plotForStall(n: number): Plot | undefined {
  return STALL_PLOTS.find((p) => p.number === n);
}
