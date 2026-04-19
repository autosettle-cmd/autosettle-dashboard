'use client';

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchJob {
  id: string;
  /** 'invoice' | 'bank_recon' — identifies what kind of upload */
  type: string;
  label: string;
  phase: 'scanning' | 'submitting' | 'review' | 'done' | 'cancelled';
  current: number;
  total: number;
  /** URL to navigate back to when expanding */
  returnUrl?: string;
  /** Callback to cancel the operation (only during scanning) */
  onCancel?: () => void;
  /** Arbitrary data payload — survives navigation (e.g. scanned batch items) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

interface BatchUploadContextType {
  jobs: BatchJob[];
  upsertJob: (job: BatchJob) => void;
  removeJob: (id: string) => void;
  getJob: (id: string) => BatchJob | undefined;
  hasPendingReview: (type: string) => boolean;
  /** Register expand handler — component calls this on mount, unregisters on unmount */
  registerExpandHandler: (jobId: string, handler: () => void) => void;
  unregisterExpandHandler: (jobId: string) => void;
}

const BatchUploadContext = createContext<BatchUploadContextType | null>(null);

export function useBatchUpload() {
  const ctx = useContext(BatchUploadContext);
  if (!ctx) throw new Error('useBatchUpload must be used within BatchUploadProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BatchUploadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const router = useRouter();

  const upsertJob = useCallback((job: BatchJob) => {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === job.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = job;
        return next;
      }
      return [...prev, job];
    });
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  }, []);

  const getJob = useCallback((id: string) => {
    return jobsRef.current.find(j => j.id === id);
  }, []);

  const hasPendingReview = useCallback((type: string) => {
    return jobsRef.current.some(j => j.type === type && j.phase === 'review');
  }, []);

  // Expand handlers registered by mounted page components
  const expandHandlers = useRef<Record<string, () => void>>({});

  const registerExpandHandler = useCallback((jobId: string, handler: () => void) => {
    expandHandlers.current[jobId] = handler;
  }, []);

  const unregisterExpandHandler = useCallback((jobId: string) => {
    delete expandHandlers.current[jobId];
  }, []);

  // Visible jobs = scanning, submitting, or review (not done/cancelled)
  const visibleJobs = jobs.filter(j => j.phase === 'scanning' || j.phase === 'submitting' || j.phase === 'review');

  const handleExpand = (job: BatchJob) => {
    // If the source component is mounted, use its handler directly
    if (expandHandlers.current[job.id]) {
      expandHandlers.current[job.id]();
      return;
    }
    // Otherwise navigate to the source page (component will auto-open on mount)
    if (job.returnUrl) {
      router.push(job.returnUrl);
    }
  };

  return (
    <BatchUploadContext.Provider value={{ jobs, upsertJob, removeJob, getJob, hasPendingReview, registerExpandHandler, unregisterExpandHandler }}>
      {children}

      {/* ── Global Floating Progress / Review Bars ── */}
      {visibleJobs.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 w-[340px]">
          {visibleJobs.map(job => {
            const pct = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
            const isActive = job.phase === 'scanning' || job.phase === 'submitting';
            const isReview = job.phase === 'review';

            return (
              <div
                key={job.id}
                className="bg-white shadow-2xl border border-[#E0E3E5] animate-in cursor-pointer"
                onClick={() => handleExpand(job)}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  {isActive ? (
                    <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[var(--match-green)] flex items-center justify-center flex-shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {isReview ? 'Scan complete — review items' : job.label}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {isReview ? `${job.total} items ready` : `${job.current} of ${job.total}`}
                    </p>
                  </div>
                  {isActive && (
                    <span className="text-sm font-bold tabular-nums text-[var(--primary)]">{pct}%</span>
                  )}
                </div>
                {isActive && (
                  <div className="h-1 bg-[var(--surface-low)]">
                    <div
                      className="h-1 transition-all"
                      style={{ backgroundColor: 'var(--primary)', width: `${pct}%` }}
                    />
                  </div>
                )}
                <div className="px-4 pb-2 flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {isReview ? 'Click to review' : 'Click to expand'}
                  </span>
                  {isActive && job.onCancel && (
                    <button
                      onClick={(e) => { e.stopPropagation(); job.onCancel?.(); }}
                      className="text-[10px] text-[var(--reject-red)] hover:opacity-80 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                  {isReview && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                      className="text-[10px] text-[var(--text-secondary)] hover:opacity-80 font-medium"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BatchUploadContext.Provider>
  );
}
