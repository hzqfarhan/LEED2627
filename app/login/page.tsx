import type { Metadata } from 'next';
import AnimatedLogo from '@/components/AnimatedLogo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparks } from '@/components/RoleArt';
import SsoSignIn from '@/components/SsoSignIn';
import { getSession, homeFor } from '@/lib/auth';
import { hasDb } from '@/lib/db';
import { DEMO_PERSONAS } from '@/lib/demo';
import { EVENT } from '@/lib/event';
import { safeNext, ssoConfigured } from '@/lib/google';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; email?: string }> }) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  const next = safeNext(params.next) || null;
  if (session && !params.error) redirect(next ?? homeFor(session.role));

  return (
    <div className="login-wrap">
      <aside className="burst login-side">
        <Sparks />
        <AnimatedLogo className="login-logo" alt={EVENT.fullName} />
        <p>One sign-in for everyone at UTHM: visitors, sellers, the jury and the committee.</p>
        <p>
          Just looking? You don’t need to sign in to <Link href="/stalls">browse the stalls</Link>.
        </p>
      </aside>
      <div className="login-main">
        <h1>Sign in</h1>
        <ul className="role-list">
          <li>
            <strong>Customers</strong> like and rate the stalls they buy from.
          </li>
          <li>
            <strong>Sellers</strong> manage their stall, team, poster and videos.
          </li>
          <li>
            <strong>Jury</strong> score the stalls allocated to them.
          </li>
          <li>
            <strong>Committee</strong> run groups, announcements and results.
          </li>
        </ul>
        <SsoSignIn
          next={next}
          error={params.error ?? null}
          triedEmail={params.email ? params.email.slice(0, 200) : null}
          ssoReady={ssoConfigured()}
          personas={hasDb ? [] : DEMO_PERSONAS.map(({ id, label, who, username, password }) => ({ id, label, who, username, password }))}
        />
      </div>
    </div>
  );
}
