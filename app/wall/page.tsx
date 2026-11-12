import type { Metadata } from 'next';
import MemoryWall from '@/components/MemoryWall';
import { getSession } from '@/lib/auth';
import { listMemories } from '@/lib/repo';

export const metadata: Metadata = { title: 'Memory wall' };

export default async function WallPage() {
  const [session, memories] = await Promise.all([getSession(), listMemories(false)]);
  return (
    <div className="page page--wall">
      <header className="page-head">
        <h1>Memory wall</h1>
        <p className="lead">Moments from past LEEDs. Pin yours and it joins the wall.</p>
      </header>
      <MemoryWall memories={memories} isAdmin={session?.role === 'admin'} />
    </div>
  );
}
