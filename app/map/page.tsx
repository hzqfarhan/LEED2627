import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import VenueExplorer from '@/components/VenueExplorer';
import { getStaffSession } from '@/lib/auth';
import { EVENT } from '@/lib/event';
import { assignmentsFor, listCompetitions, listStalls, submissionsFor } from '@/lib/repo';
import type { Competition, Submission } from '@/lib/shared';

export const metadata: Metadata = { title: 'Venue map' };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ stall?: string }> }) {
  const [params, session, stalls] = await Promise.all([searchParams, getStaffSession(), listStalls()]);

  let judging: { judgeId: number; competitions: Competition[]; submissions: Submission[] } | null = null;
  if (session) {
    const [competitions, assigned, submissions] = await Promise.all([
      listCompetitions(),
      assignmentsFor(session.uid),
      submissionsFor(session.uid),
    ]);
    judging = { judgeId: session.uid, competitions: competitions.filter((c) => assigned.includes(c.id)), submissions };
  }

  const wanted = Number(params.stall);
  const initialStall = stalls.some((s) => s.number === wanted) ? wanted : null;

  return (
    <div className="page">
      <PageHero
        title="Venue map"
        lead={`${EVENT.venue}. Switch between the flat plan and the 3D view; tap a tent to bring it up.`}
        kind="pin"
        art="A low-poly map pin standing on a green disc"
      />
      <VenueExplorer stalls={stalls} judging={judging} initialStall={initialStall} />
    </div>
  );
}
