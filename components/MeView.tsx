import LowPoly3D from './LowPoly3D';
import Link from 'next/link';
import Avatar from './Avatar';
import SignOutButton from './SignOutButton';
import StaffIdForm from './StaffIdForm';
import SoundSetting from './SoundSetting';
import type { Activity } from '@/lib/accounts';
import type { Session } from '@/lib/auth';
import { CANOPY, type Announcement, type Stall, type StallMember } from '@/lib/shared';
import { isStudentEmail, matricFromEmail } from '@/lib/uthm';

const ROLE = {
  customer: { name: 'Customer', what: 'Buy, then like and rate the stalls you visit. Your stars count for half of every stall award.', go: 'Browse the stalls', home: '/stalls' },
  seller: { name: 'Seller', what: 'You run a stall. Keep its details, poster, videos and team up to date.', go: 'Open my stall', home: '/stall' },
  judge: { name: 'Jury', what: 'Score the stalls the committee allocated to you.', go: 'Open my score sheets', home: '/judge' },
  admin: { name: 'Committee', what: 'Run groups, juries, announcements and results.', go: 'Open the admin console', home: '/admin' },
} as const;

interface Props {
  session: Session;
  announcements: Announcement[];
  activity: Activity;
  stall: Stall | undefined;
  team: StallMember[];
}

/** The signed-in person's own page: who they are, their stall, what they have done, and shortcuts. */
export default function MeView({ session, announcements, activity, stall, team }: Props) {
  const role = ROLE[session.role];
  const student = isStudentEmail(session.email);
  const matric = matricFromEmail(session.email);
  const tone = CANOPY[stall?.colour ?? 'none'];
  const home = role.home;

  const tiles: { value: string; label: string; href?: string }[] = [];
  if (session.role === 'judge') tiles.push({ value: String(activity.scored), label: 'score sheets saved', href: '/judge' });
  if (session.role === 'customer' || session.role === 'seller') {
    tiles.push({ value: String(activity.likes), label: activity.likes === 1 ? 'stall liked' : 'stalls liked', href: '/stalls' });
    tiles.push({ value: String(activity.rated), label: activity.rated === 1 ? 'stall rated' : 'stalls rated', href: '/stalls' });
  }
  if (stall) {
    const on = team.filter((m) => m.joined).length;
    tiles.push({ value: `${on}/${team.length}`, label: 'team connected', href: '/stall' });
    tiles.push({ value: stall.posterVersion ? 'Live' : 'No', label: 'poster on the wall', href: '/stall' });
  }

  return (
    <div className="page page--narrow me">
      <header className={`me-card me-card--${session.role}`}>
        <div className="me-card-band">
          <LowPoly3D kind={session.role === 'judge' ? 'clipboard' : session.role === 'seller' ? 'shop' : session.role === 'admin' ? 'console' : 'badge'} label="A low-poly badge for your role" className="me-model desk-only" />
        </div>
        <div className="me-card-body">
          <Avatar name={session.name} photos={session.photos} size={104} className="me-photo" />
          <div className="me-id">
            <h1>{session.name}</h1>
            <p className="me-email">{session.email}</p>
            <ul className="me-badges">
              <li className="me-badge me-badge--role">{role.name}</li>
              {stall && (
                <li className="me-badge me-badge--stall">
                  <span className="me-plate" style={{ background: tone.fill, color: tone.ink }}>
                    {stall.number}
                  </span>
                  {session.isLeader ? 'Team leader' : 'Team member'}
                </li>
              )}
              {matric && <li className="me-badge">Matric {matric}</li>}
              {!student && session.staffId && <li className="me-badge">Staff ID {session.staffId}</li>}
            </ul>
          </div>
        </div>
      </header>

      <section className="me-main">
        <p className="me-what">{role.what}</p>
        {stall && (
          <Link className="me-stall" href="/stall" style={{ borderColor: tone.fill }}>
            <span className="me-plate me-plate--big" style={{ background: tone.fill, color: tone.ink }}>
              {stall.number}
            </span>
            <span>
              <strong>{stall.name}</strong>
              <small>{stall.groupName ?? 'Your stall'}</small>
            </span>
          </Link>
        )}
        {tiles.length > 0 && (
          <ul className="me-tiles">
            {tiles.map((t) => (
              <li key={t.label}>
                <Link href={t.href ?? home}>
                  <strong>{t.value}</strong>
                  <span>{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="me-actions">
          <Link className="btn btn--go" href={home}>
            {role.go}
          </Link>
          <SignOutButton name={session.name} email={session.email} photos={session.photos} />
        </div>
      </section>

      <section className="card stack me-settings">
        <h2 className="h3">Settings</h2>
        <SoundSetting />
      </section>

      {!student && (
        <section className="card stack me-photo-card">
          <h2 className="h3">Your UTHM photo</h2>
          <p className="muted">Add your staff ID to use your UTHM Community photo. Until then your Google photo is shown.</p>
          <StaffIdForm current={session.staffId} />
        </section>
      )}

      {announcements.length > 0 && (
        <section className="stack">
          <h2 className="h3">Announcements</h2>
          <div className="notices">
            {announcements.map((a) => (
              <article key={a.id} className={`notice${a.pinned ? ' notice--pinned' : ''}`}>
                <h3>{a.title}</h3>
                {a.body && <p>{a.body}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
