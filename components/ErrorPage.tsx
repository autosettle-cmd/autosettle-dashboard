'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
  dashboardHref = '/',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  dashboardHref?: string;
}) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--surface-base)' }}>
      <div className="text-center max-w-md space-y-4">
        <div className="w-12 h-12 mx-auto flex items-center justify-center bg-red-50 border border-red-200">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Something went wrong
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        {error.digest && (
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={reset} className="btn-primary px-4 py-2 text-sm font-bold">
            Try again
          </button>
          <a href={dashboardHref} className="btn-thick-white px-4 py-2 text-sm font-bold inline-block">
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
