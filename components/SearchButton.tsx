'use client';

/**
 * Big search button for page headers.
 * Dispatches 'open-global-search' event → Sidebar catches it and opens GlobalSearch modal.
 * Includes today's date display beside the button.
 */
export default function SearchButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('open-global-search'))}
      className="btn-thick-navy px-4 py-2 text-xs font-medium gap-2"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
      </svg>
      Search
    </button>
  );
}
