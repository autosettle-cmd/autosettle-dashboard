/**
 * Shared badge configurations for status indicators
 * Extracted from admin/accountant pages to eliminate duplication
 */

export interface BadgeConfig {
  label: string;
  cls: string;
  tooltip?: string;
}

/** Review status badges (claims, invoices, journal entries) */
export const STATUS_CFG: Record<string, BadgeConfig> = {
  pending_review: { label: 'Pending Review', cls: 'badge-amber', tooltip: 'Waiting for admin to review this submission before it can be approved' },
  reviewed:       { label: 'Reviewed',       cls: 'badge-blue',  tooltip: 'Admin has reviewed — ready for accountant approval' },
  posted:         { label: 'Posted',         cls: 'badge-green', tooltip: 'Journal entry has been posted to the general ledger' },
  reversed:       { label: 'Reversed',       cls: 'badge-red',   tooltip: 'Journal entry has been reversed — a reversal entry was created' },
};

/** Approval status badges (claims) */
export const APPROVAL_CFG: Record<string, BadgeConfig> = {
  pending_approval: { label: 'Pending Approval',  cls: 'badge-amber', tooltip: 'Waiting for accountant to approve. A journal entry will be created on approval.' },
  approved:         { label: 'Approved', cls: 'badge-green', tooltip: 'Approved by accountant. Journal entry has been posted.' },
  not_approved:     { label: 'Rejected', cls: 'badge-red',   tooltip: 'Rejected by accountant. No journal entry created.' },
};

/** Payment status badges (claims, invoices) */
export const PAYMENT_CFG: Record<string, BadgeConfig> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray',   tooltip: 'No payment recorded yet. Match with a bank transaction in Bank Recon to mark as paid.' },
  partially_paid: { label: 'Partial', cls: 'badge-amber',  tooltip: 'Some payment received but not the full amount. Remaining balance is still outstanding.' },
  paid:           { label: 'Paid',    cls: 'badge-purple', tooltip: 'Fully paid — matched with bank transaction(s) in Bank Reconciliation.' },
};

/** Supplier link status badges (invoices) */
export const LINK_CFG: Record<string, BadgeConfig> = {
  confirmed:    { label: 'Confirmed',   cls: 'badge-green', tooltip: 'Supplier confirmed — vendor is linked to an existing supplier account with GL defaults.' },
  auto_matched: { label: 'Suggested',   cls: 'badge-amber', tooltip: 'AI auto-matched to a supplier. Click to confirm or change the match.' },
  unmatched:    { label: 'Unconfirmed', cls: 'badge-red',   tooltip: 'No matching supplier found. A new supplier will be created, or you can link to an existing one.' },
};

/** OCR confidence colors */
export const CONFIDENCE_CFG: Record<string, string> = {
  HIGH:   'text-green-600',
  MEDIUM: 'text-amber-600',
  LOW:    'text-red-600',
};

/** Bank transaction matching status badges */
export const MATCH_STATUS_CFG: Record<string, BadgeConfig> = {
  matched:   { label: 'Matched',   cls: 'badge-green', tooltip: 'Matched to an invoice, claim, or receipt. Ready to confirm for journal entry creation.' },
  unmatched: { label: 'Unmatched', cls: 'badge-red',   tooltip: 'No matching document found yet. Drag an invoice or claim to match, or exclude if not applicable.' },
  excluded:  { label: 'Excluded',  cls: 'badge-gray',  tooltip: 'Excluded from reconciliation — this transaction does not need matching (e.g. bank fees, transfers).' },
};
