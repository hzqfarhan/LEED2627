import type { Metadata } from 'next';
import Link from 'next/link';
import Countdown from '@/components/Countdown';
import RoleArt, { Sparks } from '@/components/RoleArt';
import { getSession } from '@/lib/auth';
import { AWARDS, CATEGORIES, CUSTOMER_CHOICE } from '@/lib/awards';
import { EVENT } from '@/lib/event';

export const metadata: Metadata = {
  title: 'For stall teams',
  description: `How stall teams use the ${EVENT.name} site: set up your stall page, add your videos and collect likes and star ratings from customers.`,
};

export default async function ForTeamsPage() {
  const session = await getSession();
  const cta = session?.stall != null ? { href: '/stall', label: 'Open my stall' } : { href: '/login?next=/stall', label: 'Sign in with UTHM SSO' };
  const stallAward = AWARDS.find((a) => a.slug === 'stall');

  return (
    <>
      <section className="burst guide-hero wrap-x">
        <Sparks />
        <div>
          <h1>Get your stall ready for {EVENT.name}</h1>
          <p className="lead">
            Your stall gets its own page. Fill it in before the carnival so visitors can find you and judges can open your videos.
          </p>
          <div className="lp-actions" style={{ marginTop: 4, justifyContent: 'flex-start' }}>
            <Link href={cta.href} className="btn btn--go">
              {cta.label}
            </Link>
            <Link href="/stalls" className="btn btn--ghost">
              See all stalls
            </Link>
          </div>
          <Countdown start={EVENT.start} end={EVENT.end} size="compact" />
        </div>
        <RoleArt kind="tag" tone="yellow" />
      </section>

      <section className="lp-sec wrap-x">
        <h2 className="lp-h2">How it works</h2>
        <ol className="steps-grid">
          <li>
            <h3>Get your team PIN</h3>
            <p>The committee gives each team its stall number and one PIN. Share the PIN only within your group.</p>
          </li>
          <li>
            <h3>Set up your stall page</h3>
            <p>Name your stall, choose your cluster and describe what you sell.</p>
          </li>
          <li>
            <h3>Add your videos</h3>
            <p>Paste the link to your pitch video and up to three promo videos. Judges open them from their score sheets.</p>
          </li>
          <li>
            <h3>Collect likes on the day</h3>
            <p>
              Ask customers to open your stall page, tap “I like it” and rate you with stars. Likes decide the {CUSTOMER_CHOICE.name}; stars are half
              of every stall award.
            </p>
          </li>
        </ol>
      </section>

      <section className="lp-sec wrap-x" style={{ paddingTop: 0 }}>
        <div className="guide-split">
          <div className="card">
            <h3>How your stall is judged</h3>
            <p>
              Judges score your stall on day one, 12:00 pm to 5:00 pm, on {stallAward?.criteria.reduce((n, k) => n + k.marks, 0)} marks, and customers
              rate the same elements for another 25. Together they decide Outstanding Stall (50 marks) and the four element awards:
            </p>
            <ul>
              {stallAward?.criteria.map((k) => (
                <li key={k.name}>
                  <strong>{k.name}</strong> ({k.marks} marks). {k.description}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Good to know</h3>
            <ul>
              <li>“Judging so far” on your stall page shows how many judges have visited. Scores stay private until results are announced.</li>
              <li>You can change your stall details and video links at any time.</li>
              <li>The canopy colour and stall number are set by the committee.</li>
              <li>Forgot your PIN? Ask the committee for a new one.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-sec wrap-x" style={{ paddingTop: 0 }}>
        <div className="lp-head" style={{ justifyItems: 'start', textAlign: 'left' }}>
          <h2 className="lp-h2">All {CATEGORIES.length} awards</h2>
        </div>
        <ul className="lp-awards lp-awards--4">
          {CATEGORIES.map((cat) => (
            <li key={cat.slug} className={`award${cat.slug === CUSTOMER_CHOICE.slug ? ' award--pink' : ''}`}>
              <div className="award-top">
                {cat.marks ? <span className="badge">{cat.marks} marks</span> : null}
                <span className="badge badge--plain">{cat.places === 1 ? '1 winner' : '1st to 3rd place'}</span>
              </div>
              <h3>{cat.name}</h3>
              <p>{cat.how}.</p>
            </li>
          ))}
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
