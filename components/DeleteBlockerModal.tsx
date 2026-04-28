'use client';

interface Blocker {
  label: string;
  detail: string;
}

interface Props {
  blockers: Blocker[];
  onClose: () => void;
}

export default function DeleteBlockerModal({ blockers, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-md flex flex-col">
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--reject-red)]">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">Cannot Delete</h3>
            <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mx-auto"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              This record has active links that must be removed first:
            </p>
            <div className="space-y-2">
              {blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-[var(--surface-low)] border-l-3 border-[var(--reject-red)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--reject-red)" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <path d="M18.36 19.78L12 13.41 5.64 19.78l-1.42-1.42L10.59 12 4.22 5.64l1.42-1.42L12 10.59l6.36-6.37 1.42 1.42L13.41 12l6.37 6.36z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{b.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{b.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-5 bg-[var(--surface-low)]">
            <button onClick={onClose} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
              Understood
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
