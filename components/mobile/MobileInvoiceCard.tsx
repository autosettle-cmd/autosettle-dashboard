"use client";

import { formatRM, formatDate } from "@/lib/formatters";
import { StatusCell, PaymentCell } from "@/components/table/StatusBadge";

interface MobileInvoiceCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any;
  onClick: () => void;
  selected?: boolean;
  onSelect?: () => void;
}

export default function MobileInvoiceCard({ invoice, onClick, selected, onSelect }: MobileInvoiceCardProps) {
  const inv = invoice;

  return (
    <div
      className={`px-4 py-3 border-b border-[var(--outline-ghost)] bg-white active:bg-[var(--surface-low)] transition-colors ${
        selected ? "ring-2 ring-inset ring-[var(--primary)]" : ""
      }`}
      onClick={onClick}
    >
      {/* Row 1: Vendor + amount */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => { e.stopPropagation(); onSelect(); }}
              className="w-4 h-4 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">
            {inv.vendor_name_raw || "—"}
          </span>
        </div>
        <span className="text-sm font-bold tabular-nums text-[var(--text-primary)] flex-shrink-0">
          {formatRM(inv.total_amount)}
        </span>
      </div>

      {/* Row 2: Invoice # + date + badges */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-muted)] truncate">
          {inv.invoice_number || "—"} · {formatDate(inv.issue_date)}
          {inv.due_date ? ` · Due ${formatDate(inv.due_date)}` : ""}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusCell value={inv.status} />
          <PaymentCell value={inv.payment_status} />
        </div>
      </div>
    </div>
  );
}
