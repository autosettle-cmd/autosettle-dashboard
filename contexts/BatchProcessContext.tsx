'use client';

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import BatchUploadOverlay from '@/components/BatchUploadOverlay';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BatchPhase = 'idle' | 'scanning' | 'scan_done' | 'submitting' | 'submit_done';

export interface BatchJob {
  phase: BatchPhase;
  label: string;
  returnPath: string;
  current: number;
  total: number;
}

export interface BatchProcessContextValue {
  /** Current job state */
  job: BatchJob;

  /** Generic items array — page casts to its own BatchItem type */
  items: any[];
  setItems: (updater: (prev: any[]) => any[]) => void;

  /** Submit results after startSubmit completes */
  submitResults: { name: string; ok: boolean; msg: string }[] | null;

  /** Start a scan loop — worker runs per item, can update items via updateItem */
  startScan: (config: {
    label: string;
    returnPath: string;
    items: any[];
    worker: (
      item: any,
      index: number,
      updateItem: (id: string, updates: Record<string, any>) => void,
    ) => Promise<void>;
  }) => void;

  /** Start a submit loop — worker runs per item, returns result per item */
  startSubmit: (config: {
    label: string;
    items: any[];
    worker: (item: any, index: number) => Promise<{ name: string; ok: boolean; msg: string }>;
  }) => void;

  /** Cancel current scan */
  cancel: () => void;

  /** Dismiss the overlay bar (go to idle) but keep items */
  dismiss: () => void;

  /** Clear everything — resets to idle and wipes items */
  clear: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const BatchProcessContext = createContext<BatchProcessContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────────

export function BatchProcessProvider({ children }: { children: ReactNode }) {

  const [job, setJob] = useState<BatchJob>({
    phase: 'idle',
    label: '',
    returnPath: '',
    current: 0,
    total: 0,
  });

  const [items, setItemsRaw] = useState<any[]>([]);
  const [submitResults, setSubmitResults] = useState<{ name: string; ok: boolean; msg: string }[] | null>(null);
  const cancelRef = useRef(false);

  // Stable ref to latest items so the scan loop can read current state
  const itemsRef = useRef<any[]>([]);
  const setItems = useCallback((updater: (prev: any[]) => any[]) => {
    setItemsRaw(prev => {
      const next = updater(prev);
      itemsRef.current = next;
      return next;
    });
  }, []);

  const startScan = useCallback((config: {
    label: string;
    returnPath: string;
    items: any[];
    worker: (
      item: any,
      index: number,
      updateItem: (id: string, updates: Record<string, any>) => void,
    ) => Promise<void>;
  }) => {
    // Set initial state
    cancelRef.current = false;
    setItemsRaw(config.items);
    itemsRef.current = config.items;
    setSubmitResults(null);
    setJob({
      phase: 'scanning',
      label: config.label,
      returnPath: config.returnPath,
      current: 0,
      total: config.items.length,
    });

    // Helper that workers call to update a single item by _id
    const updateItem = (id: string, updates: Record<string, any>) => {
      setItems(prev => prev.map(it => it._id === id ? { ...it, ...updates } : it));
    };

    // Run the loop (fire-and-forget — lives in the provider, survives navigation)
    (async () => {
      for (let i = 0; i < config.items.length; i++) {
        if (cancelRef.current) break;
        setJob(prev => ({ ...prev, current: i + 1 }));
        try {
          await config.worker(config.items[i], i, updateItem);
        } catch (err) {
          updateItem(config.items[i]._id, {
            ocrDone: true,
            ocrError: err instanceof Error ? err.message : 'OCR failed',
          });
        }
      }
      if (!cancelRef.current) {
        setJob(prev => ({ ...prev, phase: 'scan_done', label: 'Scan complete — click to review' }));
      } else {
        setJob(prev => ({ ...prev, phase: 'idle' }));
      }
    })();
  }, [setItems]);

  const startSubmit = useCallback((config: {
    label: string;
    items: any[];
    worker: (item: any, index: number) => Promise<{ name: string; ok: boolean; msg: string }>;
  }) => {
    cancelRef.current = false;
    setSubmitResults(null);
    setJob(prev => ({
      ...prev,
      phase: 'submitting',
      label: config.label,
      current: 0,
      total: config.items.length,
    }));

    (async () => {
      const results: { name: string; ok: boolean; msg: string }[] = [];
      for (let i = 0; i < config.items.length; i++) {
        if (cancelRef.current) break;
        setJob(prev => ({ ...prev, current: i + 1 }));
        try {
          const result = await config.worker(config.items[i], i);
          results.push(result);
        } catch {
          results.push({ name: config.items[i].file?.name || `Item ${i + 1}`, ok: false, msg: 'Network error' });
        }
      }
      setSubmitResults(results);
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => !r.ok).length;
      setJob(prev => ({ ...prev, phase: 'submit_done', label: `Upload complete — ${ok} succeeded${fail ? `, ${fail} failed` : ''}` }));
    })();
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setJob(prev => ({ ...prev, phase: 'idle' }));
  }, []);

  const dismiss = useCallback(() => {
    setJob({ phase: 'idle', label: '', returnPath: '', current: 0, total: 0 });
  }, []);

  const clear = useCallback(() => {
    cancelRef.current = true;
    setItemsRaw([]);
    itemsRef.current = [];
    setSubmitResults(null);
    setJob({ phase: 'idle', label: '', returnPath: '', current: 0, total: 0 });
  }, []);

  const showOverlay = job.phase !== 'idle';

  return (
    <BatchProcessContext.Provider value={{ job, items, setItems, submitResults, startScan, startSubmit, cancel, dismiss, clear }}>
      {children}
      <BatchUploadOverlay
        active={showOverlay}
        label={job.label}
        current={job.current}
        total={job.total}
        returnPath={job.returnPath}
        done={job.phase === 'scan_done' || job.phase === 'submit_done'}
        onExpand={job.phase === 'scan_done' ? () => {
          window.dispatchEvent(new Event('batch-scan-expand'));
        } : undefined}
        onCancel={job.phase === 'scanning' ? () => {
          if (typeof window !== 'undefined' && !confirm('Cancel scanning? Progress will be lost.')) return;
          cancel();
        } : undefined}
        results={job.phase === 'submit_done' && submitResults ? submitResults : undefined}
        onDismiss={submitResults ? clear : undefined}
      />
    </BatchProcessContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useBatchProcess() {
  const ctx = useContext(BatchProcessContext);
  if (!ctx) throw new Error('useBatchProcess must be used within BatchProcessProvider');
  return ctx;
}
