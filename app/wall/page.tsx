import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import MemoryWall from '@/components/MemoryWall';
import PosterBoard, { type PublicMember } from '@/components/PosterBoard';
import { teamsByStall } from '@/lib/accounts';
import { getSession } from '@/lib/auth';
import { listMemories, listStalls } from '@/lib/repo';

export const metadata: Metadata = { title: 'Memory wall' };

export default async function WallPage() {
  const [session, memories, stalls, teams] = await Promise.all([getSession(), listMemories(false), listStalls(), teamsByStall()]);
  // Public view of each team: names of people who have signed in, never their emails.
  // Photos only for signed-in UTHM viewers; everyone else sees initials.
  const publicTeams: Record<number, PublicMember[]> = {};
  for (const [n, list] of Object.entries(teams)) {
    publicTeams[Number(n)] = list
      .filter((m) => m.joined && m.name)
      .map((m) => ({ name: m.name!, isLeader: m.isLeader, photos: session ? m.photos : [] }));
  }
  return (
    <div className="page page--wall">
      <PageHero
        title="Memory wall"
        lead="This year’s stall posters, and moments from past LEEDs. Pin yours and it joins the wall."
        kind="polaroid"
        art="Two low-poly polaroid photos pinned together"
      />
      <PosterBoard stalls={stalls.filter((s) => s.posterVersion)} teams={publicTeams} />
      <MemoryWall memories={memories} isAdmin={session?.role === 'admin'} />
    </div>
  );
}
