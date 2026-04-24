'use client';

import React from 'react';

interface FilterBarProps {
  // Date range
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomFromChange?: (date: string) => void;
  onCustomToChange?: (date: string) => void;
  // Status filter (review status)
  showStatusFilter?: boolean;
  statusValue?: string;
  onStatusChange?: (status: string) => void;
  statusOptions?: { value: string; label: string }[];
  // Approval filter
  showApprovalFilter?: boolean;
  approvalValue?: string;
  onApprovalChange?: (approval: string) => void;
  approvalOptions?: { value: string; label: string }[];
  // Payment filter
  showPaymentFilter?: boolean;
  paymentValue?: string;
  onPaymentChange?: (payment: string) => void;
  paymentOptions?: { value: string; label: string }[];
  // Search
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (search: string) => void;
  searchPlaceholder?: string;
  // Extra content (buttons, etc.)
  children?: React.ReactNode;
}

const DEFAULT_STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'reviewed', label: 'Reviewed' },
];

const DEFAULT_APPROVAL_OPTIONS = [
  { value: '', label: 'All Approval' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'not_approved', label: 'Not Approved' },
];

const DEFAULT_PAYMENT_OPTIONS = [
  { value: '', label: 'All Payment' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
      {children}
    </select>
  );
}

export default function FilterBar({
  dateRange,
  onDateRangeChange,
  customFrom = '',
  customTo = '',
  onCustomFromChange,
  onCustomToChange,
  showStatusFilter = false,
  statusValue = '',
  onStatusChange,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  showApprovalFilter = false,
  approvalValue = '',
  onApprovalChange,
  approvalOptions = DEFAULT_APPROVAL_OPTIONS,
  showPaymentFilter = false,
  paymentValue = '',
  onPaymentChange,
  paymentOptions = DEFAULT_PAYMENT_OPTIONS,
  showSearch = true,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  children,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
      {/* Date Range — plain date inputs, no preset dropdown */}
      {onCustomFromChange && onCustomToChange && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { onCustomFromChange(e.target.value); if (e.target.value) onDateRangeChange('custom'); }}
            className="input-field"
          />
          <span className="text-[#8E9196] text-sm">–</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => { onCustomToChange(e.target.value); if (e.target.value) onDateRangeChange('custom'); }}
            className="input-field"
          />
        </>
      )}

      {/* Status Filter */}
      {showStatusFilter && onStatusChange && (
        <Select value={statusValue} onChange={onStatusChange}>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      )}

      {/* Approval Filter */}
      {showApprovalFilter && onApprovalChange && (
        <Select value={approvalValue} onChange={onApprovalChange}>
          {approvalOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      )}

      {/* Payment Filter */}
      {showPaymentFilter && onPaymentChange && (
        <Select value={paymentValue} onChange={onPaymentChange}>
          {paymentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      )}

      {/* Search */}
      {showSearch && onSearchChange && (
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input-field min-w-[210px]"
        />
      )}

      {/* Extra content */}
      {children}
    </div>
  );
}
