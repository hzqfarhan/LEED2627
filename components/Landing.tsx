import Link from 'next/link';
import type { CSSProperties } from 'react';
import Countdown from '@/components/Countdown';
import RoleArt, { Sparks } from '@/components/RoleArt';
import Venue2D from '@/components/Venue2D';
import { CUSTOMER_CHOICE } from '@/lib/awards';
import { CLUSTERS, EVENT, SCHEDULE } from '@/lib/event';
import { CANOPY, STALL_COLOURS, fmtScore, isAccepting, maxTotal, type Competition, type Role, type Stall } from '@/lib/shared';

interface Props {
  stalls: Stall[];
  competitions: Competition[];
  role: Role | null;
}

const CLUSTER_TONES = ['var(--line)', 'var(--pink)', 'var(--mint)', 'var(--violet)'];

const ACCOUNT: Record<Role, { href: string; label: string }> = {
  admin: { href: '/admin', label: 'Open the admin console' },
  judge: { href: '/judge', label: 'Open my score sheets' },
  stall: { href: '/stall', label: 'Open my stall' },
};

const Thumb = ({ down = false }: { down?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={down ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M7 11v9H4v-9zM7 11l4-7c1.700 0 2.700 1.200 2.300 2.900L12.800 10H19a2 2 0 0 1 2 2.300l-1.200 6A2 2 0 0 1 17.800 20H7" />
  </svg>
);

export default function Landing({ stalls, competitions, role }: Props) {
  const account = role ? ACCOUNT[role] : { href: '/login', label: 'Sign in' };
  const tape = [...EVENT.mottos, ...CLUSTERS.map((c) => c.name)];
  const firstDay = SCHEDULE[0];

  return (
    <>
      <section className="burst lp-hero">
        <Sparks />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lp-logo" src="/brand/leed-logo.webp" width={1040} height={700} alt={EVENT.fullName} fetchPriority="high" />
        <h1>
          Student founders take over
          <span>the FSKTM parking lot</span>
        </h1>
        <p className="lead">
          {EVENT.fullName} runs on {EVENT.dates}. Browse the stalls, vote for your favourite and follow the awards.
        </p>
        <div className="lp-actions">
          <Link href="/stalls" className="btn btn--go">
            Browse the stalls
          </Link>
          <Link href={account.href} className="btn btn--ghost">
            {account.label}
          </Link>
        </div>
        <Countdown start={EVENT.start} end={EVENT.end} />

        {/* What the site does, as a row of small cards. Decorative: every item is repeated in the sections below. */}
        <ul className="lp-arc" aria-hidden="true">
          <li className="lp-fc lp-fc--cream" style={{ '--k': -3, '--d': 3 } as CSSProperties}>
            <h3>Find any tent</h3>
            <div className="fc-tents">
              {Array.from({ length: 15 }, (_, i) => (
                <i key={i} style={{ background: CANOPY[STALL_COLOURS[Math.floor(i / 3) % 5]].fill }} />
              ))}
            </div>
            <p>2D plan and 3D view</p>
          </li>
          <li className="lp-fc lp-fc--mint" style={{ '--k': -2, '--d': 2 } as CSSProperties}>
            <p>
              <strong>{firstDay.date}</strong>
            </p>
            <span className="fc-big">9:00</span>
            <p>Selling begins on day one</p>
          </li>
          <li className="lp-fc" style={{ '--k': -1, '--d': 1 } as CSSProperties}>
            <span className="fc-plate">7</span>
            <h3>Every stall has its own page</h3>
            <p>What it sells and where to find it</p>
          </li>
          <li className="lp-fc lp-fc--ink" style={{ '--k': 0, '--d': 0 } as CSSProperties}>
            <h3>Did you like this stall?</h3>
            <div className="fc-thumbs">
              <span>
                <Thumb />
              </span>
              <span>
                <Thumb down />
              </span>
            </div>
            <p>Most likes wins the {CUSTOMER_CHOICE.name}</p>
          </li>
          <li className="lp-fc" style={{ '--k': 1, '--d': 1 } as CSSProperties}>
            <h3>Price Strategy</h3>
            <div className="fc-chips">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={n === 4 ? 'on' : undefined}>
                  {n}
                </span>
              ))}
            </div>
            <p>Judges score on their phones, level by level</p>
          </li>
          <li className="lp-fc lp-fc--yellow" style={{ '--k': 2, '--d': 2 } as CSSProperties}>
            <span className="fc-big">{competitions.length + 1}</span>
            <h3>awards to win</h3>
            <p>Results appear here once announced</p>
          </li>
          <li className="lp-fc lp-fc--pink" style={{ '--k': 3, '--d': 3 } as CSSProperties}>
            <span className="fc-polaroid">
              <i />
              LEED memories
            </span>
            <p>
              <strong>Pin a photo to the memory wall</strong>
            </p>
          </li>
        </ul>
      </section>

      <div className="lp-tape-wrap" aria-hidden="true">
        <div className="lp-tape">
          <div className="lp-tape-track">
            {[...tape, ...tape].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <section className="lp-sec lp-roles wrap-x">
        <div className="lp-head">
          <h2 className="lp-h2">What brings you to LEED?</h2>
          <p className="lead">Visitors can use everything without an account. Stall teams and judges sign in.</p>
        </div>
        <div className="lp-role-grid">
          <div className="lp-role">
            <RoleArt kind="stall" />
            <h3>I’m visiting</h3>
            <p>See every stall, find it on the map and like your favourites for the {CUSTOMER_CHOICE.name}.</p>
            <Link href="/stalls" className="btn btn--go">
              Browse the stalls
            </Link>
          </div>
          <div className="lp-role">
            <RoleArt kind="tag" tone="yellow" />
            <h3>I run a stall</h3>
            <p>Name your stall, add your pitch and promo videos, and watch judges arrive on the day.</p>
            <Link href="/for-teams" className="btn btn--go">
              Guide for stall teams
            </Link>
          </div>
          <div className="lp-role">
            <RoleArt kind="clipboard" tone="mint" />
            <h3>I’m judging</h3>
            <p>Pick a stall from the list or the map and score it on your phone, even when the signal drops.</p>
            <Link href="/for-judges" className="btn btn--go">
              Guide for judges
            </Link>
          </div>
        </div>
      </section>

      <section className="lp-sec wrap-x">
        <div className="lp-head">
          <h2 className="lp-h2">Small business, big dreams</h2>
          <p className="lead">
            Organised by {EVENT.organiser} and {EVENT.coOrganiser}, with {EVENT.partner}.
          </p>
        </div>
        <div className="lp-bento">
          <div className="bento bento--tall bento--violet">
            <span className="bento-n">{EVENT.participants}</span>
            <div className="stack" style={{ gap: 10 }}>
              <p>
                <strong>students selling</strong>, from {EVENT.courses.length} entrepreneurship courses.
              </p>
              <div className="chips">
                {EVENT.courses.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="bento bento--tall bento--cream">
            <h3>Four clusters to shop</h3>
            <ul>
              {CLUSTERS.map((c, i) => (
                <li key={c.id}>
                  <i style={{ background: CLUSTER_TONES[i] }} />
                  <span>
                    {c.name}
                    <br />
                    <span className="muted" style={{ fontWeight: 400 }}>
                      {c.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bento bento--yellow">
            <span className="bento-n">{competitions.length + 1}</span>
            <p>
              <strong>awards</strong>, four scored by judges and one voted by visitors.
            </p>
          </div>
          <div className="bento bento--ink">
            <span className="bento-n">2</span>
            <p>
              <strong>days</strong>: {EVENT.dates}, at the {EVENT.venue}.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-sec wrap-x" id="awards">
        <div className="lp-head">
          <h2 className="lp-h2">The awards</h2>
          <p className="lead">Each judged award has its own rubric. A stall’s result is the average of its judges’ totals.</p>
        </div>
        <ul className="lp-awards">
          {competitions.map((c) => (
            <li key={c.id} className="award">
              <div className="award-top">
                <span className="badge">{fmtScore(maxTotal(c))} marks</span>
                <span className={`badge ${isAccepting(c) ? 'badge--mint' : 'badge--plain'}`}>Judging {isAccepting(c) ? 'open' : 'closed'}</span>
              </div>
              <h3>{c.name}</h3>
              <ul>
                {c.criteria.map((k) => (
                  <li key={k.id}>{k.name}</li>
                ))}
              </ul>
            </li>
          ))}
          <li className="award award--pink">
            <div className="award-top">
              <span className="badge badge--plain">Voted by visitors</span>
            </div>
            <h3>{CUSTOMER_CHOICE.name}</h3>
            <p>{CUSTOMER_CHOICE.description}</p>
          </li>
        </ul>
      </section>

      <section className="lp-sec wrap-x" id="programme">
        <div className="lp-head">
          <h2 className="lp-h2">Programme</h2>
        </div>
        <div className="schedule">
          {SCHEDULE.map((d) => (
            <div key={d.day} className="schedule-day">
              <h3>
                {d.day}
                <span className="muted"> {d.date}</span>
              </h3>
              <dl>
                {d.items.map((it) => (
                  <div key={it.time + it.what}>
                    <dt>{it.time}</dt>
                    <dd>{it.what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-sec wrap-x">
        <div className="lp-duo">
          <Link href="/map" className="teaser">
            <div className="teaser-media">
              <Venue2D stalls={stalls} compact />
            </div>
            <div className="teaser-copy">
              <h3>Find your way around</h3>
              <p>
                {stalls.length} stalls in front of the FSKTM building, as a 2D plan or a 3D scene you can turn and zoom.
              </p>
              <span className="teaser-go">Open the venue map</span>
            </div>
          </Link>
          <Link href="/wall" className="teaser">
            <div className="teaser-media teaser-media--wall" aria-hidden="true">
              {['First sale!', 'Team photo', 'Sold out'].map((t) => (
                <span key={t} className="fc-polaroid">
                  <i />
                  {t}
                </span>
              ))}
            </div>
            <div className="teaser-copy">
              <h3>The memory wall</h3>
              <p>Photos and videos from past LEEDs, pegged up like polaroids. Move them around, open them and pin your own.</p>
              <span className="teaser-go">Visit the memory wall</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="burst lp-cta">
        <h2 className="lp-h2">Judging or running a stall?</h2>
        <p className="lead">Sign in with the PIN the committee gave you.</p>
        <div className="lp-actions" style={{ marginTop: 6 }}>
          {role ? (
            <Link href={account.href} className="btn btn--go">
              {account.label}
            </Link>
          ) : (
            <>
              <Link href="/login?as=judge" className="btn btn--go">
                Judge sign-in
              </Link>
              <Link href="/login?as=stall" className="btn btn--go">
                Stall team sign-in
              </Link>
              <Link href="/login?as=committee" className="btn btn--ghost">
                Committee sign-in
              </Link>
            </>
          )}
        </div>
      </section>
    </>
  );
}
