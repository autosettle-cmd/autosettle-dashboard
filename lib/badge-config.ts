/**
 * Shared badge configurations for status indicators
 * Extracted from admin/accountant pages to eliminate duplication
 */

export interface BadgeConfig {
  label: string;
  cls: string;
}

/** Review status badges (claims, invoices) */
export const STATUS_CFG: Record<string, BadgeConfig> = {
  pending_review: { label: 'Pending Review', cls: 'badge-amber' },
  reviewed:       { label: 'Reviewed',       cls: 'badge-blue'  },
};

/** Approval status badges (claims) */
export const APPROVAL_CFG: Record<string, BadgeConfig> = {
  pending_approval: { label: 'Pending',  cls: 'badge-amber' },
  approved:         { label: 'Approved', cls: 'badge-green' },
  not_approved:     { label: 'Rejected', cls: 'badge-red'   },
};

/** Payment status badges (claims, invoices) */
export const PAYMENT_CFG: Record<string, BadgeConfig> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray'   },
  partially_paid: { label: 'Partial', cls: 'badge-amber'  },
  paid:           { label: 'Paid',    cls: 'badge-purple' },
};

/** Supplier link status badges (invoices) */
export const LINK_CFG: Record<string, BadgeConfig> = {
  confirmed:    { label: 'Confirmed',   cls: 'badge-green' },
  auto_matched: { label: 'Suggested',   cls: 'badge-amber' },
  unmatched:    { label: 'Unconfirmed', cls: 'badge-red'   },
};

/** OCR confidence colors */
export const CONFIDENCE_CFG: Record<string, string> = {
  HIGH:   'text-green-600',
  MEDIUM: 'text-amber-600',
  LOW:    'text-red-600',
};

/** Bank transaction matching status badges */
export const MATCH_STATUS_CFG: Record<string, BadgeConfig> = {
  matched:   { label: 'Matched',   cls: 'badge-green' },
  unmatched: { label: 'Unmatched', cls: 'badge-red'   },
  excluded:  { label: 'Excluded',  cls: 'badge-gray'  },
};
