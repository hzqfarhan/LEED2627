'use client';

import { useState } from 'react';
import { CUSTOMER_CHOICE } from '@/lib/awards';
import type { RatingCriterion } from '@/lib/shared';

interface Props {
  stallNumber: number;
  stallName: string;
  /** This phone's current vote, read from its cookie on the server. */
  initial: boolean | null;
  open: boolean;
  /** Signed in with UTHM SSO. Voting and rating need an account (one per person). */
  signedIn: boolean;
  /** The viewer is on this stall's team, so they cannot vote for it. */
  ownStall: boolean;
  /** Stall elements visitors rate with 1 to 5 stars. */
  criteria: RatingCriterion[];
  /** This phone's earlier stars: criterion id -> stars. */
  initialRatings: Record<string, number>;
}

const STAR = 'M12 2.800l2.800 5.800 6.300.900-4.600 4.400 1.100 6.300L12 17.200 6.400 20.200l1.100-6.300L2.900 9.500l6.300-.900z';
const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export default function CustomerVote({ stallNumber, stallName, initial, open, signedIn, ownStall, criteria, initialRatings }: Props) {
  const [stars, setStars] = useState<Record<string, number>>(initialRatings);
  const [saved, setSaved] = useState<Record<string, number>>(initialRatings);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMsg, setRateMsg] = useState<string | null>(null);
  const [vote, setVote] = useState<boolean | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (liked: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stall: stallNumber, liked }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg(body?.error ?? 'Your vote could not be sent. Try again.');
      } else {
        setVote(liked);
        setMsg(liked ? `Thanks. Your like counts towards the ${CUSTOMER_CHOICE.name}.` : 'Thanks for your feedback.');
      }
    } catch {
      setMsg('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const rated = criteria.filter((k) => stars[String(k.id)]).length;
  const changed = criteria.some((k) => stars[String(k.id)] !== saved[String(k.id)]);
  const hasSaved = Object.keys(saved).length > 0;

  const sendRating = async () => {
    setRateBusy(true);
    setRateMsg(null);
    try {
      const res = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stall: stallNumber, ratings: stars }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setRateMsg(body?.error ?? 'Your rating could not be sent. Try again.');
      } else {
        setSaved({ ...stars });
        setRateMsg('Thanks. Your stars count towards Outstanding Stall and the stall element awards.');
      }
    } catch {
      setRateMsg('No connection. Check your internet and try again.');
    } finally {
      setRateBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="vote">
        <h2>{CUSTOMER_CHOICE.name}</h2>
        <p className="muted">Voting and rating are closed.</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="vote vote--gate" aria-labelledby="vote-title">
        <h2 id="vote-title">Bought from {stallName}?</h2>
        <p className="muted">
          Sign in with your UTHM account to like this stall for the {CUSTOMER_CHOICE.name} and rate it with stars. Your stars count for half of
          every stall award.
        </p>
        <div>
          <a className="btn btn--go" href={`/api/auth/sso?next=${encodeURIComponent(`/stalls/${stallNumber}`)}`}>
            Sign in with UTHM SSO to vote
          </a>
        </div>
      </section>
    );
  }

  if (ownStall) {
    return (
      <section className="vote" aria-labelledby="vote-title">
        <h2 id="vote-title">This is your stall</h2>
        <p className="muted">Teams cannot like or rate their own stall. Ask your customers to open this page and vote.</p>
      </section>
    );
  }

  return (
    <section className="vote" aria-labelledby="vote-title">
      <div>
        <h2 id="vote-title">Did you like {stallName}?</h2>
        <p className="muted">One vote per UTHM account, and you can change it while voting is open. The stall with the most likes wins the {CUSTOMER_CHOICE.name}.</p>
      </div>
      <div className="vote-buttons">
        <button type="button" className="vote-btn vote-btn--like" aria-pressed={vote === true} disabled={busy} onClick={() => void send(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 11v9H4v-9zM7 11l4-7c1.700 0 2.700 1.200 2.300 2.900L12.800 10H19a2 2 0 0 1 2 2.300l-1.200 6A2 2 0 0 1 17.800 20H7" />
          </svg>
          I like it
        </button>
        <button type="button" className="vote-btn vote-btn--no" aria-pressed={vote === false} disabled={busy} onClick={() => void send(false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17 13V4h3v9zM17 13l-4 7c-1.700 0-2.700-1.200-2.300-2.900L11.200 14H5a2 2 0 0 1-2-2.300l1.200-6A2 2 0 0 1 6.200 4H17" />
          </svg>
          Not for me
        </button>
      </div>
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}

      {criteria.length > 0 && (
        <div className="rate" aria-labelledby="rate-title">
          <div>
            <h3 id="rate-title">Rate {stallName}</h3>
            <p className="muted">Your stars make up half of the marks for Outstanding Stall, Hottest Product and the other stall awards. Judges give the other half.</p>
          </div>
          <ul className="rate-list">
            {criteria.map((k) => {
              const v = stars[String(k.id)] ?? 0;
              return (
                <li key={k.id} className="rate-row">
                  <div className="rate-q">
                    <strong>{k.question}</strong>
                    <span className="muted">
                      {k.name}
                      {v ? `: ${WORDS[v]}` : ''}
                    </span>
                  </div>
                  <div className="stars" role="radiogroup" aria-label={`${k.question} (${k.name})`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={v === n}
                        aria-label={`${n} star${n > 1 ? 's' : ''}, ${WORDS[n]}`}
                        className={`star${n <= v ? ' is-on' : ''}`}
                        data-sfx="tick"
                        onClick={() => setStars((s) => ({ ...s, [String(k.id)]: n }))}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d={STAR} />
                        </svg>
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="rate-foot">
            <button
              type="button"
              className="btn btn--go"
              data-sfx="save"
              disabled={rateBusy || rated === 0 || !changed}
              onClick={() => void sendRating()}
            >
              {rateBusy ? 'Sending…' : hasSaved ? 'Update my rating' : 'Send my rating'}
            </button>
            <span className="muted">
              {rated} of {criteria.length} rated
            </span>
          </div>
          {rateMsg && (
            <p className="muted" role="status">
              {rateMsg}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
