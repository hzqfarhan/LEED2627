'use client';

/** Last resort when even the site layout fails. Kept self-contained: no site CSS or fonts are loaded here. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#2b0b5e', fontFamily: 'system-ui, sans-serif', color: '#fff', padding: 20 }}>
        <main style={{ maxWidth: 420, textAlign: 'center', background: '#fff', color: '#1f0a45', borderRadius: 24, border: '3px solid #1f0a45', boxShadow: '0 8px 0 #1f0a45', padding: '28px 24px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/leed-logo-small.webp" width={180} height={121} alt="LEED 26" style={{ display: 'block', margin: '0 auto 8px' }} />
          <h1 style={{ fontSize: 26, margin: '8px 0' }}>LEED 26 could not load</h1>
          <p style={{ lineHeight: 1.5, color: '#5b5273' }}>Something went wrong on our side. Try again in a moment; anything you saved is safe.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 8, padding: '12px 22px', borderRadius: 999, border: '3px solid #1f0a45', background: '#ffd91a', color: '#1f0a45', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}
          >
            Try again
          </button>
          {error.digest && <p style={{ marginTop: 16, fontSize: 13, color: '#5b5273' }}>Error code {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
