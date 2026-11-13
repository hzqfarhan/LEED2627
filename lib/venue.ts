// Venue layout, in metres. Shared by the 2D plan (SVG) and the 3D scene (Three.js),
// so the two views can never disagree.
//
// Source: docs/layout Khemah LEED25.pdf. Coordinates were measured off that drawing.
// Each stall has a 3 m x 3 m pitch, and one 6 m x 6 m canopy covers four stalls (2 x 2).
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
  /** Key of the shared canopy over this pitch (stalls and support tents). */
  canopy?: string;
}

/** A 6 m x 6 m canopy shared by four pitches. */
export interface Canopy {
  key: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Plot keys under this canopy. */
  plots: string[];
}

export const TENT = 3;
/** Walking gap between neighbouring canopies in a block, in metres. */
export const CANOPY_GAP = 0.8;

const plots: Plot[] = [];

function cell(left: number, top: number, col: 0 | 1, row: number) {
  return {
    x: left + TENT / 2 + col * TENT,
    z: top + TENT / 2 + row * TENT + Math.floor(row / 2) * CANOPY_GAP,
    w: TENT,
    d: TENT,
    facing: (col === 0 ? 'west' : 'east') as Facing,
    // two columns x two rows share one canopy
    canopy: `canopy:${left}:${top}:${Math.floor(row / 2)}`,
  };
}

function stall(n: number, left: number, top: number, col: 0 | 1, row: number) {
  plots.push({ key: `stall-${n}`, kind: 'stall', label: `Stall ${n}`, number: n, ...cell(left, top, col, row) });
}

function support(key: string, label: string, short: string, left: number, top: number, col: 0 | 1, row: number) {
  plots.push({ key, kind: 'support', label, short, ...cell(left, top, col, row) });
}

// Block A: stalls 1-16. Left column counts up from the bottom, right column back down.
// Block tops move up by half the canopy gaps so each block stays centred where the drawing has it.
const TOP_A = -16 - (3 * CANOPY_GAP) / 2;
for (let n = 1; n <= 8; n++) stall(n, -22, TOP_A, 0, 8 - n);
for (let n = 9; n <= 16; n++) stall(n, -22, TOP_A, 1, n - 9);

// Block B: stalls 17-28, six rows, set in from both ends.
const TOP_B = -13 - (2 * CANOPY_GAP) / 2;
for (let n = 17; n <= 22; n++) stall(n, -8.6, TOP_B, 0, 22 - n);
for (let n = 23; n <= 28; n++) stall(n, -8.6, TOP_B, 1, n - 23);

// Block C: stalls 29-40, with four support tents at the bottom.
const TOP_C = -16 - (3 * CANOPY_GAP) / 2;
for (let n = 29; n <= 34; n++) stall(n, 4.6, TOP_C, 0, 34 - n);
for (let n = 35; n <= 40; n++) stall(n, 4.6, TOP_C, 1, n - 35);
support('itc-1', 'ITC FSKTM tent', 'ITC', 4.6, TOP_C, 0, 6);
support('pp', 'PP tent', 'PP', 4.6, TOP_C, 1, 6);
support('itc-2', 'ITC FSKTM tent', 'ITC', 4.6, TOP_C, 0, 7);
support('itc-3', 'ITC FSKTM tent', 'ITC', 4.6, TOP_C, 1, 7);

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

/** The shared canopies, each over four pitches. */
export const CANOPIES: Canopy[] = (() => {
  const byKey = new Map<string, Plot[]>();
  for (const p of plots) if (p.canopy) byKey.set(p.canopy, [...(byKey.get(p.canopy) ?? []), p]);
  return [...byKey.entries()].map(([key, ps]) => {
    const minX = Math.min(...ps.map((p) => p.x - p.w / 2));
    const maxX = Math.max(...ps.map((p) => p.x + p.w / 2));
    const minZ = Math.min(...ps.map((p) => p.z - p.d / 2));
    const maxZ = Math.max(...ps.map((p) => p.z + p.d / 2));
    return { key, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ, plots: ps.map((p) => p.key) };
  });
})();

const canopyByKey = new Map(CANOPIES.map((c) => [c.key, c]));
/** The canopy a plot sits under, if any. */
export function canopyOf(p: Plot): Canopy | undefined {
  return p.canopy ? canopyByKey.get(p.canopy) : undefined;
}
export const STALL_PLOTS: Plot[] = plots.filter((p) => p.kind === 'stall');
export const STALL_COUNT = STALL_PLOTS.length;

export const EXTINGUISHERS: { x: number; z: number }[] = [
  { x: -16.5, z: -18.2 },
  { x: -3, z: -14.6 },
  { x: 10.1, z: -18.2 },
  { x: -3, z: 6.7 },
  { x: -16.7, z: 9.8 },
  { x: 10.1, z: 9.8 },
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

/**
 * The FSKTM building as a 3D model. Put the exported file at public/models/fsktm.glb
 * (Blender: File > Export > glTF 2.0, format "glTF Binary (.glb)", +Y up).
 * If the file is missing the 3D view keeps the simple stand-in building.
 *
 * fit:       'building' scales the model so its width matches BUILDING.w;
 *            'none' keeps the model's own size (use this if it was modelled in metres).
 * rotationY: turn the model (degrees) so its front faces the parking lot (towards +z).
 * offset:    nudge the model in metres after it is placed, [x, y, z].
 * replacesLot: true if the model already contains the ground, roads and car park,
 *            so the drawn asphalt, bays and trees are hidden and only the tents remain.
 */
export const BUILDING_MODEL = {
  url: '/models/fsktm.glb',
  // fsktm.glb was converted from docs/HusseinVerse-FSKTM.blend at real size (metres),
  // with the faculty's front (tower, flagpoles, roundabout) facing the parking lot.
  fit: 'none' as 'building' | 'none',
  rotationY: 0,
  offset: [0, 0, 0] as [number, number, number],
  replacesLot: false,
};

export function plotForStall(n: number): Plot | undefined {
  return STALL_PLOTS.find((p) => p.number === n);
}
