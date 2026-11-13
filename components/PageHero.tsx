import type { ReactNode } from 'react';
import LowPoly3D from './LowPoly3D';
import type { LowPolyKind } from '@/lib/lowpoly';

/**
 * A page header: title, one line about the page, and on computers a low-poly 3D object.
 * Phones get the title and line only.
 */
export default function PageHero({
  title,
  lead,
  kind,
  art,
  children,
}: {
  title: string;
  lead?: ReactNode;
  kind: LowPolyKind;
  /** Accessible description of the 3D object. */
  art: string;
  children?: ReactNode;
}) {
  return (
    <header className="phero">
      <div className="phero-text">
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
      <div className="phero-stage desk-only">
        <span className="phero-glow" aria-hidden="true" />
        <LowPoly3D kind={kind} label={art} className="phero-model" />
      </div>
    </header>
  );
}
