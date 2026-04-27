'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface BatchUploadOverlayProps {
  /** Whether the overlay should be visible */
  active: boolean;
  /** Label shown in the floating bar */
  label: string;
  /** Current progress count */
  current: number;
  /** Total items count */
  total: number;
  /** Route to navigate to when user clicks the floating bar */
  returnPath?: string;
  /** Whether the operation is done (show checkmark instead of spinner) */
  done?: boolean;
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
 * 2. Floating results summary — after submit completes (if results provided)
 * 3. beforeunload warning to prevent accidental page close
 */
export default function BatchUploadOverlay({
  active,
  label,
  current,
  total,
  returnPath,
  done,
  onExpand,
  onCancel,
  results,
  onDismiss,
}: BatchUploadOverlayProps) {
  const router = useRouter();
  // Block page close during active operation (not when done)
  useEffect(() => {
    if (!active || done) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active, done]);

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const showResults = active && done && results && results.length > 0;

  if (!active) return null;

  // ═══ FLOATING RESULTS SUMMARY (submit done) ═══
  if (showResults) {
    return (
      <div className="fixed bottom-6 right-6 z-30 bg-white shadow-2xl border border-[#E0E3E5] w-[360px] animate-in">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[var(--match-green)] flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {results!.filter(r => r.ok).length} succeeded, {results!.filter(r => !r.ok).length} failed
              </p>
            </div>
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
    );
  }

  // ═══ FLOATING PROGRESS / DONE BAR ═══
  return (
    <div
      className="fixed bottom-6 right-6 z-30 bg-white shadow-2xl border border-[#E0E3E5] w-[320px] animate-in cursor-pointer"
      onClick={() => { if (returnPath) router.push(returnPath); else onExpand?.(); }}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {done ? (
          <div className="w-5 h-5 rounded-full bg-[var(--match-green)] flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
        ) : (
          <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
          {!done && <p className="text-xs text-[var(--text-secondary)]">{current} of {total}</p>}
        </div>
        {!done && <span className="text-sm font-bold tabular-nums text-[var(--primary)]">{pct}%</span>}
      </div>
      {!done && (
        <div className="h-1 bg-[var(--surface-low)]">
          <div className="h-1 transition-all" style={{ backgroundColor: 'var(--primary)', width: `${pct}%` }} />
        </div>
      )}
      {(returnPath || onExpand || onCancel) && (
        <div className="px-4 pb-2 flex items-center justify-between">
          {(returnPath || onExpand) && (
            <span className="text-[10px] text-[var(--text-secondary)]">
              {done ? 'Click to review' : returnPath ? 'Click to go back' : 'Click to expand'}
            </span>
          )}
          {!returnPath && !onExpand && <span />}
          {onCancel && (
            <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="text-[10px] text-[var(--reject-red)] hover:opacity-80 font-medium">Cancel</button>
          )}
        </div>
      )}
    </div>
  );
}
