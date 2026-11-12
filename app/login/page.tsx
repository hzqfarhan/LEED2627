import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm, { type LoginRole } from '@/components/LoginForm';
import { Sparks } from '@/components/RoleArt';
import { getSession, homeFor } from '@/lib/auth';
import { hasDb } from '@/lib/db';
import { DEMO_LOGINS, DEMO_STALL_LOGIN } from '@/lib/demo';
import { EVENT } from '@/lib/event';

export const metadata: Metadata = { title: 'Sign in' };

const ROLES: LoginRole[] = ['judge', 'stall', 'committee'];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  if (session) redirect(homeFor(session.role));
  const initial = ROLES.find((r) => r === params.as) ?? 'judge';

  return (
    <div className="login-wrap">
      <aside className="burst login-side">
        <Sparks />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/leed-logo.webp" width={1040} height={700} alt={EVENT.fullName} />
        <p>Judges, stall teams and the committee sign in here.</p>
        <p>
          Just visiting? You don’t need an account. <Link href="/stalls">Browse the stalls</Link>
        </p>
      </aside>
      <div className="login-main">
        <h1>Sign in</h1>
        <LoginForm
          next={params.next ?? null}
          initialRole={initial}
          demoLogins={hasDb ? [] : DEMO_LOGINS}
          demoStall={hasDb ? null : DEMO_STALL_LOGIN}
        />
      </div>
    </div>
  );
}
