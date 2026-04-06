'use client';

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
  if (!hasMore) return null;

  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-3">
      <p className="text-[12px] text-amber-700">
        Showing <span className="font-semibold">{loadedCount}</span> of <span className="font-semibold">{totalCount.toLocaleString()}</span> records. Use date filters to narrow results, or load all.
      </p>
      <button
        onClick={onLoadAll}
        disabled={loading}
        className="text-[11px] px-3 py-1 text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors disabled:opacity-50"
      >
        {loading ? 'Loading...' : `Load all ${totalCount.toLocaleString()}`}
      </button>
    </div>
  );
}
