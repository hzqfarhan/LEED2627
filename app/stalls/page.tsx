import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import StallDirectory from '@/components/StallDirectory';
import { listStalls } from '@/lib/repo';

export const metadata: Metadata = { title: 'Stalls' };

export default async function StallsPage() {
  const stalls = await listStalls();
  return (
    <div className="page">
      <PageHero
        title="Stalls"
        lead="Every student business at LEED 26. Tap a stall to see what they sell, where to find them, and to like and rate it."
        kind="tent"
        art="A low-poly pink and white market canopy"
      />
      <StallDirectory stalls={stalls} />
    </div>
  );
}
