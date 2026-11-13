import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { CATEGORIES, CUSTOMER_CHOICE, VIRAL_VIDEO } from '@/lib/awards';
import { getResultsPublished, leaderboards, listCompetitions, stallAwards, viralTallies, voteTallies } from '@/lib/repo';
import { CANOPY, fmtScore, maxTotal, type StallColour } from '@/lib/shared';

export const metadata: Metadata = { title: 'Results' };

export default async function ResultsPage() {
  const [published, session] = await Promise.all([getResultsPublished(), getSession()]);
  const isAdmin = session?.role === 'admin';

  if (!published && !isAdmin) {
    return (
      <div className="page page--narrow">
        <PageHero
          title="Results"
          lead="Winners are announced at the closing ceremony. They appear here once the committee publishes them."
          kind="trophy"
          art="A low-poly gold trophy with a pink star"
        />
        <p>
          <Link className="btn btn--line" href="/stalls">
            Browse the stalls meanwhile
          </Link>
        </p>
      </div>
    );
  }

  const [competitions, boards, votes, stallBoards, viral] = await Promise.all([
    listCompetitions(),
    leaderboards(),
    voteTallies(),
    stallAwards(),
    viralTallies(),
  ]);

  // One list of podiums in the order the categories are announced.
  const podiums = CATEGORIES.map((cat) => {
    const sb = stallBoards.find((b) => b.slug === cat.slug);
    const comp = competitions.find((c) => c.slug === cat.slug);
    let rows: PlaceRow[] = [];
    if (sb) {
      rows = sb.rows.map((r) => ({ ...r, score: fmtScore(r.total), unit: `/ ${fmtScore(sb.juryMarks + sb.customerMarks)}` }));
    } else if (comp) {
      rows = (boards[String(comp.id)] ?? []).map((r) => ({ ...r, score: r.average.toFixed(2), unit: `/ ${fmtScore(maxTotal(comp))}` }));
    } else if (cat.slug === VIRAL_VIDEO.slug) {
      rows = viral.map((r) => ({ ...r, score: r.total.toLocaleString('en-MY'), unit: 'likes + shares' }));
    } else if (cat.slug === CUSTOMER_CHOICE.slug) {
      rows = votes.map((r) => ({ ...r, score: String(r.likes), unit: r.likes === 1 ? 'like' : 'likes' }));
    }
    return { cat, rows: rows.filter((r) => r.rank <= cat.places) };
  });

  return (
    <div className="page">
      <PageHero
        title="Results"
        lead="The top places in every LEED 26 award."
        kind="trophy"
        art="A low-poly gold trophy with a pink star"
      >
        {!published && <p className="note note--warn">Only admins can see this page. Publish results in the admin console to show it to everyone.</p>}
      </PageHero>
      <div className="podiums">
        {podiums.map(({ cat, rows }) => (
          <section key={cat.slug} className="podium">
            <h2>{cat.name}</h2>
            <p className="muted podium-how">
              {cat.how}
              {cat.places === 1 ? '. One winner.' : '.'}
            </p>
            {rows.length === 0 ? (
              <p className="muted">No results yet.</p>
            ) : (
              <ol className="podium-list">
                {rows.map((r) => (
                  <li key={r.stallNumber} className={`place place--${r.rank}`}>
                    <span className="place-rank">{r.rank}</span>
                    <span className="stall-plate stall-plate--small" style={{ background: CANOPY[r.colour ?? 'none'].fill, color: CANOPY[r.colour ?? 'none'].ink }}>
                      {r.stallNumber}
                    </span>
                    <Link href={`/stalls/${r.stallNumber}`} className="place-name">
                      {r.stallName}
                    </Link>
                    <span className="place-score">
                      {r.score}
                      <span className="muted"> {r.unit}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

interface PlaceRow {
  stallNumber: number;
  stallName: string;
  colour: StallColour | null;
  rank: number;
  score: string;
  unit: string;
}
