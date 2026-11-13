import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import JudgeDesk from '@/components/JudgeDesk';
import { allocationsFor, listAnnouncements } from '@/lib/accounts';
import { requireStaff } from '@/lib/auth';
import { assignmentsFor, listCompetitions, listStalls, submissionsFor } from '@/lib/repo';

export const metadata: Metadata = { title: 'Judging' };

export default async function JudgePage({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const session = await requireStaff('/judge');
  const [params, competitions, assigned, stalls, submissions, allocated, announcements] = await Promise.all([
    searchParams,
    listCompetitions(),
    assignmentsFor(session.uid),
    listStalls(),
    submissionsFor(session.uid),
    allocationsFor(session.uid),
    listAnnouncements('judge'),
  ]);
  const stallNumber = Number(params.s);

  return (
    <div className="page">
      <PageHero
        title="Judging"
        lead={`Signed in as ${session.shortName}. Pick a stall, tap a level for each criterion, save. You can change a score until judging closes.`}
        kind="clipboard"
        art="A low-poly purple clipboard with ticked boxes and a pink pen"
      />
      {announcements.length > 0 && (
        <section className="notices" aria-label="Announcements from the committee" style={{ marginBottom: 16 }}>
          {announcements.slice(0, 2).map((a) => (
            <article key={a.id} className={`notice${a.pinned ? ' notice--pinned' : ''}`}>
              <h3>{a.title}</h3>
              {a.body && <p>{a.body}</p>}
            </article>
          ))}
        </section>
      )}
      <JudgeDesk
        judgeId={session.uid}
        judgeName={session.name}
        competitions={competitions.filter((c) => assigned.includes(c.id))}
        stalls={stalls}
        allocated={allocated}
        submissions={submissions}
        initialSlug={params.c ?? null}
        initialStall={Number.isInteger(stallNumber) ? stallNumber : null}
      />
    </div>
  );
}
