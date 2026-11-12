import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import CustomerVote from '@/components/CustomerVote';
import { getStaffSession } from '@/lib/auth';
import { clusterName } from '@/lib/event';
import { getVotingOpen, listStalls, voteOf } from '@/lib/repo';
import { plotForStall } from '@/lib/venue';
import { CANOPY } from '@/lib/shared';
import { readVoter, turnstileSiteKey, VOTER_COOKIE } from '@/lib/voter';

type Params = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { number } = await params;
  const stall = (await listStalls()).find((s) => s.number === Number(number));
  return { title: stall ? `${stall.number}. ${stall.name}` : 'Stall' };
}

export default async function StallPage({ params }: Params) {
  const { number } = await params;
  const [stalls, staff] = await Promise.all([listStalls(), getStaffSession()]);
  const stall = stalls.find((s) => s.number === Number(number));
  if (!stall) notFound();

  const voter = readVoter((await cookies()).get(VOTER_COOKIE)?.value);
  const [votingOpen, myVote] = await Promise.all([getVotingOpen(), voter ? voteOf(stall.number, voter) : Promise.resolve(null)]);
  const onMap = Boolean(plotForStall(stall.number));
  const tone = CANOPY[stall.colour ?? 'none'];
  const i = stalls.indexOf(stall);
  const prev = stalls[(i - 1 + stalls.length) % stalls.length];
  const next = stalls[(i + 1) % stalls.length];
  const videos = [
    ...(stall.pitchUrl ? [{ label: 'Business pitch video', url: stall.pitchUrl }] : []),
    ...stall.promoUrls.map((url, k) => ({ label: `Promo video ${k + 1}`, url })),
  ];

  return (
    <div className="page page--mid">
      <Link className="link-back" href="/stalls">
        All stalls
      </Link>

      <header className="stall-hero" style={{ background: tone.fill, color: tone.ink }}>
        <span className="stall-hero-n">{stall.number}</span>
        <div>
          <h1>{stall.name}</h1>
          <p>
            {clusterName(stall.cluster)}
            {stall.groupName ? `, ${stall.groupName}` : ''}
          </p>
        </div>
      </header>

      {stall.description && <p className="lead">{stall.description}</p>}

      <div className="row-actions">
        {onMap && (
          <Link className="btn btn--go" href={`/map?stall=${stall.number}`}>
            Show on the map
          </Link>
        )}
        {stall.instagram && (
          <a className="btn btn--line" href={`https://instagram.com/${stall.instagram}`} target="_blank" rel="noreferrer">
            Instagram @{stall.instagram}
          </a>
        )}
        {staff && (
          <Link className="btn btn--dark" href={`/judge?s=${stall.number}`}>
            Score this stall
          </Link>
        )}
      </div>

      <CustomerVote stallNumber={stall.number} stallName={stall.name} initial={myVote} open={votingOpen} verified={Boolean(voter)} siteKey={turnstileSiteKey()} />

      {videos.length > 0 && (
        <section className="stack">
          <h2>Videos</h2>
          <ul className="video-links">
            {videos.map((v) => (
              <li key={v.url}>
                <a href={v.url} target="_blank" rel="noreferrer">
                  {v.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="pager" aria-label="Other stalls">
        <Link href={`/stalls/${prev.number}`}>Stall {prev.number}</Link>
        <Link href={`/stalls/${next.number}`}>Stall {next.number}</Link>
      </nav>
    </div>
  );
}
