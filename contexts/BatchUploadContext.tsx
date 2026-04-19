'use client';

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchJob {
  id: string;
  /** 'invoice' | 'bank_recon' — identifies what kind of upload */
  type: string;
  label: string;
  phase: 'scanning' | 'submitting' | 'done' | 'cancelled';
  current: number;
  total: number;
  /** Callback to re-open the full modal on the source page */
  onExpand?: () => void;
  /** Callback to cancel the operation */
  onCancel?: () => void;
  /** Results summary once done */
  result?: { ok: number; fail: number; messages: string[] };
}

interface BatchUploadContextType {
  /** Active batch jobs */
  jobs: BatchJob[];
  /** Register or update a batch job */
  upsertJob: (job: BatchJob) => void;
  /** Remove a job by id */
  removeJob: (id: string) => void;
  /** Get a job by id */
  getJob: (id: string) => BatchJob | undefined;
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

  // Active jobs = not done/cancelled
  const activeJobs = jobs.filter(j => j.phase === 'scanning' || j.phase === 'submitting');

  return (
    <BatchUploadContext.Provider value={{ jobs, upsertJob, removeJob, getJob }}>
      {children}

      {/* ── Global Floating Progress Bars ── */}
      {activeJobs.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 w-[320px]">
          {activeJobs.map(job => {
            const pct = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
            return (
              <div
                key={job.id}
                className="bg-white shadow-2xl border border-[#E0E3E5] animate-in cursor-pointer"
                onClick={() => job.onExpand?.()}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{job.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{job.current} of {job.total}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-[var(--primary)]">{pct}%</span>
                </div>
                <div className="h-1 bg-[var(--surface-low)]">
                  <div
                    className="h-1 transition-all"
                    style={{ backgroundColor: 'var(--primary)', width: `${pct}%` }}
                  />
                </div>
                <div className="px-4 pb-2 flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {job.onExpand ? 'Click to expand' : job.phase === 'submitting' ? 'Uploading...' : 'Processing...'}
                  </span>
                  {job.onCancel && (
                    <button
                      onClick={(e) => { e.stopPropagation(); job.onCancel?.(); }}
                      className="text-[10px] text-[var(--reject-red)] hover:opacity-80 font-medium"
                    >
                      Cancel
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
