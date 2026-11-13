'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import OopsScreen from '@/components/OopsScreen';

/** Shown when a page fails to load. Scores saved on a phone stay queued and are sent later. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <OopsScreen
      code={error.digest ?? null}
      title={offline ? 'You are offline' : 'This page did not load'}
      actions={
        <>
          <button type="button" className="btn btn--go" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn btn--line" href="/">
            Go to the home page
          </Link>
        </>
      }
    >
      <p>
        {offline
          ? 'Check your mobile data or Wi-Fi, then try again. Scores and votes you already saved on this phone are kept and sent when you are back online.'
          : 'Something went wrong on our side while opening this page. Try again in a moment; your saved scores, votes and stall details are safe.'}
      </p>
    </OopsScreen>
  );
}
