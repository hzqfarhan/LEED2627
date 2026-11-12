import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="page page--narrow">
      <header className="page-head">
        <h1>You are offline</h1>
        <p className="lead">
          This page has not been opened on this phone before, so it cannot be shown without a connection.
        </p>
      </header>
      <p>
        If you were judging, go back to the judging page: it works offline once it has been opened, and your scores are kept on this
        phone until the connection returns.
      </p>
      <p>
        <a className="btn btn--dark" href="/judge">
          Back to judging
        </a>
      </p>
    </div>
  );
}
