import type { Metadata } from 'next';
import Link from 'next/link';
import Countdown from '@/components/Countdown';
import RoleArt, { Sparks } from '@/components/RoleArt';
import { getSession } from '@/lib/auth';
import { AWARDS, CUSTOMER_CHOICE, SCALE_MAX, SCALE_MIN } from '@/lib/awards';
import { EVENT } from '@/lib/event';

export const metadata: Metadata = {
  title: 'For judges',
  description: `How judging works at ${EVENT.name}: sign in, pick a stall and score it on your phone.`,
};

export default async function ForJudgesPage() {
  const session = await getSession();
  const signedIn = session && session.role !== 'stall';
  const cta = signedIn ? { href: '/judge', label: 'Open my score sheets' } : { href: '/login?as=judge', label: 'Sign in as a judge' };

  return (
    <>
      <section className="burst guide-hero wrap-x">
        <Sparks />
        <div>
          <h1>Judging at {EVENT.name}, on your phone</h1>
          <p className="lead">
            One sign-in replaces the paper forms. Pick a stall, tap a level for each criterion and save. The committee sees the ranking
            as scores come in.
          </p>
          <div className="lp-actions" style={{ marginTop: 4, justifyContent: 'flex-start' }}>
            <Link href={cta.href} className="btn btn--go">
              {cta.label}
            </Link>
            <Link href="/map" className="btn btn--ghost">
              See the venue map
            </Link>
          </div>
          <Countdown start={EVENT.start} end={EVENT.end} size="compact" />
        </div>
        <RoleArt kind="clipboard" tone="mint" />
      </section>

      <section className="lp-sec wrap-x">
        <h2 className="lp-h2">How it works</h2>
        <ol className="steps-grid">
          <li>
            <h3>Sign in</h3>
            <p>Use your email and the PIN the committee sent with your judging assignment.</p>
          </li>
          <li>
            <h3>Pick a stall</h3>
            <p>Choose from the list or tap a tent on the map. Stalls you have scored are ticked off.</p>
          </li>
          <li>
            <h3>Score each criterion</h3>
            <p>
              Tap a level from {SCALE_MIN} to {SCALE_MAX}. The rubric wording for that level and the marks it gives appear as you tap.
            </p>
          </li>
          <li>
            <h3>Save, and change if needed</h3>
            <p>You can reopen and change a score sheet until the committee closes judging.</p>
          </li>
        </ol>
      </section>

      <section className="lp-sec wrap-x" style={{ paddingTop: 0 }}>
        <div className="guide-split">
          <div className="card">
            <h3>Good to know</h3>
            <ul>
              <li>If the signal drops, your scores stay on your phone and are sent when it returns.</li>
              <li>Pitch and marketing videos open straight from the score sheet.</li>
              <li>A stall’s result is the average of its judges’ totals, so visiting fewer stalls does not skew the ranking.</li>
              <li>Add the site to your home screen to open it like an app.</li>
            </ul>
          </div>
          <div className="card">
            <h3>When</h3>
            <p>Stall judging runs on day one, Wednesday 9 December, from 12:00 pm to 5:00 pm at the {EVENT.venue}.</p>
            <p className="muted">Lost your PIN or cannot sign in? Ask the Judging Unit at the committee table.</p>
          </div>
        </div>
      </section>

      <section className="lp-sec wrap-x" style={{ paddingTop: 0 }}>
        <div className="lp-head" style={{ justifyItems: 'start', textAlign: 'left' }}>
          <h2 className="lp-h2">What you will score</h2>
          <p className="lead">You only see the awards the committee assigned to you.</p>
        </div>
        <ul className="lp-awards">
          {AWARDS.map((a) => (
            <li key={a.slug} className="award">
              <div className="award-top">
                <span className="badge">{a.criteria.reduce((n, k) => n + k.marks, 0)} marks</span>
              </div>
              <h3>{a.name}</h3>
              <ul>
                {a.criteria.map((k) => (
                  <li key={k.name}>
                    {k.name}, {k.marks} marks
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li className="award award--pink">
            <div className="award-top">
              <span className="badge badge--plain">Not judged</span>
            </div>
            <h3>{CUSTOMER_CHOICE.name}</h3>
            <p>Decided by visitors’ likes, so there is nothing to score.</p>
          </li>
        </ul>
        <div>
          <Link href={cta.href} className="btn btn--go">
            {cta.label}
          </Link>
        </div>
      </section>
    </>
  );
}
