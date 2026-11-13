'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BUILDING, BUILDING_MODEL, EXTINGUISHERS, LOT, PLOTS, canopyOf, type Facing, type Plot } from '@/lib/venue';
import { CANOPY, type Stall } from '@/lib/shared';
import type { StallMark } from './Venue2D';

interface Props {
  stalls: Stall[];
  selected: number | null;
  onSelect: (stallNumber: number) => void;
  /** Called when empty ground is tapped, to clear the selection. */
  onClear?: () => void;
  marks?: Record<number, StallMark>;
  /** Called when WebGL cannot start, so the parent can fall back to the 2D plan. */
  onUnavailable?: () => void;
}

interface SceneApi {
  select: (n: number | null, fly: boolean) => void;
  paintSigns: (marks: Record<number, StallMark>, selected: number | null) => void;
  dispose: () => void;
}

const LEG_H = 2.3;
const VALANCE_H = 0.35;

function makeLabel(lines: string[], opts: { w: number; h: number; bg: string; fg: string; font: number; radius?: number }): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = opts.w;
  canvas.height = opts.h;
  const ctx = canvas.getContext('2d')!;
  const r = opts.radius ?? 18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(opts.w, 0, opts.w, opts.h, r);
  ctx.arcTo(opts.w, opts.h, 0, opts.h, r);
  ctx.arcTo(0, opts.h, 0, 0, r);
  ctx.arcTo(0, 0, opts.w, 0, r);
  ctx.closePath();
  ctx.fillStyle = opts.bg;
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.font = `700 ${opts.font}px "Bricolage Grotesque", "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineH = opts.font * 1.12;
  const startY = opts.h / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, opts.w / 2, startY + i * lineH));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildScene(
  host: HTMLDivElement,
  stalls: Stall[],
  onSelect: (n: number) => void,
  onClear: () => void,
): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#BFDDF2');
  scene.fog = new THREE.Fog('#D9EAF5', 110, 300);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  camera.position.set(4, 44, 54);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(1, 0, -3);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 160;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();

  // Light: a bright, slightly warm late-morning sun.
  scene.add(new THREE.HemisphereLight('#EAF4FF', '#7E8F6C', 1.45));
  const sun = new THREE.DirectionalLight('#FFF1D6', 2.6);
  sun.position.set(40, 70, 36);
  sun.target.position.set(0, 0, -30);
  scene.add(sun.target);
  sun.castShadow = true;
  const bigScreen = Math.max(window.innerWidth, window.innerHeight) > 900;
  sun.shadow.mapSize.set(bigScreen ? 4096 : 2048, bigScreen ? 4096 : 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun);
  // a soft fill from the opposite side so shaded façades are not flat grey
  const fill = new THREE.DirectionalLight('#CFE2FF', 0.55);
  fill.position.set(-50, 30, -10);
  scene.add(fill);

  // Shared geometry: unit shapes, scaled per object.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4); // square base aligned to the axes, 1 x 1
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);

  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

  const M = {
    grass: mat('#9DB889'),
    pavement: mat('#C5C9CD'),
    asphalt: mat('#34373C', { roughness: 0.95 }),
    paint: mat('#F2F3F4'),
    steel: mat('#D9DCDF', { roughness: 0.4, metalness: 0.6 }),
    table: mat('#F7F7F5'),
    white: mat('#FAFAF8'),
    wall: mat('#E5E7E4'),
    wall2: mat('#D2D4CA'),
    trim: mat('#8E999A'),
    glass: mat('#304458', { roughness: 0.25, metalness: 0.3 }),
    accent: mat('#B95550'),
    teal: mat('#436A66'),
    warm: mat('#FFE0A1'),
    trunk: mat('#8F8971'),
    leaf: mat('#4F8A55'),
    leaf2: mat('#5D7C57'),
    red: mat('#D2382F'),
    barrel: mat('#27507A'),
    select: new THREE.MeshBasicMaterial({ color: '#FFD91A', transparent: true, opacity: 0.9 }),
    lift: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.0, depthWrite: false }),
    zone: new THREE.MeshBasicMaterial({ color: '#2FA36B', transparent: true, opacity: 0.35 }),
  };

  const add = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    pos: [number, number, number],
    scale: [number, number, number],
    parent: THREE.Object3D = scene,
    shadow: 'cast' | 'receive' | 'both' | 'none' = 'both',
  ) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.castShadow = shadow === 'cast' || shadow === 'both';
    mesh.receiveShadow = shadow === 'receive' || shadow === 'both';
    parent.add(mesh);
    return mesh;
  };

  // --- Ground -------------------------------------------------------------
  const lotW = LOT.maxX - LOT.minX;
  const lotD = LOT.maxZ - LOT.minZ;
  const lotCx = (LOT.minX + LOT.maxX) / 2;
  const lotCz = (LOT.minZ + LOT.maxZ) / 2;
  add(box, M.grass, [0, -0.3, 0], [600, 0.4, 600], scene, 'receive');
  add(box, M.pavement, [lotCx, -0.06, lotCz - 4], [lotW + 8, 0.1, lotD + 16], scene, 'receive');
  add(box, M.asphalt, [lotCx, -0.02, lotCz], [lotW, 0.1, lotD], scene, 'receive');

  // Painted parking bays: rows of short white lines.
  const bayRows = [LOT.minZ + 2.6, -7.5, -2.5, 8.5, LOT.maxZ - 2.6];
  const perRow = Math.floor((lotW - 2) / 2.5);
  const bays = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 4.8), M.paint, bayRows.length * perRow);
  const m4 = new THREE.Matrix4();
  let b = 0;
  for (const z of bayRows) {
    for (let i = 0; i < perRow; i++) {
      m4.makeTranslation(LOT.minX + 1.5 + i * 2.5, 0.04, z);
      bays.setMatrixAt(b++, m4);
    }
  }
  bays.instanceMatrix.needsUpdate = true;
  bays.receiveShadow = true;
  scene.add(bays);

  // --- Tents --------------------------------------------------------------
  const pickables: THREE.Mesh[] = [];
  const canopyMats = new Map<number, THREE.MeshStandardMaterial>();
  const baseColours = new Map<number, THREE.Color>();
  const tentGroups = new Map<number, THREE.Group>();
  const signBaseY = new Map<number, number>();
  const GREY = new THREE.Color('#A3A7AE');
  const signs = new Map<number, THREE.Sprite>();
  const stallPos = new Map<number, THREE.Vector3>();
  const byNumber = new Map(stalls.map((s) => [s.number, s]));

  const makeTent = (p: Plot, canopy: THREE.Material, roofH: number, facing: Facing | undefined, stallNumber?: number) => {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    const hw = p.w / 2 - 0.12;
    const hd = p.d / 2 - 0.12;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      add(cyl, M.steel, [sx * hw, LEG_H / 2, sz * hd], [0.05, LEG_H, 0.05], group, 'cast');
    }
    const valance = add(box, canopy, [0, LEG_H + VALANCE_H / 2, 0], [p.w - 0.06, VALANCE_H, p.d - 0.06], group);
    const roof = add(roofGeo, canopy, [0, LEG_H + VALANCE_H + roofH / 2, 0], [p.w - 0.06, roofH, p.d - 0.06], group);
    if (stallNumber) {
      valance.userData.stall = stallNumber;
      roof.userData.stall = stallNumber;
      pickables.push(valance, roof);
    }
    // A sales table along the open side.
    if (facing === 'west') add(box, M.table, [-p.w / 2 + 0.55, 0.38, 0], [0.7, 0.76, p.d * 0.66], group);
    else if (facing === 'east') add(box, M.table, [p.w / 2 - 0.55, 0.38, 0], [0.7, 0.76, p.d * 0.66], group);
    else if (facing === 'north') add(box, M.table, [0, 0.38, -p.d / 2 + 0.6], [p.w * 0.66, 0.76, 0.7], group);
    scene.add(group);
    return group;
  };

  // One 6 m x 6 m canopy covers four pitches. Each pitch owns one quarter of it: the roof quarter
  // above it, the valance along its two outer edges, the leg at its outer corner and its table.
  // Keeping each quarter in its own group lets a chosen stall lift out of the shared tent.
  const CANOPY_ROOF_H = 1.7;
  const EAVE = LEG_H + VALANCE_H;
  const makeBay = (p: Plot, canopy: THREE.Material, facing: Facing | undefined, stallNumber?: number) => {
    const c = canopyOf(p);
    if (!c) return makeTent(p, canopy, 1.25, facing, stallNumber);
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    const cx = c.x - p.x; // canopy centre, relative to this pitch
    const cz = c.z - p.z;
    const ox = Math.sign(-cx || 1) * (p.w / 2); // this pitch's outer corner
    const oz = Math.sign(-cz || 1) * (p.d / 2);
    // roof quarter: two triangles on the two pyramid faces that meet over this corner
    const geo = new THREE.BufferGeometry();
    const apex = [cx, EAVE + CANOPY_ROOF_H, cz];
    const O = [ox, EAVE, oz];
    const P = [ox, EAVE, cz];
    const Q = [cx, EAVE, oz];
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...O, ...P, ...apex, ...O, ...apex, ...Q], 3));
    geo.computeVertexNormals();
    const roof = new THREE.Mesh(geo, canopy);
    (canopy as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    // valance along the two outer edges of this quarter
    const vx = add(box, canopy, [ox, LEG_H + VALANCE_H / 2, (oz + cz) / 2], [0.06, VALANCE_H, Math.abs(cz - oz)], group);
    const vz = add(box, canopy, [(ox + cx) / 2, LEG_H + VALANCE_H / 2, oz], [Math.abs(cx - ox), VALANCE_H, 0.06], group);
    // corner leg
    add(cyl, M.steel, [ox - Math.sign(ox) * 0.12, LEG_H / 2, oz - Math.sign(oz) * 0.12], [0.06, LEG_H, 0.06], group, 'cast');
    // sales table on the open side, with a skirt in the stall's colour
    let table: THREE.Mesh | null = null;
    if (facing === 'west' || facing === 'east') {
      const tx = facing === 'west' ? -p.w / 2 + 0.55 : p.w / 2 - 0.55;
      table = add(box, M.table, [tx, 0.74, 0], [0.7, 0.06, p.d * 0.7], group);
      add(box, canopy, [tx, 0.36, 0], [0.66, 0.72, p.d * 0.68], group);
    } else if (facing === 'north') {
      table = add(box, M.table, [0, 0.74, -p.d / 2 + 0.6], [p.w * 0.7, 0.06, 0.7], group);
      add(box, canopy, [0, 0.36, -p.d / 2 + 0.6], [p.w * 0.68, 0.72, 0.66], group);
    }
    if (stallNumber) {
      for (const m of [roof, vx, vz, ...(table ? [table] : [])]) {
        m.userData.stall = stallNumber;
        pickables.push(m);
      }
    }
    scene.add(group);
    return group;
  };

  const signTexture = (n: number, state: 'idle' | 'done' | 'queued' | 'selected') => {
    const tones = {
      idle: { bg: '#FFFFFF', fg: '#23262B' },
      done: { bg: '#12683F', fg: '#FFFFFF' },
      queued: { bg: '#23262B', fg: '#FFFFFF' },
      selected: { bg: '#FFC61A', fg: '#23262B' },
    }[state];
    return makeLabel([String(n)], { w: 128, h: 96, font: 60, radius: 22, ...tones });
  };

  for (const p of PLOTS) {
    if (p.kind === 'stall') {
      const n = p.number!;
      const tone = CANOPY[byNumber.get(n)?.colour ?? 'none'];
      const canopy = mat(tone.fill, { roughness: 0.7 });
      canopyMats.set(n, canopy);
      baseColours.set(n, canopy.color.clone());
      tentGroups.set(n, makeBay(p, canopy, p.facing, n));
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(n, 'idle') }));
      sign.scale.set(1.5, 1.125, 1);
      // above the middle of this stall's roof quarter
      sign.position.set(p.x, LEG_H + VALANCE_H + (canopyOf(p) ? CANOPY_ROOF_H : 1.25) + 0.75, p.z);
      sign.material.transparent = true;
      scene.add(sign);
      signs.set(n, sign);
      signBaseY.set(n, sign.position.y);
      stallPos.set(n, new THREE.Vector3(p.x, 1.4, p.z));
    } else if (p.kind === 'support' || p.kind === 'official') {
      const big = p.kind === 'official';
      if (big) makeTent(p, M.white, 2, p.facing);
      else makeBay(p, M.wall2, p.facing);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeLabel((p.short ?? p.label).split(' '), { w: 256, h: 96, font: big ? 34 : 44, bg: '#23262B', fg: '#FFFFFF' }),
        }),
      );
      label.scale.set(big ? 4 : 2, big ? 1.5 : 0.75, 1);
      label.position.set(p.x, LEG_H + VALANCE_H + (big ? 2 : CANOPY_ROOF_H) + 0.9, p.z);
      scene.add(label);
    } else if (p.kind === 'zone') {
      add(box, M.zone, [p.x, 0.05, p.z], [p.w, 0.02, p.d], scene, 'none');
      const t = 0.18;
      add(box, M.paint, [p.x, 0.07, p.z - p.d / 2], [p.w, 0.02, t], scene, 'none');
      add(box, M.paint, [p.x, 0.07, p.z + p.d / 2], [p.w, 0.02, t], scene, 'none');
      add(box, M.paint, [p.x - p.w / 2, 0.07, p.z], [t, 0.02, p.d], scene, 'none');
      add(box, M.paint, [p.x + p.w / 2, 0.07, p.z], [t, 0.02, p.d], scene, 'none');
      add(cyl, M.steel, [p.x, 1.6, p.z], [0.06, 3.2, 0.06], scene, 'cast');
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeLabel(['Emergency', 'assembly point'], { w: 320, h: 128, font: 40, bg: '#12683F', fg: '#FFFFFF' }),
        }),
      );
      label.scale.set(5, 2, 1);
      label.position.set(p.x, 4.2, p.z);
      scene.add(label);
    } else if (p.kind === 'point') {
      for (const [dx, dz] of [[-0.45, 0], [0.45, 0], [0, 0.6]] as const) {
        add(cyl, M.barrel, [p.x + dx, 0.45, p.z + dz], [0.32, 0.9, 0.32], scene);
      }
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: makeLabel(['Used oil'], { w: 256, h: 80, font: 40, bg: '#23262B', fg: '#FFFFFF' }) }),
      );
      label.scale.set(2.6, 0.8, 1);
      label.position.set(p.x, 2.2, p.z);
      scene.add(label);
    }
  }

  for (const e of EXTINGUISHERS) {
    add(cyl, M.red, [e.x, 0.3, e.z], [0.11, 0.6, 0.11], scene, 'cast');
  }

  // --- Faculty building: stand-in massing, swapped for public/models/fsktm.glb when it loads ---
  const standIn = new THREE.Group();
  {
    const g = standIn;
    g.position.set(BUILDING.x, 0, BUILDING.z);
    const { w, d, h } = BUILDING;
    const front = d / 2;
    add(box, M.wall, [0, h / 2, 0], [w, h, d], g);
    add(box, M.trim, [0, h + 0.3, 0], [w + 0.8, 0.6, d + 0.8], g);
    // three floors of ribbon windows
    for (const y of [2.6, 6.4, 10.2]) {
      add(box, M.glass, [0, y, front + 0.05], [w - 3, 1.7, 0.2], g, 'none');
      add(box, M.wall2, [0, y - 1.25, front + 0.25], [w - 1.5, 0.35, 0.6], g, 'cast');
    }
    // vertical fins between window bays
    for (let x = -w / 2 + 2.5; x <= w / 2 - 2.5; x += 5) {
      add(box, M.wall, [x, h / 2, front + 0.3], [0.5, h, 0.6], g, 'cast');
    }
    // entrance block
    add(box, M.wall2, [0, 7.5, front + 2], [14, 15, 4], g);
    add(box, M.glass, [0, 5.2, front + 4.05], [9, 8.4, 0.2], g, 'none');
    add(box, M.accent, [0, 14.2, front + 4.06], [14, 1.2, 0.2], g, 'none');
    add(box, M.teal, [0, 4.3, front + 6.5], [16, 0.45, 6], g);
    for (const x of [-7, 7]) add(cyl, M.wall, [x, 2.05, front + 9], [0.3, 4.1, 0.3], g);
    add(box, M.warm, [0, 0.4, front + 4.2], [5, 0.8, 0.3], g, 'none');
    // name sign
    const sign = new THREE.Mesh(
      plane,
      new THREE.MeshBasicMaterial({
        map: makeLabel(['FSKTM'], { w: 512, h: 128, font: 96, bg: '#E5E7E4', fg: '#304458', radius: 4 }),
      }),
    );
    sign.scale.set(9, 2.25, 1);
    sign.position.set(0, 11.6, front + 4.2);
    g.add(sign);
    // flagpoles with plain pennants
    [-17.5, -15.5, -13.5].forEach((x, i) => {
      add(cyl, M.steel, [x, 4.5, front + 7], [0.07, 9, 0.07], g, 'cast');
      add(box, [M.accent, M.barrel, M.warm][i], [x + 0.85, 8.2, front + 7], [1.6, 1, 0.04], g, 'cast');
    });
    scene.add(g);
  }

  // --- Trees and palms around the lot -------------------------------------
  const lotDecor = new THREE.Group();
  scene.add(lotDecor);
  const tree = (x: number, z: number, palm: boolean) => {
    const scene = lotDecor;
    if (palm) {
      add(cyl, M.trunk, [x, 3, z], [0.2, 6, 0.2], scene, 'cast');
      add(blob, M.leaf2, [x, 6.3, z], [2.3, 0.7, 2.3], scene, 'cast');
    } else {
      add(cyl, M.trunk, [x, 1.4, z], [0.25, 2.8, 0.25], scene, 'cast');
      add(blob, M.leaf, [x, 4.2, z], [2.4, 2.1, 2.4], scene, 'cast');
    }
  };
  for (let z = LOT.minZ + 3; z <= LOT.maxZ; z += 8) {
    tree(LOT.minX - 3, z, false);
    tree(LOT.maxX + 3, z, false);
  }
  for (const x of [-20, -12, 14, 22]) tree(x, BUILDING.z + BUILDING.d / 2 + 2.5, true);
  for (let x = LOT.minX + 4; x <= LOT.maxX; x += 9) tree(x, LOT.maxZ + 3.5, false);

  // --- Selection: a pulsing yellow ring and a soft shadow under the lifted tent ---
  const marker = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.55, 48), M.select);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  const liftShadow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), M.lift);
  liftShadow.rotation.x = -Math.PI / 2;
  liftShadow.visible = false;
  scene.add(liftShadow);

  // --- Interaction ----------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: number | null = null;
  let current: number | null = null;
  let down: { x: number; y: number } | null = null;

  const pick = (ev: PointerEvent): number | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? (hit.object.userData.stall as number) : null;
  };

  const glow = (n: number | null, on: boolean) => {
    if (n == null) return;
    const m = canopyMats.get(n);
    if (!m) return;
    if (on) m.emissive.copy(m.color).multiplyScalar(0.35);
    else m.emissive.setRGB(0, 0, 0);
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch') return;
    const n = pick(ev);
    if (n === hovered) return;
    if (hovered !== current) glow(hovered, false);
    hovered = n;
    glow(hovered, true);
    renderer.domElement.style.cursor = n ? 'pointer' : 'grab';
  };
  const onDown = (ev: PointerEvent) => {
    down = { x: ev.clientX, y: ev.clientY };
  };
  const onUp = (ev: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved > 6) return; // that was a drag to orbit, not a tap
    const n = pick(ev);
    if (n) onSelect(n);
    else if (current != null) onClear();
  };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // Camera glide towards a selected stall. Any manual orbit cancels it.
  let flyTarget: THREE.Vector3 | null = null;
  let flyCamera: THREE.Vector3 | null = null;
  const stopFly = () => {
    flyTarget = null;
    flyCamera = null;
  };
  controls.addEventListener('start', stopFly);

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // Focus mode: the chosen tent rises and bobs, the others fade to grey.
  const LIFT = 2.4;
  const clock = new THREE.Clock();
  const tmpColour = new THREE.Color();
  const animateFocus = (t: number) => {
    const focus = current != null;
    for (const [n, g] of tentGroups) {
      const chosen = n === current;
      const targetY = chosen ? LIFT + Math.sin(t * 2.2) * 0.18 : 0;
      g.position.y += (targetY - g.position.y) * 0.12;
      const targetScale = chosen ? 1.18 : 1;
      g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * 0.12);
      const m = canopyMats.get(n)!;
      tmpColour.copy(focus && !chosen ? GREY : baseColours.get(n)!);
      m.color.lerp(tmpColour, 0.14);
      const sign = signs.get(n);
      if (sign) {
        sign.position.y = signBaseY.get(n)! + g.position.y * 1.05;
        const op = focus && !chosen ? 0.35 : 1;
        sign.material.opacity += (op - sign.material.opacity) * 0.14;
      }
    }
    if (current != null) {
      const g = tentGroups.get(current);
      const lift = g ? g.position.y : 0;
      const pulse = 1 + Math.sin(t * 3.2) * 0.07;
      marker.scale.set(pulse, pulse, 1);
      M.lift.opacity = Math.min(0.32, 0.12 + lift * 0.08);
      const spread = 1 + lift * 0.12;
      liftShadow.scale.set(spread, spread, 1);
    }
  };

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    animateFocus(clock.getElapsedTime());
    if (flyTarget && flyCamera) {
      controls.target.lerp(flyTarget, 0.09);
      camera.position.lerp(flyCamera, 0.09);
      if (camera.position.distanceTo(flyCamera) < 0.05) stopFly();
    }
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  let lastMarks: Record<number, StallMark> = {};

  const paintSigns = (marks: Record<number, StallMark>, selected: number | null) => {
    lastMarks = marks;
    for (const [n, sprite] of signs) {
      const state = selected === n ? 'selected' : marks[n] === 'done' ? 'done' : marks[n] === 'queued' ? 'queued' : 'idle';
      if (sprite.userData.state === state) continue;
      sprite.userData.state = state;
      sprite.material.map?.dispose();
      sprite.material.map = signTexture(n, state);
      sprite.material.needsUpdate = true;
    }
  };

  const select = (n: number | null, fly: boolean) => {
    if (current !== hovered) glow(current, false);
    current = n;
    paintSigns(lastMarks, n);
    const pos = n != null ? stallPos.get(n) : undefined;
    if (!pos) {
      marker.visible = false;
      liftShadow.visible = false;
      return;
    }
    glow(n, true);
    marker.visible = true;
    marker.position.set(pos.x, 0.07, pos.z);
    liftShadow.visible = true;
    liftShadow.position.set(pos.x + 0.3, 0.065, pos.z + 0.3);
    if (fly) {
      // Glide to a three-quarter view a little above the raised tent.
      const offset = camera.position.clone().sub(controls.target);
      offset.y = Math.max(offset.y, 6);
      offset.setLength(Math.min(Math.max(offset.length(), 15), 24));
      const target = pos.clone();
      target.y = LIFT * 0.8;
      flyTarget = target;
      flyCamera = target.clone().add(offset);
    }
  };

  const dispose = () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    controls.removeEventListener('start', stopFly);
    controls.dispose();
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointerup', onUp);
    scene.traverse((obj) => {
      const o = obj as THREE.Mesh | THREE.Sprite;
      if ('geometry' in o && o.geometry) o.geometry.dispose();
      const material = (o as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        m.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };

  // --- The real FSKTM model, if public/models/fsktm.glb exists ---------------
  let disposed = false;
  const loading = document.createElement('p');
  loading.className = 'scene-loading';
  loading.textContent = 'Loading the FSKTM building…';
  host.appendChild(loading);
  const draco = new DRACOLoader();
  // Only downloaded if the model was exported with Draco compression.
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(
    BUILDING_MODEL.url,
    (gltf) => {
      draco.dispose();
      loading.remove();
      if (disposed) {
        gltf.scene.traverse((o: THREE.Object3D) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
        });
        return;
      }
      const model = gltf.scene as THREE.Group;
      model.rotation.y = THREE.MathUtils.degToRad(BUILDING_MODEL.rotationY);
      model.updateMatrixWorld(true);

      // Scale, then sit it on the ground with its front edge on the building line.
      let bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      if (BUILDING_MODEL.fit === 'building' && size.x > 0) {
        model.scale.multiplyScalar(BUILDING.w / Math.max(size.x, size.z));
        model.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(model);
      }
      const centre = bounds.getCenter(new THREE.Vector3());
      const [ox, oy, oz] = BUILDING_MODEL.offset;
      model.position.x += BUILDING.x - centre.x + ox;
      model.position.y += -bounds.min.y + oy;
      model.position.z += BUILDING.z + BUILDING.d / 2 - bounds.max.z + oz;
      if (BUILDING_MODEL.replacesLot) {
        // The model brings its own ground: centre it on the lot instead.
        model.position.z += -(BUILDING.z + BUILDING.d / 2 - bounds.max.z) + (0 - centre.z);
        lotDecor.visible = false;
        bays.visible = false;
      }

      model.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });

      scene.remove(standIn);
      standIn.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry !== box && m.geometry !== cyl && m.geometry !== plane) m.geometry.dispose();
      });
      scene.add(model);
    },
    (ev: ProgressEvent) => {
      if (ev.lengthComputable && ev.total > 0) loading.textContent = `Loading the FSKTM building… ${Math.round((ev.loaded / ev.total) * 100)}%`;
    },
    () => {
      // No model file (or it failed to load): keep the stand-in building.
      draco.dispose();
      loading.remove();
    },
  );

  const disposeAll = () => {
    disposed = true;
    loading.remove();
    dispose();
  };

  return { select, paintSigns, dispose: disposeAll };
}

export default function Venue3D({ stalls, selected, onSelect, onClear, marks, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  const selectedRef = useRef(selected);
  const marksRef = useRef(marks ?? {});
  onSelectRef.current = onSelect;
  selectedRef.current = selected;
  marksRef.current = marks ?? {};

  // Rebuild the scene only when canopy colours change.
  const colourKey = stalls.map((s) => `${s.number}:${s.colour ?? ''}`).join(',');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let api: SceneApi;
    try {
      api = buildScene(
        host,
        stalls,
        (n) => onSelectRef.current(n),
        () => onClearRef.current?.(),
      );
    } catch (err) {
      console.error('3D view could not start', err);
      onUnavailable?.();
      return;
    }
    apiRef.current = api;
    api.paintSigns(marksRef.current, selectedRef.current);
    api.select(selectedRef.current, false);
    return () => {
      apiRef.current = null;
      api.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colourKey]);

  useEffect(() => {
    apiRef.current?.select(selected, true);
  }, [selected]);

  const marksKey = JSON.stringify(marks ?? {});
  useEffect(() => {
    apiRef.current?.paintSigns(marksRef.current, selectedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  return <div ref={hostRef} className="scene" />;
}
