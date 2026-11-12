import Landing from '@/components/Landing';
import { getSession } from '@/lib/auth';
import { listCompetitions, listStalls } from '@/lib/repo';

export default async function HomePage() {
  const [session, stalls, competitions] = await Promise.all([getSession(), listStalls(), listCompetitions()]);
  return <Landing stalls={stalls} competitions={competitions} role={session?.role ?? null} />;
}
