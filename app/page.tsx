import Landing from '@/components/Landing';
import { listAnnouncements } from '@/lib/accounts';
import { getSession } from '@/lib/auth';
import { listStalls } from '@/lib/repo';

export default async function HomePage() {
  const session = await getSession();
  const [stalls, announcements] = await Promise.all([listStalls(), listAnnouncements(session?.role ?? null)]);
  return <Landing stalls={stalls} role={session?.role ?? null} announcements={announcements} />;
}
