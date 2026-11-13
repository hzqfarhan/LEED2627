import { getSession } from '@/lib/auth';
import NavLinks, { TabBar } from './NavLinks';
import NavShell from './NavShell';
import WelcomePop from './WelcomePop';

export default async function SiteNav() {
  const session = await getSession();
  const who = session
    ? { name: session.name, shortName: session.shortName, email: session.email, photos: session.photos, role: session.role, stall: session.stall, isLeader: session.isLeader }
    : null;
  return (
    <>
      <NavShell>
        <NavLinks role={session?.role ?? null} name={session?.name ?? null} shortName={session?.shortName ?? null} photos={session?.photos ?? []} />
      </NavShell>
      <TabBar role={session?.role ?? null} />
      {who && <WelcomePop who={who} />}
    </>
  );
}
