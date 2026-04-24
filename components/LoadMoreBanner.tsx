'use client';

import { useState } from 'react';

/**
 * Shows a banner when the API returns hasMore=true (more than 100 records).
 * Offers the user to either adjust date filters or load all records.
 */
export default function LoadMoreBanner({
  hasMore,
  totalCount,
  loadedCount,
  onLoadAll,
  loading,
}: {
  hasMore: boolean;
  totalCount: number;
  loadedCount: number;
  onLoadAll: () => void;
  loading?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (!hasMore || dismissed) return null;

  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-3">
      <p className="text-[12px] text-amber-700">
        Showing <span className="font-semibold">{loadedCount}</span> of <span className="font-semibold">{totalCount.toLocaleString()}</span> records. Use date filters to narrow results, or load all.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onLoadAll}
          disabled={loading}
          className="text-[11px] px-3 py-1 text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : `Load all ${totalCount.toLocaleString()}`}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700 transition-colors p-0.5"
          title="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
