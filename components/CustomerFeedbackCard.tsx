import type { CustomerFeedback } from '@/lib/shared';

function Stars({ value }: { value: number }) {
  return (
    <span className="cf-stars" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="cf-stars-on" style={{ width: `${(value / 5) * 100}%` }} aria-hidden="true">
        ★★★★★
      </span>
      <span aria-hidden="true">★★★★★</span>
    </span>
  );
}

/** People Choice votes and star ratings for one stall. */
export default function CustomerFeedbackCard({ feedback, title = 'What customers think', note, votingOpen }: { feedback: CustomerFeedback; title?: string; note?: string; votingOpen?: boolean }) {
  const { likes, dislikes, raters, elements } = feedback;
  const votes = likes + dislikes;
  const pct = votes ? Math.round((likes / votes) * 100) : 0;
  const rated = elements.filter((e) => e.count > 0);
  const overall = rated.length ? rated.reduce((a, e) => a + e.average, 0) / rated.length : 0;

  return (
    <section className="card stack cf">
      <div className="cf-head">
        <div>
          <h3>{title}</h3>
          {note && <p className="muted">{note}</p>}
        </div>
        {votingOpen !== undefined && <span className={`pill ${votingOpen ? 'pill--ok' : 'pill--off'}`}>{votingOpen ? 'Voting open' : 'Voting closed'}</span>}
      </div>

      <div className="cf-tiles">
        <div className="cf-tile cf-tile--like">
          <span className="cf-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 21s-7.5-4.6-9.5-9.4C1.2 8.3 3.3 5 6.6 5c2 0 3.6 1.1 5.4 3 1.8-1.9 3.4-3 5.4-3 3.3 0 5.4 3.3 4.1 6.6C19.5 16.4 12 21 12 21Z" />
            </svg>
          </span>
          <strong>{likes}</strong>
          <span>{likes === 1 ? 'like' : 'likes'}</span>
        </div>
        <div className="cf-tile">
          <strong>{dislikes}</strong>
          <span>not for me</span>
        </div>
        <div className="cf-tile">
          <strong>{raters}</strong>
          <span>{raters === 1 ? 'person rated' : 'people rated'}</span>
        </div>
        <div className="cf-tile cf-tile--stars">
          <strong>{rated.length ? overall.toFixed(1) : '-'}</strong>
          <span>average stars</span>
        </div>
      </div>

      {votes > 0 && (
        <div className="cf-split" aria-label={`${pct}% of ${votes} votes are likes`}>
          <span className="cf-split-like" style={{ width: `${pct}%` }} />
          <span className="cf-split-text">
            <strong>{pct}%</strong> of {votes} {votes === 1 ? 'vote' : 'votes'} liked it
          </span>
        </div>
      )}

      {votes === 0 && raters === 0 ? (
        <p className="muted">No votes yet. Ask customers to open your stall page (scan your QR or search your stall number) and tap “I like it” and the stars.</p>
      ) : (
        <ul className="cf-elements">
          {elements.map((e) => {
            const top = Math.max(1, ...e.spread);
            return (
              <li key={e.id}>
                <span className="cf-el-name">
                  <strong>{e.name}</strong>
                  <small>{e.count ? `${e.count} ${e.count === 1 ? 'rating' : 'ratings'}` : 'not rated yet'}</small>
                </span>
                <span className="cf-el-score">
                  <Stars value={e.average} />
                  <strong>{e.count ? e.average.toFixed(1) : '-'}</strong>
                </span>
                <span className="cf-spread" aria-label={`1 to 5 stars: ${e.spread.join(', ')}`}>
                  {e.spread.map((n, i) => (
                    <span key={i} title={`${i + 1} star${i ? 's' : ''}: ${n}`}>
                      <i style={{ height: `${(n / top) * 100}%` }} />
                      <small>{i + 1}</small>
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
