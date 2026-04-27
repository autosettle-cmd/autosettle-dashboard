"use client";

import { formatRM, formatDate } from "@/lib/formatters";
import { StatusCell, PaymentStatusCell } from "@/components/table/StatusBadge";

interface MobileClaimCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim: any;
  type: "claim" | "receipt" | "mileage";
  onClick: () => void;
  selected?: boolean;
  onSelect?: () => void;
}

export default function MobileClaimCard({ claim, type, onClick, selected, onSelect }: MobileClaimCardProps) {
  const c = claim;

  return (
    <div
      className={`px-4 py-3 border-b border-[var(--outline-ghost)] bg-white active:bg-[var(--surface-low)] transition-colors ${
        selected ? "ring-2 ring-inset ring-[var(--primary)]" : ""
      }`}
      onClick={onClick}
    >
      {/* Row 1: Primary info + amount */}
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
            {type === "mileage" ? `${c.from_location} → ${c.to_location}` : c.merchant || "—"}
          </span>
        </div>
        <span className="text-sm font-bold tabular-nums text-[var(--text-primary)] flex-shrink-0">
          {formatRM(c.amount)}
        </span>
      </div>

      {/* Row 2: Secondary info */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-muted)] truncate">
          {type !== "receipt" && c.employee_name ? `${c.employee_name} · ` : ""}
          {formatDate(c.claim_date)}
          {type === "receipt" && c.receipt_number ? ` · #${c.receipt_number}` : ""}
          {type === "mileage" && c.distance_km ? ` · ${c.distance_km} km` : ""}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusCell value={c.status} />
          {type !== "receipt" && c.payment_status && (
            <PaymentStatusCell value={c.payment_status} />
          )}
        </div>
      </div>
    </div>
  );
}
