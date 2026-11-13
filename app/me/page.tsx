import type { Metadata } from 'next';
import MeView from '@/components/MeView';
import { activityOf, listAnnouncements, teamOf } from '@/lib/accounts';
import { requireUser } from '@/lib/auth';
import { listStalls } from '@/lib/repo';

export const metadata: Metadata = { title: 'Me' };

export default async function MePage() {
  const session = await requireUser('/me');
  const [announcements, activity, stalls, team] = await Promise.all([
    listAnnouncements(session.role),
    activityOf(session.uid),
    session.stall != null ? listStalls() : Promise.resolve([]),
    session.stall != null ? teamOf(session.stall) : Promise.resolve([]),
  ]);
  const stall = session.stall != null ? stalls.find((s) => s.number === session.stall) : undefined;
  return <MeView session={session} announcements={announcements} activity={activity} stall={stall} team={team} />;
}
