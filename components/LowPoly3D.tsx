'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND, model, outward, renderLowPolySvg, type LowPolyKind } from '@/lib/lowpoly';

/**
 * A small low-poly object for a page header.
 * Computers first see the flat, faceted picture (sent with the page); it then turns into a real, slowly spinning Three.js model you can tilt
 * by moving over it. Slow phones, data-saver and reduced-motion keep the flat picture.
 */
export default function LowPoly3D({ kind, className, label }: { kind: LowPolyKind; className?: string; label: string }) {
  const polys = useMemo(() => renderLowPolySvg(kind), [kind]);
  const wrap = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const host = wrap.current;
    if (!host || !capable()) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    import('three')
      .then((THREE) => {
        if (cancelled) return;
        stop = start(THREE, host, kind, () => setLive(true));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [kind]);

  return (
    <div ref={wrap} className={`lowpoly${live ? ' is-live' : ''}${className ? ` ${className}` : ''}`} role="img" aria-label={label}>
      <svg className="lowpoly-art" viewBox="0 0 240 240" aria-hidden="true">
        {polys.map((p, i) => (
          <polygon key={i} points={p.points} fill={p.fill} stroke={p.fill} strokeWidth="0.6" strokeLinejoin="round" />
        ))}
      </svg>
    </div>
  );
}

function capable(): boolean {
  try {
    // Computers only: phones never download or run the 3D engine.
    if (!window.matchMedia('(min-width: 901px)').matches) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (n.connection?.saveData) return false;
    if ((n.hardwareConcurrency ?? 4) < 4) return false;
    if ((n.deviceMemory ?? 4) < 3) return false;
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

type Three = typeof import('three');

function start(THREE: Three, host: HTMLElement, kind: LowPolyKind, ready: () => void): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'lowpoly-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.1, 8.2);
  camera.lookAt(0, 0.45, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b0b5e, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xff9ad0, 0.7);
  rim.position.set(4, 1, -3);
  scene.add(rim);

  const group = new THREE.Group();
  const extras = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const edgeMat = new THREE.LineBasicMaterial({ color: BRAND.ink, transparent: true, opacity: 0.35 });
  disposables.push(edgeMat);
  for (const p of model(kind)) {
    const tris = outward(p.tris);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: p.color, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
    // the little floating gems spin on their own
    const small = tris.length <= 24;
    (small ? extras : group).add(mesh, edges);
    disposables.push(geo, mat, edges.geometry);
  }
  scene.add(group, extras);

  let w = 0;
  let h = 0;
  const size = () => {
    const r = host.getBoundingClientRect();
    if (r.width === w && r.height === h) return;
    w = r.width;
    h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  size();

  let tiltX = 0;
  let tiltY = 0;
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    tiltY = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
    tiltX = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
  };
  const onLeave = () => {
    tiltX = 0;
    tiltY = 0;
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);

  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(loop);
  });
  io.observe(host);

  const clock = new THREE.Clock();
  let spin = -0.6;
  let raf = 0;
  let first = true;
  const loop = () => {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    spin += dt * 0.55;
    group.rotation.y += (spin + tiltY - group.rotation.y) * 0.12;
    group.rotation.x += (tiltX - group.rotation.x) * 0.08;
    group.position.y = Math.sin(t * 1.5) * 0.08;
    extras.rotation.y = t * 0.9;
    extras.position.y = Math.sin(t * 2.1 + 1) * 0.12;
    renderer.render(scene, camera);
    if (first) {
      first = false;
      ready();
    }
    raf = requestAnimationFrame(loop);
  };
  const onVis = () => {
    if (!document.hidden && !raf) {
      clock.getDelta();
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerleave', onLeave);
    for (const d of disposables) d.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
