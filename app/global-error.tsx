'use client';

/**
 * Catches errors in the root layout itself.
 * Must render its own <html>/<body> since the root layout may have failed.
 * Cannot rely on CSS vars or globals.css loading — uses inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "'Lato', 'Inter', -apple-system, sans-serif", background: '#F7F9FB', color: '#191C1E' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '1.5rem' }}>
              {error.message || 'A critical error occurred. Please try again.'}
            </p>
            <button
              onClick={reset}
              style={{
                padding: '8px 20px',
                fontSize: '0.875rem',
                fontWeight: 700,
                color: '#fff',
                background: '#234B6E',
                border: 'none',
                cursor: 'pointer',
                marginRight: '0.75rem',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '8px 20px',
                fontSize: '0.875rem',
                fontWeight: 700,
                color: '#191C1E',
                background: '#fff',
                border: '1px solid #D1D5DB',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
