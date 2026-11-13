import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import StallRegistration from '@/components/StallRegistration';
import StallTeamDesk from '@/components/StallTeamDesk';
import { listAnnouncements, teamOf } from '@/lib/accounts';
import { requireSeller } from '@/lib/auth';
import { getDetails, paymentsOf } from '@/lib/payments';
import { customerFeedback, getVotingOpen, listCompetitions, listStalls, stallCoverage } from '@/lib/repo';

export const metadata: Metadata = { title: 'My stall' };

export default async function StallTeamPage() {
  const session = await requireSeller();
  const [stalls, competitions, coverage, team, announcements, feedback, votingOpen, details, payments] = await Promise.all([
    listStalls(),
    listCompetitions(),
    stallCoverage(session.stall),
    teamOf(session.stall),
    listAnnouncements('seller'),
    customerFeedback(session.stall),
    getVotingOpen(),
    getDetails(session.stall),
    paymentsOf(session.stall),
  ]);
  const leader = team.find((m) => m.isLeader);
  const stall = stalls.find((s) => s.number === session.stall);

  return (
    <div className="page">
      <PageHero
        title="My stall"
        lead="Registration, payments, your team, logo, poster, stall details and videos. Judges and visitors see what you save here."
        kind="shop"
        art="A low-poly yellow and pink stall with food on the counter"
      />
      {stall ? (
        <StallTeamDesk
          stall={stall}
          competitions={competitions}
          coverage={coverage}
          team={team}
          me={session.email}
          canManage={session.isLeader || session.role === 'admin'}
          announcements={announcements}
          feedback={feedback}
          votingOpen={votingOpen}
          registration={
            <StallRegistration
              stallNumber={stall.number}
              details={details}
              payments={payments}
              hasPitch={Boolean(stall.pitchUrl)}
              isLeader={session.isLeader}
              leaderName={leader ? (leader.name ?? leader.email) : null}
              me={{ name: session.name, email: session.email }}
            />
          }
        />
      ) : (
        <div className="panel-empty">
          <h2>Your stall could not be found</h2>
          <p className="muted">Ask the committee to check which stall your team is on.</p>
        </div>
      )}
    </div>
  );
}
