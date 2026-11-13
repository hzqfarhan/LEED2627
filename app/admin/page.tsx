import type { Metadata } from 'next';
import AdminConsole from '@/components/AdminConsole';
import { requireStaff } from '@/lib/auth';
import { accountCounts, allAllocations, listAnnouncements, listUsers, teamsByStall } from '@/lib/accounts';
import { hasDb } from '@/lib/db';
import { ssoConfigured } from '@/lib/google';
import { getResultsPublished, getVotingOpen, leaderboards, listCompetitions, listMemories, listPeople, listStalls, stallAwards, viralTallies, voteTallies } from '@/lib/repo';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage() {
  const session = await requireStaff('/admin', true);
  const [competitions, boards, people, stalls, memories, resultsPublished, votes, votingOpen, stallBoards, viral, teams, allocations, announcements, counts, users] = await Promise.all([
    listCompetitions(),
    leaderboards(),
    listPeople(),
    listStalls(),
    listMemories(true),
    getResultsPublished(),
    voteTallies(),
    getVotingOpen(),
    stallAwards(),
    viralTallies(true),
    teamsByStall(),
    allAllocations(),
    listAnnouncements('all'),
    accountCounts(),
    listUsers(),
  ]);

  return (
    <div className="page page--admin">
      <header className="page-head sr-only">
        <h1>Admin console</h1>
        <p className="lead">Results, groups, users, jury allocations, announcements, the activity log and exports.</p>
      </header>
      <AdminConsole
        competitions={competitions}
        boards={boards}
        people={people}
        stalls={stalls}
        memories={memories}
        demoMode={!hasDb}
        resultsPublished={resultsPublished}
        votes={votes}
        votingOpen={votingOpen}
        stallBoards={stallBoards}
        viral={viral}
        teams={teams}
        allocations={allocations}
        announcements={announcements}
        ssoReady={ssoConfigured()}
        counts={counts}
        users={users}
        me={session.uid}
        profile={{ name: session.name, shortName: session.shortName, email: session.email, photos: session.photos }}
      />
    </div>
  );
}
