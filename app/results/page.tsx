import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { CUSTOMER_CHOICE } from '@/lib/awards';
import { getResultsPublished, leaderboards, listCompetitions, voteTallies } from '@/lib/repo';
import { CANOPY, fmtScore, maxTotal } from '@/lib/shared';

export const metadata: Metadata = { title: 'Results' };

export default async function ResultsPage() {
  const [published, session] = await Promise.all([getResultsPublished(), getSession()]);
  const isAdmin = session?.role === 'admin';

  if (!published && !isAdmin) {
    return (
      <div className="page page--narrow">
        <header className="page-head">
          <h1>Results</h1>
          <p className="lead">Winners are announced at the closing ceremony. They will appear here once the committee publishes them.</p>
        </header>
        <p>
          <Link className="btn btn--line" href="/stalls">
            Browse the stalls meanwhile
          </Link>
        </p>
      </div>
    );
  }

  const [competitions, boards, votes] = await Promise.all([listCompetitions(), leaderboards(), voteTallies()]);
  const topVotes = votes.filter((v) => v.rank <= 3);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Results</h1>
        {!published && (
          <p className="note note--warn">Only admins can see this page. Publish results in the admin console to show it to everyone.</p>
        )}
      </header>
      <div className="podiums">
        {competitions.map((c) => {
          const top = (boards[String(c.id)] ?? []).filter((r) => r.rank <= 3);
          return (
            <section key={c.id} className="podium">
              <h2>{c.name}</h2>
              {top.length === 0 ? (
                <p className="muted">No scores yet.</p>
              ) : (
                <ol className="podium-list">
                  {top.map((r) => (
                    <li key={r.stallNumber} className={`place place--${r.rank}`}>
                      <span className="place-rank">{r.rank}</span>
                      <span className="stall-plate stall-plate--small" style={{ background: CANOPY[r.colour ?? 'none'].fill, color: CANOPY[r.colour ?? 'none'].ink }}>
                        {r.stallNumber}
                      </span>
                      <Link href={`/stalls/${r.stallNumber}`} className="place-name">
                        {r.stallName}
                      </Link>
                      <span className="place-score">
                        {r.average.toFixed(2)}
                        <span className="muted"> / {fmtScore(maxTotal(c))}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
        <section className="podium">
          <h2>{CUSTOMER_CHOICE.name}</h2>
          {topVotes.length === 0 ? (
            <p className="muted">No votes yet.</p>
          ) : (
            <ol className="podium-list">
              {topVotes.map((r) => (
                <li key={r.stallNumber} className={`place place--${r.rank}`}>
                  <span className="place-rank">{r.rank}</span>
                  <span className="stall-plate stall-plate--small" style={{ background: CANOPY[r.colour ?? 'none'].fill, color: CANOPY[r.colour ?? 'none'].ink }}>
                    {r.stallNumber}
                  </span>
                  <Link href={`/stalls/${r.stallNumber}`} className="place-name">
                    {r.stallName}
                  </Link>
                  <span className="place-score">
                    {r.likes}
                    <span className="muted"> {r.likes === 1 ? 'like' : 'likes'}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
