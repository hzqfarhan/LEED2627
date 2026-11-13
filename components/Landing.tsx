import Link from 'next/link';
import AnimatedLogo from './AnimatedLogo';
import type { CSSProperties } from 'react';
import Countdown from '@/components/Countdown';
import RoleArt, { Sparks } from '@/components/RoleArt';
import Venue2D from '@/components/Venue2D';
import { CATEGORIES, CUSTOMER_CHOICE } from '@/lib/awards';
import { CLUSTERS, EVENT, SCHEDULE } from '@/lib/event';
import { CANOPY, STALL_COLOURS, type Announcement, type Role, type Stall } from '@/lib/shared';

interface Props {
  stalls: Stall[];
  role: Role | null;
  announcements: Announcement[];
}

/** Programme moments worth spotting at a glance. */
const KEY_MOMENT = /begins|ceremony|prize/i;

const CLUSTER_TONES = ['var(--line)', 'var(--pink)', 'var(--mint)', 'var(--violet)'];

const ACCOUNT: Record<Role, { href: string; label: string }> = {
  admin: { href: '/admin', label: 'Open the admin console' },
  judge: { href: '/judge', label: 'Open my score sheets' },
  seller: { href: '/stall', label: 'Open my stall' },
  customer: { href: '/stalls', label: 'Find stalls to rate' },
};

const Thumb = ({ down = false }: { down?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={down ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M7 11v9H4v-9zM7 11l4-7c1.700 0 2.700 1.200 2.300 2.900L12.800 10H19a2 2 0 0 1 2 2.300l-1.200 6A2 2 0 0 1 17.800 20H7" />
  </svg>
);

export default function Landing({ stalls, role, announcements }: Props) {
  const account = role ? ACCOUNT[role] : { href: '/login', label: 'Sign in with UTHM SSO' };
  const tape = [...EVENT.mottos, ...CLUSTERS.map((c) => c.name)];
  const firstDay = SCHEDULE[0];

  return (
    <>
      <section className="burst lp-hero">
        <Sparks />
        <span className="lp-beams" aria-hidden="true" />
        <span className="lp-comet" aria-hidden="true" />
        <h1 className="sr-only">{EVENT.fullName}</h1>
        <div className="lp-stage">
          <AnimatedLogo className="lp-logo" alt="" priority />
        </div>
        <p className="lp-intro">
          {EVENT.participants} student founders, {stalls.length} stalls, two days of selling. Browse them, like your favourites and follow the
          awards.
        </p>
        <div className="lp-actions">
          <Link href="/stalls" className="btn btn--go">
            Browse the stalls
          </Link>
          <Link href={account.href} className="btn btn--ghost">
            {role ? account.label : 'Sign in with UTHM'}
          </Link>
        </div>
        <Countdown start={EVENT.start} end={EVENT.end} />
        <dl className="lp-facts">
          <div>
            <dt>When</dt>
            <dd>9 & 10 Dec 2026</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>FSKTM Parking Lot, UTHM</dd>
          </div>
          <div>
            <dt>Doors</dt>
            <dd>9:00 am</dd>
          </div>
        </dl>

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
            <span className="fc-big">{CATEGORIES.length}</span>
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

      {announcements.length > 0 && (
        <section className="wrap-x lp-news" aria-labelledby="news-title">
          <h2 id="news-title" className="lp-news-title">
            From the committee
          </h2>
          <div className="notices">
            {announcements.slice(0, 3).map((a) => (
              <article key={a.id} className={`notice${a.pinned ? ' notice--pinned' : ''}`}>
                <h3>{a.title}</h3>
                {a.body && <p>{a.body}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="lp-sec lp-roles wrap-x">
        <div className="lp-head">
          <h2 className="lp-h2">What brings you to LEED?</h2>
          <p className="lead m-hide">Visitors can use everything without an account. Stall teams and judges sign in.</p>
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
          <p className="lead m-hide">
            Organised by {EVENT.organiser} and {EVENT.coOrganiser}, with {EVENT.partner}.
          </p>
        </div>
        <div className="lp-bento">
          <div className="bento bento--tall bento--violet bento--stat">
            <span className="bento-n">{EVENT.participants}</span>
            <div className="stack" style={{ gap: 10 }}>
              <p>
                <strong>students selling</strong>
                <span className="m-hide">, from {EVENT.courses.length} entrepreneurship courses.</span>
              </p>
              <div className="chips m-hide">
                {EVENT.courses.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="bento bento--tall bento--cream bento--clusters">
            <h3>Four clusters to shop</h3>
            <ul>
              {CLUSTERS.map((c, i) => (
                <li key={c.id}>
                  <i style={{ background: CLUSTER_TONES[i] }} />
                  <span>
                    {c.name}
                    <span className="muted m-hide" style={{ fontWeight: 400, display: 'block' }}>
                      {c.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bento bento--yellow bento--stat">
            <span className="bento-n">{CATEGORIES.length}</span>
            <p>
              <strong>awards</strong>
              <span className="m-hide">, judged by the jury, rated by customers and voted on social media.</span>
            </p>
          </div>
          <div className="bento bento--ink bento--stat">
            <span className="bento-n">2</span>
            <p>
              <strong>days</strong>
              <span className="m-hide">: {EVENT.dates}, at the {EVENT.venue}.</span>
            </p>
          </div>
        </div>
      </section>

      <section className="lp-sec wrap-x" id="awards">
        <div className="lp-head">
          <h2 className="lp-h2">The awards</h2>
          <p className="lead m-hide">
            Stall awards are half jury, half customers: rate the stalls you visit and you help pick the winners.
          </p>
          <p className="swipe-hint">Swipe to see all {CATEGORIES.length} awards</p>
        </div>
        <ul className="lp-awards">
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
      </section>

      <section className="lp-sec wrap-x" id="programme">
        <div className="lp-head">
          <h2 className="lp-h2">Programme</h2>
          <p className="lead m-hide">Two days of selling. Day two ends with the closing ceremony and prize giving.</p>
        </div>
        <ol className="lp-days">
          {SCHEDULE.map((d) => (
            <li key={d.day} className="lp-day">
              <h3 className="lp-day-head">
                <span>{d.day}</span>
                {d.date}
              </h3>
              <ol className="lp-tl">
                {d.items.map((it) => (
                  <li key={it.time + it.what} className={KEY_MOMENT.test(it.what) ? 'is-key' : undefined}>
                    <time>{it.time}</time>
                    <span>{it.what}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-sec wrap-x">
        <div className="lp-duo">
          <Link href="/map" className="teaser">
            <div className="teaser-media">
              <Venue2D stalls={stalls} compact />
            </div>
            <div className="teaser-copy">
              <h3>Venue map</h3>
              <p className="m-hide">
                {stalls.length} stalls in front of the FSKTM building, as a 2D plan or a 3D scene you can turn and zoom.
              </p>
              <span className="teaser-go">Open the map</span>
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
              <p className="m-hide">Photos and videos from past LEEDs, pegged up like polaroids. Move them around, open them and pin your own.</p>
              <span className="teaser-go">Visit the wall</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="burst lp-cta">
        <h2 className="lp-h2">{role ? 'You are signed in' : 'One sign-in for all of UTHM'}</h2>
        <p className="lead">
          {role
            ? 'Pick up where you left off.'
            : 'Customers, sellers, the jury and the committee all use their UTHM account. Your role is picked up automatically.'}
        </p>
        <div className="lp-actions" style={{ marginTop: 6 }}>
          {role ? (
            <Link href={account.href} className="btn btn--go">
              {account.label}
            </Link>
          ) : (
            <a href="/api/auth/sso" className="btn btn--go">
              Sign in with UTHM SSO
            </a>
          )}
        </div>
      </section>
    </>
  );
}
