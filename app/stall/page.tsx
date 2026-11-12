import type { Metadata } from 'next';
import StallTeamDesk from '@/components/StallTeamDesk';
import { requireStall } from '@/lib/auth';
import { listCompetitions, listStalls, stallCoverage } from '@/lib/repo';

export const metadata: Metadata = { title: 'My stall' };

export default async function StallTeamPage() {
  const session = await requireStall();
  const [stalls, competitions, coverage] = await Promise.all([listStalls(), listCompetitions(), stallCoverage(session.stall)]);
  const stall = stalls.find((s) => s.number === session.stall);

  return (
    <div className="page">
      <header className="page-head">
        <h1>My stall</h1>
        <p className="lead">Keep your stall details and video links up to date. Judges and visitors see what you save here.</p>
      </header>
      {stall ? (
        <StallTeamDesk stall={stall} competitions={competitions} coverage={coverage} />
      ) : (
        <div className="panel-empty">
          <h2>Your stall could not be found</h2>
          <p className="muted">Ask the committee to check your stall number, then sign in again.</p>
        </div>
      )}
    </div>
  );
}
