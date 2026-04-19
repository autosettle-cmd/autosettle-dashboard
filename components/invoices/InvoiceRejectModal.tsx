'use client';

interface InvoiceRejectModalProps {
  open: boolean;
  invoiceCount: number;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function InvoiceRejectModal({ open, invoiceCount, reason, onReasonChange, onConfirm, onClose }: InvoiceRejectModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4" style={{ backgroundColor: 'var(--primary)' }}>
          <h3 className="text-white font-bold text-sm uppercase tracking-widest">
            Reject {invoiceCount} Invoice{invoiceCount !== 1 ? 's' : ''}
          </h3>
        </div>
        <div className="p-5">
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Enter rejection reason..."
            rows={3}
            className="input-recessed w-full resize-none"
          />
        </div>
        <div className="flex gap-3 px-5 py-4 bg-[var(--surface-low)]">
          <button onClick={onConfirm} disabled={!reason.trim()} className="btn-thick-red flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            Confirm Reject
          </button>
          <button onClick={onClose} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
