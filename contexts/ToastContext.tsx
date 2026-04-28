'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  /** Show a toast. Auto-dismisses after 4s. */
  showToast: (type: ToastType, message: string, detail?: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Icons ─────────────────────────────────────────────────────────────────────

const icons: Record<ToastType, { bg: string; path: string }> = {
  success: {
    bg: 'var(--match-green)',
    path: 'M20 6L9 17l-5-5',
  },
  error: {
    bg: 'var(--reject-red)',
    path: 'M18 6L6 18M6 6l12 12',
  },
  info: {
    bg: 'var(--primary)',
    path: 'M12 8v4m0 4h.01',
  },
};

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string, detail?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, type, message, detail }]);
    setTimeout(() => dismissToast(id), 4000);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      {/* Toast stack — bottom-right, above batch overlay */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '360px' }}>
          {toasts.map((toast) => {
            const icon = icons[toast.type];
            return (
              <div
                key={toast.id}
                className="pointer-events-auto bg-white shadow-2xl border border-[#E0E3E5] animate-in flex items-start gap-3 px-4 py-3"
                style={{ animation: 'fade-in-up 0.25s ease-out' }}
              >
                <div
                  className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: icon.bg, borderRadius: '2px' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={icon.path} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{toast.message}</p>
                  {toast.detail && (
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {toast.detail.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex-shrink-0 mt-0.5 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
