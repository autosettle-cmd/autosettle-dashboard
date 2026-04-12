import { useState, useCallback } from 'react';
import { getDateRange } from '@/lib/formatters';

export interface UseFiltersOptions {
  initialDateRange?: string;
  initialStatus?: string;
  initialApproval?: string;
}

export interface UseFiltersReturn {
  // Date range
  dateRange: string;
  setDateRange: (range: string) => void;
  customFrom: string;
  setCustomFrom: (date: string) => void;
  customTo: string;
  setCustomTo: (date: string) => void;
  // Status filters
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  approvalFilter: string;
  setApprovalFilter: (approval: string) => void;
  // Search
  search: string;
  setSearch: (search: string) => void;
  // Helpers
  getDateParams: () => { from: string; to: string };
  clearFilters: () => void;
  // Build URL params helper
  buildFilterParams: (base?: URLSearchParams) => URLSearchParams;
}

export function useFilters(options: UseFiltersOptions = {}): UseFiltersReturn {
  const {
    initialDateRange = 'this_month',
    initialStatus = '',
    initialApproval = '',
  } = options;

  const [dateRange, setDateRange] = useState(initialStatus ? '' : initialDateRange);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [approvalFilter, setApprovalFilter] = useState(initialApproval);
  const [search, setSearch] = useState('');

  const getDateParams = useCallback(() => {
    return getDateRange(dateRange, customFrom, customTo);
  }, [dateRange, customFrom, customTo]);

  const clearFilters = useCallback(() => {
    setDateRange(initialDateRange);
    setCustomFrom('');
    setCustomTo('');
    setStatusFilter('');
    setApprovalFilter('');
    setSearch('');
  }, [initialDateRange]);

  const buildFilterParams = useCallback((base?: URLSearchParams) => {
    const p = base ?? new URLSearchParams();
    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    if (from) p.set('dateFrom', from);
    if (to) p.set('dateTo', to);
    if (statusFilter) p.set('status', statusFilter);
    if (approvalFilter) p.set('approval', approvalFilter);
    if (search) p.set('search', search);
    return p;
  }, [dateRange, customFrom, customTo, statusFilter, approvalFilter, search]);

  return {
    dateRange,
    setDateRange,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    statusFilter,
    setStatusFilter,
    approvalFilter,
    setApprovalFilter,
    search,
    setSearch,
    getDateParams,
    clearFilters,
    buildFilterParams,
  };
}
