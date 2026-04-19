'use client';

import { useEffect } from 'react';

interface BatchUploadOverlayProps {
  /** Whether a batch operation is actively running */
  active: boolean;
  /** Label shown in the floating bar, e.g. "Uploading invoices..." or "Scanning documents..." */
  label: string;
  /** Current progress count */
  current: number;
  /** Total items count */
  total: number;
  /** Show "Click to expand" footer — user can click to reopen a minimized modal */
  onExpand?: () => void;
  /** Show "Cancel" button in footer */
  onCancel?: () => void;
  /** Completed batch results — when set, shows results summary instead of progress spinner */
  results?: { name: string; ok: boolean; msg: string }[];
  /** Called when user clicks "Done" on the results summary */
  onDismiss?: () => void;
}

/**
 * Shared overlay for all batch upload operations.
 * Renders:
 * 1. Floating progress bar (bottom-right) — during active upload/scan
 * 2. Floating results summary — after batch completes (if results provided)
 * 3. Sidebar navigation blocker with hover tooltip
 * 4. beforeunload warning to prevent accidental page close
 */
export default function BatchUploadOverlay({
  active,
  label,
  current,
  total,
  onExpand,
  onCancel,
  results,
  onDismiss,
}: BatchUploadOverlayProps) {
  // Block page close during active upload
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const showResults = !active && results && results.length > 0;

  return (
    <>
      {/* ═══ FLOATING PROGRESS BAR ═══ */}
      {active && (
        <div
          className="fixed bottom-6 right-6 z-30 bg-white shadow-2xl border border-[#E0E3E5] w-[320px] animate-in cursor-pointer"
          onClick={() => onExpand?.()}
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
              <p className="text-xs text-[var(--text-secondary)]">{current} of {total}</p>
            </div>
            <span className="text-sm font-bold tabular-nums text-[var(--primary)]">{pct}%</span>
          </div>
          <div className="h-1 bg-[var(--surface-low)]">
            <div className="h-1 transition-all" style={{ backgroundColor: 'var(--primary)', width: `${pct}%` }} />
          </div>
          {(onExpand || onCancel) && (
            <div className="px-4 pb-2 flex items-center justify-between">
              {onExpand && <span className="text-[10px] text-[var(--text-secondary)]">Click to expand</span>}
              {!onExpand && <span />}
              {onCancel && (
                <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="text-[10px] text-[var(--reject-red)] hover:opacity-80 font-medium">Cancel</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ FLOATING RESULTS SUMMARY ═══ */}
      {showResults && (
        <div className="fixed bottom-6 right-6 z-30 bg-white shadow-2xl border border-[#E0E3E5] w-[360px] animate-in">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Upload complete</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {results!.filter(r => r.ok).length} succeeded, {results!.filter(r => !r.ok).length} failed
              </p>
            </div>
            {onDismiss && (
              <button onClick={onDismiss} className="btn-thick-green px-3 py-1.5 text-xs font-medium">Done</button>
            )}
          </div>
          <div className="max-h-[200px] overflow-y-auto border-t border-[var(--surface-low)]">
            {results!.map((r, i) => (
              <div key={i} className={`text-xs px-4 py-1.5 ${r.ok ? 'text-[var(--match-green)]' : 'text-[var(--reject-red)]'}`}>
                <span className="font-medium">{r.name}</span>: {r.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ NAV BLOCKER ═══ */}
      {active && (
        <>
          <style>{`.w-52 a, .w-52 button, .w-52 select { pointer-events: none !important; opacity: 0.5 !important; }`}</style>
          <div
            className="fixed left-0 top-0 w-52 h-full z-[60] cursor-not-allowed"
            title="Navigation blocked — upload in progress"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          >
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[var(--text-primary)] text-white text-[10px] font-medium px-3 py-1.5 opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
              Upload in progress — please wait
            </div>
          </div>
        </>
      )}
    </>
  );
}
