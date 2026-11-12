import type { Metadata } from 'next';
import JudgeDesk from '@/components/JudgeDesk';
import { requireStaff } from '@/lib/auth';
import { assignmentsFor, listCompetitions, listStalls, submissionsFor } from '@/lib/repo';

export const metadata: Metadata = { title: 'Judging' };

export default async function JudgePage({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const session = await requireStaff('/judge');
  const [params, competitions, assigned, stalls, submissions] = await Promise.all([
    searchParams,
    listCompetitions(),
    assignmentsFor(session.uid),
    listStalls(),
    submissionsFor(session.uid),
  ]);
  const stallNumber = Number(params.s);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Judging</h1>
        <p className="lead">Signed in as {session.name}. Pick a stall, score it, save. You can change a score until judging closes.</p>
      </header>
      <JudgeDesk
        judgeId={session.uid}
        judgeName={session.name}
        competitions={competitions.filter((c) => assigned.includes(c.id))}
        stalls={stalls}
        submissions={submissions}
        initialSlug={params.c ?? null}
        initialStall={Number.isInteger(stallNumber) ? stallNumber : null}
      />
    </div>
  );
}
