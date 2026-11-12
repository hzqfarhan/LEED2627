import type { Metadata } from 'next';
import StallDirectory from '@/components/StallDirectory';
import { listStalls } from '@/lib/repo';

export const metadata: Metadata = { title: 'Stalls' };

export default async function StallsPage() {
  const stalls = await listStalls();
  return (
    <div className="page">
      <header className="page-head">
        <h1>Stalls</h1>
        <p className="lead">Every student business at LEED 26. Tap a stall to see what they sell and where to find them.</p>
      </header>
      <StallDirectory stalls={stalls} />
    </div>
  );
}
