import type { Metadata } from 'next';
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
      <header className="page-head">
        <h1>Venue map</h1>
        <p className="lead">
          {EVENT.venue}. Switch between the flat plan and the 3D view at any time; both show the same {stalls.length} stalls.
        </p>
      </header>
      <VenueExplorer stalls={stalls} judging={judging} initialStall={initialStall} />
    </div>
  );
}
