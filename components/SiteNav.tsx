import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { EVENT } from '@/lib/event';
import NavLinks from './NavLinks';

export default async function SiteNav() {
  const session = await getSession();
  return (
    <header className="nav">
      <Link href="/" className="nav-brand" aria-label={`${EVENT.name} home`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/leed-logo-small.webp" width={360} height={242} alt="" />
      </Link>
      <NavLinks role={session?.role ?? null} name={session?.name ?? null} />
    </header>
  );
}
