import type { Metadata } from 'next';
import AdminConsole from '@/components/AdminConsole';
import { requireStaff } from '@/lib/auth';
import { hasDb } from '@/lib/db';
import { getResultsPublished, getVotingOpen, leaderboards, listCompetitions, listMemories, listPeople, listStalls, voteTallies } from '@/lib/repo';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage() {
  await requireStaff('/admin', true);
  const [competitions, boards, people, stalls, memories, resultsPublished, votes, votingOpen] = await Promise.all([
    listCompetitions(),
    leaderboards(),
    listPeople(),
    listStalls(),
    listMemories(true),
    getResultsPublished(),
    voteTallies(),
    getVotingOpen(),
  ]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Admin console</h1>
        <p className="lead">Live results, judge progress, stalls, accounts and the memory wall.</p>
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
      />
    </div>
  );
}
