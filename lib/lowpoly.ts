// Low-poly models for page headers, described once as plain triangles.
// The same data is drawn two ways:
//   - as real 3D with Three.js on capable devices (components/LowPoly3D.tsx), and
//   - as a flat, faceted SVG picture everywhere else (renderLowPolySvg below),
// so phones that cannot (or should not) run WebGL still see the same object.

export type V3 = [number, number, number];

export interface Part {
  /** Triangles: every 3 points make one face, wound counter-clockwise from outside. */
  tris: V3[];
  color: string;
}

export type LowPolyKind = 'tent' | 'shop' | 'trophy' | 'clipboard' | 'pin' | 'polaroid' | 'badge' | 'console' | 'ticket';

export const BRAND = {
  ink: '#1f0a45',
  grape: '#2b0b5e',
  violet: '#5a12a8',
  yellow: '#ffd91a',
  pink: '#ff1a9a',
  rose: '#f27bae',
  mint: '#1fefd0',
  blue: '#3f86e6',
  green: '#35a772',
  red: '#e2493f',
  cream: '#fbf6e6',
  white: '#ffffff',
};

// ---------------------------------------------------------------------------
// Primitives (all centred on the origin, y up)
// ---------------------------------------------------------------------------

function ring(r: number, y: number, n: number, phase = 0): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
  });
}

/** A frustum (cylinder when rTop = rBottom, cone when rTop = 0). */
export function frustum(rBottom: number, rTop: number, h: number, n: number, phase = 0, caps = true): V3[] {
  const b = ring(rBottom, -h / 2, n, phase);
  const t = ring(rTop, h / 2, n, phase);
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (rTop > 0) out.push(b[i], t[j], b[j], b[i], t[i], t[j]);
    else out.push(b[i], [0, h / 2, 0], b[j]);
    if (caps) out.push([0, -h / 2, 0], b[i], b[j]);
    if (caps && rTop > 0) out.push([0, h / 2, 0], t[j], t[i]);
  }
  return out;
}

export function box(w: number, h: number, d: number): V3[] {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const p: V3[] = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  const q = (a: number, b: number, c: number, d2: number): V3[] => [p[a], p[b], p[c], p[a], p[c], p[d2]];
  return [...q(4, 5, 6, 7), ...q(1, 0, 3, 2), ...q(5, 1, 2, 6), ...q(0, 4, 7, 3), ...q(7, 6, 2, 3), ...q(0, 1, 5, 4)];
}

/** Icosahedron: the classic low-poly ball. */
export function ico(r: number): V3[] {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([a, b, c]) => {
    const l = Math.hypot(a, b, c);
    return [(a / l) * r, (b / l) * r, (c / l) * r] as V3;
  });
  const f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return f.flatMap(([a, b, c]) => [v[a], v[b], v[c]]);
}

export function octa(r: number): V3[] {
  const v: V3[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const f = [[2, 4, 0], [2, 0, 5], [2, 5, 1], [2, 1, 4], [3, 0, 4], [3, 5, 0], [3, 1, 5], [3, 4, 1]];
  return f.flatMap(([a, b, c]) => [v[a], v[b], v[c]]);
}

/** A flat five-point star with some thickness. */
export function star(r: number, depth: number): V3[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([Math.cos(a) * rr, -Math.sin(a) * rr]);
  }
  const out: V3[] = [];
  const z = depth / 2;
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 10];
    out.push([0, 0, z * 1.8], [ax, ay, z], [bx, by, z]);
    out.push([0, 0, -z * 1.8], [bx, by, -z], [ax, ay, -z]);
    out.push([ax, ay, z], [ax, ay, -z], [bx, by, -z], [ax, ay, z], [bx, by, -z], [bx, by, z]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export const move = (t: V3[], x: number, y: number, z: number): V3[] => t.map(([a, b, c]) => [a + x, b + y, c + z]);
export const scale = (t: V3[], s: number, sy = s, sz = s): V3[] => t.map(([a, b, c]) => [a * s, b * sy, c * sz]);
export function rotY(t: V3[], ang: number): V3[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return t.map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
}
export function rotX(t: V3[], ang: number): V3[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return t.map(([x, y, z]) => [x, y * c - z * s, y * s + z * c]);
}
export function rotZ(t: V3[], ang: number): V3[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return t.map(([x, y, z]) => [x * c - y * s, x * s + y * c, z]);
}

const part = (tris: V3[], color: string): Part => ({ tris, color });

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

function canopy(roof: string, stripe: string): Part[] {
  const parts: Part[] = [];
  // four-sided roof, alternating stripes
  const roofTris = frustum(1.25, 0, 0.62, 4, Math.PI / 4, false);
  for (let i = 0; i < 4; i++) parts.push(part(move(roofTris.slice(i * 3, i * 3 + 3), 0, 1.31, 0), i % 2 ? stripe : roof));
  // scalloped valance under the roof edge
  const val = move(frustum(0.9, 0.9, 0.2, 4, Math.PI / 4, false), 0, 0.9, 0);
  parts.push(part(val, stripe));
  // legs
  for (const [x, z] of [[-0.78, -0.78], [0.78, -0.78], [0.78, 0.78], [-0.78, 0.78]] as const) parts.push(part(move(frustum(0.05, 0.05, 1.6, 5), x, 0.0, z), BRAND.ink));
  return parts;
}

function sparkles(): Part[] {
  return [
    part(move(octa(0.16), -1.35, 1.35, 0.3), BRAND.mint),
    part(move(octa(0.12), 1.4, 1.75, -0.2), BRAND.yellow),
    part(move(octa(0.1), 1.25, -0.45, 0.6), BRAND.pink),
  ];
}

export function model(kind: LowPolyKind): Part[] {
  switch (kind) {
    case 'tent':
      return [
        ...canopy(BRAND.pink, BRAND.white),
        part(move(box(1.3, 0.55, 0.6), 0, -0.5, 0.15), BRAND.yellow),
        part(move(box(1.36, 0.08, 0.66), 0, -0.2, 0.15), BRAND.ink),
        part(move(frustum(0.7, 0.7, 0.06, 7), 0, -0.82, 0), BRAND.violet),
        ...sparkles(),
      ];
    case 'shop':
      return [
        ...canopy(BRAND.yellow, BRAND.pink),
        part(move(box(1.3, 0.55, 0.6), 0, -0.5, 0.15), BRAND.white),
        part(move(ico(0.16), -0.35, -0.08, 0.2), BRAND.red),
        part(move(frustum(0.13, 0.1, 0.3, 6), 0.05, -0.06, 0.2), BRAND.mint),
        part(move(box(0.32, 0.18, 0.22), 0.42, -0.13, 0.2), BRAND.rose),
        part(move(frustum(0.7, 0.7, 0.06, 7), 0, -0.82, 0), BRAND.violet),
        part(move(rotZ(star(0.22, 0.08), 0.2), 0, 1.92, 0), BRAND.yellow),
        ...sparkles().slice(0, 2),
      ];
    case 'trophy': {
      // C-shaped handles made of three short bars each
      const handle = (side: number): Part[] =>
        [-0.5, 0, 0.5].map((a) => part(move(rotZ(box(0.1, 0.24, 0.1), side * a), side * (0.66 + Math.cos(a) * 0.12), 0.78 - Math.sin(a) * 0.22 * side * side, 0), BRAND.yellow));
      return [
        part(move(frustum(0.28, 0.66, 0.85, 8), 0, 0.72, 0), BRAND.yellow),
        part(move(frustum(0.66, 0.66, 0.06, 8), 0, 1.16, 0), '#f2b100'),
        ...handle(1),
        ...handle(-1),
        part(move(frustum(0.08, 0.12, 0.42, 6), 0, 0.08, 0), BRAND.yellow),
        part(move(box(0.8, 0.32, 0.5), 0, -0.28, 0), BRAND.violet),
        part(move(box(0.95, 0.12, 0.6), 0, -0.5, 0), BRAND.ink),
        part(move(rotZ(star(0.26, 0.1), 0.15), 0, 1.68, 0), BRAND.pink),
        ...sparkles(),
      ];
    }
    case 'clipboard':
      return [
        part(rotX(box(1.35, 1.75, 0.12), -0.22), BRAND.violet),
        part(move(rotX(box(1.1, 1.4, 0.04), -0.22), 0, -0.08, 0.08), BRAND.white),
        part(move(rotX(box(0.55, 0.22, 0.18), -0.22), 0, 0.86, 0.02), BRAND.yellow),
        ...[0.38, 0.02, -0.34].flatMap((y, i) => [
          part(move(rotX(box(0.14, 0.14, 0.06), -0.22), -0.35, y, 0.15 - y * 0.2), i < 2 ? BRAND.green : '#d8ceea'),
          part(move(rotX(box(0.52, 0.07, 0.05), -0.22), 0.17, y, 0.15 - y * 0.2), '#bdb0d9'),
        ]),
        part(move(rotZ(frustum(0.05, 0, 0.3, 6), -0.6), 0.75, -0.55, 0.35), BRAND.ink),
        part(move(rotZ(frustum(0.06, 0.06, 0.9, 6), -0.6), 0.42, -0.08, 0.35), BRAND.pink),
        ...sparkles(),
      ];
    case 'pin':
      return [
        part(move(ico(0.62), 0, 0.95, 0), BRAND.pink),
        part(move(rotX(frustum(0.42, 0, 1.0, 7), Math.PI), 0, 0.28, 0), BRAND.pink),
        part(move(ico(0.24), 0, 1.0, 0.45), BRAND.white),
        part(move(frustum(0.85, 0.85, 0.05, 9), 0, -0.25, 0), BRAND.mint),
        part(move(frustum(0.5, 0.5, 0.07, 9), 0, -0.2, 0), BRAND.green),
        ...sparkles(),
      ];
    case 'polaroid':
      return [
        part(move(rotZ(box(1.2, 1.4, 0.06), 0.22), 0.35, 0.2, -0.3), BRAND.white),
        part(move(rotZ(box(1.0, 0.9, 0.04), 0.22), 0.3, 0.38, -0.25), BRAND.blue),
        part(move(rotZ(box(1.2, 1.4, 0.06), -0.14), -0.2, 0, 0.1), BRAND.white),
        part(move(rotZ(box(1.0, 0.9, 0.04), -0.14), -0.17, 0.18, 0.15), BRAND.mint),
        part(move(rotZ(frustum(0.3, 0, 0.32, 4, Math.PI / 4), -0.14), -0.05, 0.12, 0.19), BRAND.green),
        part(move(ico(0.1), -0.45, 0.38, 0.19), BRAND.yellow),
        part(move(ico(0.13), -0.27, 0.72, 0.22), BRAND.red),
        ...sparkles(),
      ];
    case 'badge':
      return [
        part(move(rotX(frustum(0.85, 0.85, 0.16, 8, Math.PI / 8), Math.PI / 2), 0, 0.35, 0), BRAND.yellow),
        part(move(rotX(frustum(0.68, 0.68, 0.06, 8, Math.PI / 8), Math.PI / 2), 0, 0.35, 0.09), BRAND.violet),
        part(move(ico(0.22), 0, 0.52, 0.2), BRAND.cream),
        part(move(frustum(0.32, 0.18, 0.28, 6), 0, 0.12, 0.18), BRAND.cream),
        part(move(rotZ(box(0.22, 0.8, 0.05), 0.35), -0.25, -0.65, -0.05), BRAND.pink),
        part(move(rotZ(box(0.22, 0.8, 0.05), -0.35), 0.25, -0.65, -0.05), BRAND.blue),
        part(move(rotZ(star(0.2, 0.08), 0.2), 0.72, 1.05, 0.1), BRAND.mint),
        ...sparkles().slice(1),
      ];
    case 'console':
      return [
        part(move(box(1.7, 0.1, 1.2), 0, -0.6, 0), BRAND.violet),
        part(move(box(0.32, 0.6, 0.32), -0.55, -0.25, 0.1), BRAND.mint),
        part(move(box(0.32, 1.05, 0.32), -0.1, -0.02, 0.1), BRAND.pink),
        part(move(box(0.32, 1.45, 0.32), 0.35, 0.18, 0.1), BRAND.yellow),
        part(move(rotZ(star(0.24, 0.1), 0.2), 0.35, 1.18, 0.1), BRAND.yellow),
        part(move(rotX(frustum(0.32, 0.32, 0.14, 8), Math.PI / 2), -0.62, 0.72, -0.2), BRAND.blue),
        part(move(rotX(frustum(0.14, 0.14, 0.16, 8), Math.PI / 2), -0.62, 0.72, -0.12), BRAND.white),
        ...sparkles().slice(0, 2),
      ];
    case 'ticket':
      return [
        part(rotZ(box(1.7, 0.9, 0.08), 0.18), BRAND.yellow),
        part(move(rotZ(box(0.06, 0.9, 0.1), 0.18), 0.35, 0.06, 0), BRAND.ink),
        part(move(rotZ(star(0.22, 0.08), 0.18), -0.3, -0.05, 0.08), BRAND.pink),
        part(move(rotZ(box(0.3, 0.08, 0.1), 0.18), 0.68, 0.18, 0.05), BRAND.violet),
        part(move(rotZ(box(0.3, 0.08, 0.1), 0.18), 0.64, -0.02, 0.05), BRAND.violet),
        ...sparkles(),
      ];
  }
}

/**
 * Every part is convex, so a face points outwards when it points away from the part's centre.
 * Re-wind any triangle that does not, so normals and back-face culling are always right.
 */
export function outward(tris: V3[]): V3[] {
  const c: V3 = [0, 0, 0];
  for (const v of tris) {
    c[0] += v[0];
    c[1] += v[1];
    c[2] += v[2];
  }
  c[0] /= tris.length;
  c[1] /= tris.length;
  c[2] /= tris.length;
  const out: V3[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, d] = [tris[i], tris[i + 1], tris[i + 2]];
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m: V3 = [(a[0] + b[0] + d[0]) / 3 - c[0], (a[1] + b[1] + d[1]) / 3 - c[1], (a[2] + b[2] + d[2]) / 3 - c[2]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) out.push(a, d, b);
    else out.push(a, b, d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flat SVG rendering (the fallback, and what the server sends first)
// ---------------------------------------------------------------------------

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

const LIGHT: V3 = (() => {
  const l: V3 = [-0.45, 0.75, 0.55];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/** Draw a model as faceted polygons, seen from a fixed angle. Returns SVG polygon markup data. */
export function renderLowPolySvg(kind: LowPolyKind, yaw = -0.6, pitch = 0.32, size = 240): { points: string; fill: string }[] {
  const faces: { pts: V3[]; color: string; depth: number }[] = [];
  for (const p of model(kind)) {
    const t = rotX(rotY(outward(p.tris), yaw), pitch);
    for (let i = 0; i < t.length; i += 3) faces.push({ pts: [t[i], t[i + 1], t[i + 2]], color: p.color, depth: 0 });
  }
  const s = size / 4.4;
  const out: { points: string; fill: string; depth: number }[] = [];
  for (const f of faces) {
    const [a, b, c] = f.pts;
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    // facing the viewer (+z)?
    if (n[2] / len < -0.02) continue;
    const lambert = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len);
    const k = 0.55 + lambert * 0.6;
    out.push({
      points: f.pts.map(([x, y]) => `${(size / 2 + x * s).toFixed(1)},${(size * 0.56 - y * s).toFixed(1)}`).join(' '),
      fill: shade(f.color, k),
      depth: (a[2] + b[2] + c[2]) / 3,
    });
  }
  return out.sort((p, q) => p.depth - q.depth).map(({ points, fill }) => ({ points, fill }));
}
