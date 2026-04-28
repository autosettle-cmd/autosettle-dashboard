'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import HelpTooltip from '@/components/HelpTooltip';
import dynamic from 'next/dynamic';
const BankReconPreviewModal = dynamic(() => import('@/components/bank-recon/BankReconPreviewModal'));
const BankReconMatchModal = dynamic(() => import('@/components/bank-recon/BankReconMatchModal'));
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentAllocation {
  invoice_id: string;
  invoice_number: string | null;
  vendor_name: string;
  total_amount: string;
  issue_date: string;
  allocated_amount: string;
  file_url: string | null;
}

interface PaymentReceipt {
  id: string;
  merchant: string;
  receipt_number: string | null;
  amount: string;
  claim_date: string;
  thumbnail_url: string | null;
  file_url: string | null;
  gl_label: string | null;
  contra_gl_label: string | null;
}

interface MatchedPayment {
  id: string;
  reference: string | null;
  payment_date: string;
  amount: string;
  direction: string;
  notes: string | null;
  supplier_name: string;
  allocations: PaymentAllocation[];
  receipts: PaymentReceipt[];
}

interface BankTxn {
  id: string;
  transaction_date: string;
  description: string;
  reference: string | null;
  cheque_number: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  recon_status: string;
  matched_at: string | null;
  notes: string | null;
  matched_payment: MatchedPayment | null;
  matched_invoice: { id: string; invoice_number: string; vendor_name: string; total_amount: string; amount_paid: string; issue_date: string; file_url: string | null; thumbnail_url: string | null; allocation_amount?: string } | null;
  matched_invoice_allocations?: { invoice_id: string; invoice_number: string; vendor_name: string; total_amount: string; allocation_amount: string; issue_date: string }[];
  matched_sales_invoice: { id: string; invoice_number: string; total_amount: string; amount_paid: string; issue_date: string; vendor_name: string; contra_gl_account_id?: string | null; file_url?: string | null; thumbnail_url?: string | null } | null;
  matched_claims: { id: string; merchant: string; amount: string; claim_date: string; receipt_number: string | null; file_url: string | null; thumbnail_url: string | null; employee_id: string; employee_name: string; category_name: string }[];
}

interface StatementDetail {
  id: string;
  firm_id: string;
  bank_name: string;
  account_number: string | null;
  bank_gl_label: string | null;
  statement_date: string;
  opening_balance: string | null;
  closing_balance: string | null;
  file_url: string | null;
  balance_override?: boolean;
  summary: { total: number; matched: number; unmatched: number; excluded: number };
  system_balance: { debit: number; credit: number };
  transactions: BankTxn[];
}

interface CandidatePayment {
  id: string;
  supplier_name: string;
  amount: string;
  payment_date: string;
  reference: string | null;
  direction: string;
  notes: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface BankReconDetailConfig {
  role: 'accountant' | 'admin';
  apiStatements: string;     // '/api/bank-reconciliation/statements' or '/api/admin/bank-reconciliation/statements'
  apiOutstanding: string;    // '/api/bank-reconciliation/outstanding-items' or '/api/admin/bank-reconciliation/unreconciled-payments'
  apiMatch: string;          // '/api/bank-reconciliation/match-item' or '/api/admin/bank-reconciliation/match'
  apiMatchLegacy?: string;   // '/api/admin/bank-reconciliation/match' (admin legacy match)
  apiConfirm: string;        // '/api/bank-reconciliation/confirm' or '/api/admin/bank-reconciliation/confirm'
  apiCreateVoucher: string;  // '/api/bank-reconciliation/create-voucher' or '/api/admin/bank-reconciliation/create-voucher'
  apiCreateReceipt: string;  // '/api/bank-reconciliation/create-receipt' or '/api/admin/bank-reconciliation/create-receipt'
  apiRematch: string;        // '/api/bank-reconciliation/rematch' or '/api/admin/bank-reconciliation/rematch'
  apiUnmatch: string;        // '/api/bank-reconciliation/unmatch' or '/api/admin/bank-reconciliation/unmatch'
  apiSuppliers: string;      // '/api/suppliers' or '/api/admin/suppliers'
  apiCategories: string;     // '/api/categories' or '/api/admin/categories'
  apiInvoices: string;       // '/api/invoices' or '/api/admin/invoices'
  apiOutstandingItems: string; // '/api/bank-reconciliation/outstanding-items' (same for both)
  apiMatchItem: string;      // '/api/bank-reconciliation/match-item' (same for both)
  apiUpdateTxn?: string;     // '/api/bank-reconciliation/update-txn' (accountant only)
  linkPrefix: string;
  showAutoRematch: boolean;  // accountant only — auto-rematch on load
  showAliasLearning: boolean; // accountant only — save description aliases
  showDescriptionEdit: boolean; // accountant only — editable txn description
  showClaimPreview: boolean; // accountant only — claim preview modal with doc viewer
  showGlPersistence: boolean; // accountant only — localStorage GL
  showRichPreview: boolean;  // accountant: modal preview with matched items; admin: inline row expansion
  showMultiInvoiceAllocations: boolean; // accountant only — matched_invoice_allocations
  /** Whether to use firm-scoped API calls (accountant passes firmId from statement) */
  useFirmScope: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

function formatRM(val: string | number | null) {
  if (val === null || val === undefined) return '-';
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CFG: Record<string, { label: string; cls: string; tooltip?: string }> = {
  matched:          { label: 'Suggested',  cls: 'badge-amber', tooltip: 'AI auto-matched this transaction. Review and confirm the match.' },
  manually_matched: { label: 'Confirmed',  cls: 'badge-green', tooltip: 'Match confirmed by user. Ready for journal entry creation.' },
  unmatched:        { label: 'Unmatched',  cls: 'badge-red',   tooltip: 'No matching document found. Drag an invoice or claim to match.' },
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function BankReconDetailContent({ config }: { config: BankReconDetailConfig }) {
  usePageTitle('Bank Reconciliation');
  const { id } = useParams<{ id: string }>();

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'suggested' | 'confirmed'>('all');
  const [confirming, setConfirming] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [confirmError, setConfirmError] = useState('');
  const [matchingTxn, setMatchingTxn] = useState<BankTxn | null>(null);
  const [txnDescDraft, setTxnDescDraft] = useState('');
  const [previewTxn, setPreviewTxn] = useState<BankTxn | null>(null);
  const [expandedDocUrl, setExpandedDocUrl] = useState<string | null>(null);
  const [unmatchConfirmTxn, setUnmatchConfirmTxn] = useState<BankTxn | null>(null);
  const [unmatching, setUnmatching] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<PaymentAllocation | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceipt | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewClaim, setPreviewClaim] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<CandidatePayment[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [outstandingItems, setOutstandingItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: string; id: string } | null>(null);
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const [matchTab, setMatchTab] = useState<'invoices' | 'claims'>('invoices');
  const [matchSubmitting, setMatchSubmitting] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [claimSearch, setClaimSearch] = useState('');
  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState<{ matched: number } | null>(null);

  // Payment voucher / official receipt creation
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [voucherSuppliers, setVoucherSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [voucherCategories, setVoucherCategories] = useState<{ id: string; name: string }[]>([]);
  const [voucherData, setVoucherData] = useState({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: '' });
  const [creatingVoucher, setCreatingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState('');
  const [creatingNewSupplier, setCreatingNewSupplier] = useState(false);
  const [receiptGlAccounts, setReceiptGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);

  // ─── Data loading ───────────────────────────────────────────────────────────

  const loadStatement = () => {
    fetch(`${config.apiStatements}/${id}`)
      .then((r) => r.json())
      .then((j) => { setStatement(j.data); setLoading(false); })
      .catch((err) => { console.error('Failed to load statement:', err); setLoading(false); });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${config.apiStatements}/${id}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => { setStatement(j.data); setLoading(false); })
      .catch((err) => { if ((err as Error).name !== 'AbortError') { console.error('Failed to load statement:', err); setLoading(false); } });
    return () => controller.abort();
  }, [id]);

  // Auto-open preview from ?preview=txnId (global search navigation)
  const bankSearchParams = useSearchParams();
  const previewTxnParam = bankSearchParams.get('preview');
  useEffect(() => {
    if (!previewTxnParam || !statement) return;
    const match = statement.transactions.find((t) => t.id === previewTxnParam);
    if (match) {
      setPreviewTxn(match);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [previewTxnParam, statement]);

  // Auto-rematch when statement loads (accountant only)
  const [autoRematched, setAutoRematched] = useState(false);
  useEffect(() => {
    if (!config.showAutoRematch || !statement || autoRematched || rematching) return;
    const unmatched = statement.transactions.filter(t => t.recon_status === 'unmatched').length;
    if (unmatched > 0) {
      setAutoRematched(true);
      doRematch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement]);

  const filteredTxns = statement?.transactions.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'suggested') return t.recon_status === 'matched';
    if (filter === 'confirmed') return t.recon_status === 'manually_matched';
    return t.recon_status === filter;
  }) ?? [];

  const suggestedCount = statement?.transactions.filter((t) => t.recon_status === 'matched').length ?? 0;
  const confirmedCount = statement?.transactions.filter((t) => t.recon_status === 'manually_matched').length ?? 0;

  // ─── Balance mismatch computation ──────────────────────────────────────────

  const { totalDebit, totalCredit, matchedDebit, matchedCredit, opening, closing, expectedClosing, balanceDiff, hasMismatch } = useMemo(() => {
    if (!statement) return { totalDebit: 0, totalCredit: 0, matchedDebit: 0, matchedCredit: 0, opening: 0, closing: 0, expectedClosing: 0, balanceDiff: 0, hasMismatch: false };
    const txns = statement.transactions;
    const totalDebit = txns.reduce((s, t) => s + Number(t.debit ?? 0), 0);
    const totalCredit = txns.reduce((s, t) => s + Number(t.credit ?? 0), 0);
    const matched = txns.filter(t => t.recon_status === 'matched' || t.recon_status === 'manually_matched');
    const matchedDebit = matched.reduce((s, t) => s + Number(t.debit ?? 0), 0);
    const matchedCredit = matched.reduce((s, t) => s + Number(t.credit ?? 0), 0);
    const opening = Number(statement.opening_balance ?? 0);
    const closing = Number(statement.closing_balance ?? 0);
    const expectedClosing = opening - totalDebit + totalCredit;
    const balanceDiff = Math.abs(expectedClosing - closing);
    return { totalDebit, totalCredit, matchedDebit, matchedCredit, opening, closing, expectedClosing, balanceDiff, hasMismatch: balanceDiff > 0.01 };
  }, [statement]);

  const matchingBlocked = hasMismatch && !statement?.balance_override;

  // ─── Actions ────────────────────────────────────────────────────────────────

  const doConfirm = async (txnIds: string[], glOverride?: { debitGlId?: string; creditGlId?: string }) => {
    setConfirming(true);
    setConfirmError('');
    try {
      const res = await fetch(config.apiConfirm, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionIds: txnIds, ...(glOverride ?? {}) }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errMsg = json.error || 'Failed to confirm';
        setConfirmError(errMsg);
        alert(errMsg);
      } else {
        // Save scroll position before reload
        const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
        const stmtRes = await fetch(`${config.apiStatements}/${id}`);
        const stmtJson = await stmtRes.json();
        if (stmtJson.data) {
          setStatement(stmtJson.data);
          if (previewTxn) {
            const updated = (stmtJson.data as StatementDetail).transactions.find((t: BankTxn) => t.id === previewTxn.id);
            if (updated) setPreviewTxn(updated);
          }
          // Restore scroll position after React re-render
          requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
        }
      }
    } catch (e) { console.error(e); }
    finally { setConfirming(false); }
  };

  const _doConfirmAll = () => {
    if (matchingBlocked) return;
    const suggestedIds = (statement?.transactions ?? [])
      .filter((t) => t.recon_status === 'matched')
      .map((t) => t.id);
    if (suggestedIds.length > 0) doConfirm(suggestedIds);
  };

  const closeMatchModal = () => {
    setMatchingTxn(null);
    setShowVoucherForm(false);
    setShowReceiptForm(false);
    setTxnDescDraft('');
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: '' });
    setVoucherError('');
    setSelectedClaimIds(new Set());
    setSelectedItem(null);
    setMatchError('');
    setMatchTab('invoices');
  };

  const openMatchModal = async (txn: BankTxn) => {
    const firmId = statement?.firm_id;
    setMatchingTxn(txn);
    if (config.showDescriptionEdit) setTxnDescDraft(txn.description.split(' | ').join('\n'));
    setShowVoucherForm(false);
    setShowReceiptForm(false);
    setVoucherError('');
    setMatchError('');
    setSelectedItem(null);
    setSelectedClaimIds(new Set());
    setClaimSearch('');
    setLoadingCandidates(true);

    const amount = txn.debit ?? txn.credit ?? '';
    const direction = txn.debit ? 'outgoing' : 'incoming';

    // Fetch outstanding items (invoices/claims)
    if (firmId) {
      const params = new URLSearchParams({ firmId, direction });
      if (amount) params.set('amount', amount);
      const res = await fetch(`${config.apiOutstandingItems}?${params}`);
      const json = await res.json();
      setOutstandingItems(json.data ?? []);
    } else {
      setOutstandingItems([]);
    }

    // Admin also fetches legacy payment candidates
    if (!config.useFirmScope) {
      const legacyParams = new URLSearchParams();
      if (amount) legacyParams.set('amount', amount);
      const res = await fetch(`${config.apiOutstanding}?${legacyParams}`);
      const json = await res.json();
      setCandidates(json.data ?? []);
    }

    setLoadingCandidates(false);
  };

  const searchOutstandingItems = async (searchTerm: string) => {
    const firmId = statement?.firm_id;
    if (!firmId || !matchingTxn) return;
    const amount = matchingTxn.debit ?? matchingTxn.credit ?? '';
    const direction = matchingTxn.debit ? 'outgoing' : 'incoming';
    const params = new URLSearchParams({ firmId, direction });
    if (amount && !searchTerm) params.set('amount', amount);
    if (searchTerm) params.set('search', searchTerm);
    const res = await fetch(`${config.apiOutstandingItems}?${params}`);
    const json = await res.json();
    setOutstandingItems(json.data ?? []);
  };

  /** After a successful match, reload statement and show the updated transaction in preview */
  const advanceAfterMatch = async () => {
    const currentId = matchingTxn?.id;
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    closeMatchModal();
    if (!currentId) return;
    try {
      const res = await fetch(`${config.apiStatements}/${id}`);
      const json = await res.json();
      if (json.data) {
        setStatement(json.data);
        const updated = (json.data as StatementDetail).transactions.find((t: BankTxn) => t.id === currentId);
        if (updated) setPreviewTxn(updated);
        requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
      }
    } catch (e) {
      console.error('Failed to reload statement:', e);
    }
  };

  const doMatchLegacy = async (paymentId: string) => {
    if (!matchingTxn || !config.apiMatchLegacy) return;
    await fetch(config.apiMatchLegacy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: matchingTxn.id, paymentId }),
    });
    await advanceAfterMatch();
  };

  const doMatchItem = async (item?: { type: string; id: string }, invoiceIds?: string[]) => {
    if (!matchingTxn) return;
    setMatchSubmitting(true);
    setMatchError('');
    try {
      // Multi-invoice: call API once per invoice (API supports incremental allocation)
      if (invoiceIds && invoiceIds.length > 0) {
        for (const invId of invoiceIds) {
          const body: Record<string, unknown> = { bankTransactionId: matchingTxn.id };
          body.invoiceId = invId;
          const res = await fetch(config.apiMatchItem, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (!res.ok) {
            setMatchError(json.error || `Match failed for invoice ${invId}`);
            setMatchSubmitting(false);
            return;
          }
        }
        await advanceAfterMatch();
        setMatchSubmitting(false);
        return;
      }

      const body: Record<string, unknown> = { bankTransactionId: matchingTxn.id };

      if (selectedClaimIds.size > 0) {
        body.claimIds = Array.from(selectedClaimIds);
      } else if (item) {
        if (item.type === 'invoice' || item.type === 'sales') body.invoiceId = item.id;
        else if (item.type === 'claim') body.claimIds = [item.id];
      }

      const res = await fetch(config.apiMatchItem, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMatchError(json.error || 'Match failed');
        setMatchSubmitting(false);
        return;
      }
      await advanceAfterMatch();
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'Network error');
    }
    setMatchSubmitting(false);
  };

  // ─── Alias learning (accountant only) ───────────────────────────────────────

  const saveDescriptionAlias = (txn: BankTxn, supplierId?: string) => {
    if (!config.showAliasLearning || !supplierId) return;
    const bankKeywords = /^(transfer|bulk|credit|debit|duitnow|instant|ibft|ibg|qr|settle|payment|giro|dr|cr|fps|epayment|salary|loan|interest|commission|charge|fee|reversal|mbb|cimb|ocbc|rhb|maybank|hsbc|uob|amb|sal\s)/i;
    const lines = txn.description.split(' | ').map(l => l.trim());
    for (const line of lines) {
      const lower = line.toLowerCase().replace(/\s*\*\s*$/, '').trim();
      if (lower.length < 3 || bankKeywords.test(lower) || /^\d/.test(lower) || /[(){}[\]]/.test(lower)) continue;
      const words = lower.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2 || !words.every(w => /^[a-zA-Z.*@'-]+$/.test(w))) continue;
      fetch('/api/suppliers/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, alias: lower }),
      }).catch(() => {});
    }
  };

  // ─── Supplier resolution from description (accountant only) ─────────────────

  const resolveSupplierFromDesc = async (
    txn: BankTxn,
    suppliers: { id: string; name: string }[],
    firmId: string
  ): Promise<{ type: 'existing'; id: string; name: string } | { type: 'new'; name: string } | null> => {
    if (!config.showAliasLearning) return null;
    const descLines = txn.description.split(' | ').map(l => l.trim());
    const descLinesLower = descLines.map(l => l.toLowerCase());

    // Level 1: Check supplier aliases in DB
    for (const line of descLines) {
      const normalized = line.toLowerCase().replace(/\s*\*\s*$/, '').trim();
      if (normalized.length < 2) continue;
      try {
        const res = await fetch(`/api/suppliers/by-alias?alias=${encodeURIComponent(normalized)}&firmId=${firmId}`);
        const j = await res.json();
        if (j.data?.id) return { type: 'existing', id: j.data.id, name: j.data.name };
      } catch { /* ignore */ }
    }

    // Level 2: Match against existing supplier names
    const matched = suppliers.find((s) => {
      const sName = s.name.toLowerCase();
      return descLinesLower.some((line) => line.includes(sName) || sName.includes(line));
    });
    if (matched) return { type: 'existing', id: matched.id, name: matched.name };

    // Level 3: Extract name-like line
    const bankKeywords = /^(transfer|bulk|credit|debit|duitnow|instant|ibft|ibg|qr|settle|payment|giro|dr|cr|fps|epayment|salary|loan|interest|commission|charge|fee|reversal|mbb|cimb|ocbc|rhb|maybank|hsbc|uob|amb|sal\s)/i;
    const nameLine = descLinesLower.find((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) return false;
      if (bankKeywords.test(trimmed)) return false;
      if (/^\d/.test(trimmed)) return false;
      if (/[(){}[\]]/.test(trimmed)) return false;
      const words = trimmed.split(/\s+/).filter(w => w.length > 0);
      return words.length >= 2 && words.every(w => /^[a-zA-Z.*@'-]+$/.test(w));
    });
    if (nameLine) {
      const formatted = nameLine.replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase()).replace(/\s*\*\s*$/, '');
      return { type: 'new', name: formatted };
    }

    return null;
  };

  // ─── Voucher & Receipt forms ────────────────────────────────────────────────

  const getFirmId = () => statement?.firm_id;

  const supplierApiUrl = (query?: string) => {
    const firmId = getFirmId();
    return config.useFirmScope && firmId
      ? `${config.apiSuppliers}?firmId=${firmId}${query ? `&${query}` : ''}`
      : `${config.apiSuppliers}?${query ?? ''}`;
  };

  const categoryApiUrl = () => {
    const firmId = getFirmId();
    return config.useFirmScope && firmId
      ? `${config.apiCategories}?firmId=${firmId}`
      : config.apiCategories;
  };

  const openVoucherForm = async () => {
    setShowVoucherForm(true);
    setCreatingNewSupplier(false);
    setVoucherError('');
    const lastGl = config.showGlPersistence ? (localStorage.getItem('lastVoucherGl') || '') : '';
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: lastGl });
    const firmId = getFirmId();
    if (!firmId) return;
    const [suppRes, catRes, glRes] = await Promise.all([
      fetch(supplierApiUrl()).then((r) => r.json()),
      fetch(categoryApiUrl()).then((r) => r.json()),
      receiptGlAccounts.length > 0 ? Promise.resolve({ data: receiptGlAccounts }) : fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()),
    ]);
    const suppliers = (suppRes.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    setVoucherSuppliers(suppliers);
    setVoucherCategories(catRes.data ?? []);
    if (glRes.data) setReceiptGlAccounts(glRes.data);

    // Auto-resolve supplier from transaction description (accountant only)
    if (config.showAliasLearning && matchingTxn && firmId) {
      const result = await resolveSupplierFromDesc(matchingTxn, suppliers, firmId);
      if (result?.type === 'existing') {
        setVoucherData((prev) => ({ ...prev, supplier_id: result.id }));
        fetchNextVoucherNumber(result.name, result.id);
        return;
      }
      if (result?.type === 'new') {
        setCreatingNewSupplier(true);
        setVoucherData((prev) => ({ ...prev, new_supplier_name: result.name }));
        fetchNextVoucherNumber(result.name);
        return;
      }
    }

    // Fallback to Walk-in Customer
    const walkIn = suppliers.find((s: { name: string }) => s.name === 'Walk-in Customer');
    if (walkIn) {
      setVoucherData((prev) => ({ ...prev, supplier_id: walkIn.id }));
      fetchNextVoucherNumber('Walk-in Customer', walkIn.id);
    }
  };

  const fetchNextVoucherNumber = async (name: string, supplierId?: string) => {
    if (!statement?.firm_id || !name.trim()) return;
    try {
      const res = await fetch(`/api/bank-reconciliation/next-voucher-number?firmId=${statement.firm_id}`);
      const j = await res.json();
      if (j.data) setVoucherData(prev => ({ ...prev, reference: j.data }));
    } catch { /* ignore */ }
    if (supplierId) {
      try {
        const suppRes = await fetch(`${config.apiSuppliers}/${supplierId}?`);
        const suppJ = await suppRes.json();
        const defaultGl = suppJ.data?.default_gl_account_id;
        if (defaultGl) { setVoucherData(prev => ({ ...prev, gl_account_id: prev.gl_account_id || defaultGl })); }
      } catch { /* ignore */ }
    }
  };

  const doCreateVoucher = async () => {
    if (!matchingTxn) return;
    setCreatingVoucher(true);
    setVoucherError('');
    const finalData = { ...voucherData };
    // Admin has category dropdown — fall back to Miscellaneous if none selected
    // Accountant doesn't see category — GL account is what matters
    if (!finalData.category_id && !config.showRichPreview) {
      const misc = voucherCategories.find(c => c.name.toLowerCase() === 'miscellaneous');
      finalData.category_id = misc?.id || '';
    }
    try {
      const res = await fetch(config.apiCreateVoucher, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: matchingTxn.id, ...finalData }),
      });
      const json = await res.json();
      if (!res.ok) { setVoucherError(json.error || 'Failed to create payment voucher'); return; }
      if (json.data?.jv_warning) setVoucherError(`Created, but JV warning: ${json.data.jv_warning}`);
      if (config.showGlPersistence && voucherData.gl_account_id) localStorage.setItem('lastVoucherGl', voucherData.gl_account_id);
      saveDescriptionAlias(matchingTxn, voucherData.supplier_id || json.data?.supplier_id);
      await advanceAfterMatch();
    } finally { setCreatingVoucher(false); }
  };

  const openReceiptForm = async () => {
    setShowReceiptForm(true);
    setCreatingNewSupplier(false);
    setVoucherError('');
    const lastGl = config.showGlPersistence ? (localStorage.getItem('lastReceiptGl') || '') : '';
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: lastGl });
    const firmId = getFirmId();
    if (!firmId) return;
    const [suppRes, glRes] = await Promise.all([
      fetch(supplierApiUrl()).then((r) => r.json()),
      receiptGlAccounts.length > 0 ? Promise.resolve({ data: receiptGlAccounts }) : fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()),
    ]);
    const suppliers = (suppRes.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    setVoucherSuppliers(suppliers);
    if (glRes.data) setReceiptGlAccounts(glRes.data);

    // Auto-resolve supplier from transaction description (accountant only)
    if (config.showAliasLearning && matchingTxn && firmId) {
      const result = await resolveSupplierFromDesc(matchingTxn, suppliers, firmId);
      if (result?.type === 'existing') {
        setVoucherData((prev) => ({ ...prev, supplier_id: result.id }));
        fetchNextReceiptNumber(result.name, result.id);
        return;
      }
      if (result?.type === 'new') {
        setCreatingNewSupplier(true);
        setVoucherData((prev) => ({ ...prev, new_supplier_name: result.name }));
        fetchNextReceiptNumber(result.name);
        return;
      }
    }

    // Fallback to Walk-in Customer
    const walkIn = suppliers.find((s: { name: string }) => s.name === 'Walk-in Customer');
    if (walkIn) {
      setVoucherData((prev) => ({ ...prev, supplier_id: walkIn.id }));
      fetchNextReceiptNumber('Walk-in Customer', walkIn.id);
    }
  };

  const fetchNextReceiptNumber = async (name: string, supplierId?: string) => {
    if (!statement?.firm_id || !name.trim()) return;
    try {
      const res = await fetch(`/api/bank-reconciliation/next-receipt-number?firmId=${statement.firm_id}`);
      const j = await res.json();
      if (j.data) setVoucherData(prev => ({ ...prev, reference: j.data }));
    } catch { /* ignore */ }
    if (supplierId) {
      try {
        const suppRes = await fetch(`${config.apiSuppliers}/${supplierId}`);
        const suppJ = await suppRes.json();
        const defaultGl = suppJ.data?.default_gl_account_id;
        if (defaultGl) { setVoucherData(prev => ({ ...prev, gl_account_id: prev.gl_account_id || defaultGl })); return; }
        const invRes = await fetch(`/api/invoices?supplierId=${supplierId}&type=sales&take=1`);
        const invJ = await invRes.json();
        const lastGl = (invJ.data ?? [])[0]?.gl_account_id;
        if (lastGl) setVoucherData(prev => ({ ...prev, gl_account_id: prev.gl_account_id || lastGl }));
      } catch { /* ignore */ }
    }
  };

  const doCreateReceipt = async () => {
    if (!matchingTxn) return;
    setCreatingVoucher(true);
    setVoucherError('');
    try {
      const res = await fetch(config.apiCreateReceipt, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: matchingTxn.id, ...voucherData }),
      });
      const json = await res.json();
      if (!res.ok) { setVoucherError(json.error || 'Failed to create official receipt'); return; }
      if (json.data?.jv_warning) setVoucherError(`Created, but JV warning: ${json.data.jv_warning}`);
      if (config.showGlPersistence && voucherData.gl_account_id) localStorage.setItem('lastReceiptGl', voucherData.gl_account_id);
      saveDescriptionAlias(matchingTxn, voucherData.supplier_id || json.data?.supplier_id);
      await advanceAfterMatch();
    } finally { setCreatingVoucher(false); }
  };

  const requestUnmatch = (txn: BankTxn) => {
    setUnmatchConfirmTxn(txn);
  };

  const doUnmatch = async (txnId: string) => {
    setUnmatching(true);
    await fetch(config.apiUnmatch, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: txnId }),
    });
    setUnmatchConfirmTxn(null);
    setUnmatching(false);
    // Reload and keep preview open on the now-unmatched txn
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    const stmtRes = await fetch(`${config.apiStatements}/${id}`);
    const stmtJson = await stmtRes.json();
    if (stmtJson.data) {
      setStatement(stmtJson.data);
      const updated = (stmtJson.data as StatementDetail).transactions.find((t: BankTxn) => t.id === txnId);
      if (updated) setPreviewTxn(updated);
      requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
    }
  };

  const doRematch = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const res = await fetch(config.apiRematch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankStatementId: id }),
      });
      const j = await res.json();
      if (j.data) setRematchResult(j.data);
      loadStatement();
    } catch (e) { console.error(e); }
    setRematching(false);
    setTimeout(() => setRematchResult(null), 5000);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[var(--surface-container-highest)]">
          <div className="flex items-center gap-3">
            <Link href={`${config.linkPrefix}/bank-reconciliation`} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">
              {statement ? `${statement.bank_name} — ${statement.account_number ?? 'N/A'} — ${formatDate(statement.statement_date)}` : 'Loading...'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {rematchResult && (
              <span className="text-body-sm text-[var(--match-green)] font-medium">{rematchResult.matched} new match{rematchResult.matched !== 1 ? 'es' : ''} found</span>
            )}
            <button
              onClick={doRematch}
              disabled={rematching}
              className="btn-thick-navy flex items-center gap-1.5 px-3 py-1.5 text-body-md font-medium text-white disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {rematching ? 'Matching...' : 'Re-match'}
            </button>
            {statement?.file_url && (
              <a href={statement.file_url} target="_blank" rel="noopener noreferrer"
                className="btn-thick-white flex items-center gap-1.5 px-3 py-1.5 text-body-md font-medium">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF
              </a>
            )}
          </div>
        </header>

        {/* -- Static summary + filter tabs -- */}
        {!loading && statement && (
          <div className="flex-shrink-0 px-6 pl-14 pt-4 pb-1">
              {/* Summary cards */}
              <div className="grid grid-cols-7 gap-3 mb-4">
                {[
                    { label: 'Opening Balance', value: formatRM(statement.opening_balance), color: 'text-[var(--text-primary)]' },
                    { label: 'Total Debit', value: formatRM(totalDebit), color: 'text-[var(--reject-red)]' },
                    { label: 'Total Credit', value: formatRM(totalCredit), color: 'text-[var(--match-green)]' },
                    { label: 'Closing Balance', value: formatRM(statement.closing_balance), color: 'text-[var(--text-primary)]' },
                    { label: 'Confirmed', value: `${confirmedCount} / ${statement.summary.total}`, color: 'text-[var(--match-green)]' },
                    { label: 'Suggested', value: String(suggestedCount), color: suggestedCount > 0 ? 'text-amber-600' : 'text-[var(--match-green)]' },
                    { label: 'Unmatched', value: String(statement.summary.unmatched), color: statement.summary.unmatched > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--match-green)]' },
                  ].map((c) => (
                  <div key={c.label} className="bg-white card-popped p-3">
                    <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">{c.label}</p>
                    <p className={`text-title-md font-bold tabular-nums ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Filter tabs + Confirm All */}
              <div className="flex items-center gap-1 mb-3">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'unmatched', label: `Unmatched (${statement.summary.unmatched})` },
                  { key: 'suggested', label: `Suggested (${suggestedCount})` },
                  { key: 'confirmed', label: `Confirmed (${confirmedCount})` },
                ] as const).map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-body-sm font-medium transition-colors ${filter === f.key ? 'btn-thick-navy text-white' : 'btn-thick-white'}`}
                  >
                    {f.label}
                  </button>
                ))}

                {suggestedCount > 0 && (
                  <span className="ml-auto text-label-sm text-amber-600 font-medium">
                    {suggestedCount} suggested — click Review to confirm
                  </span>
                )}
              </div>

              {confirmError && (
                <div className="mb-3 bg-[var(--error-container)] px-4 py-2 text-sm text-[var(--on-error-container)] whitespace-pre-line">{confirmError}</div>
              )}

              {/* Balance mismatch warning */}
              {hasMismatch && (
                <div className={`mb-3 px-4 py-3 text-body-sm border ${matchingBlocked ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-semibold">Balance mismatch:</span>{' '}
                      Opening (<span className="tabular-nums">{formatRM(opening)}</span>) − Debit (<span className="tabular-nums">{formatRM(totalDebit)}</span>) + Credit (<span className="tabular-nums">{formatRM(totalCredit)}</span>) = <span className="tabular-nums">{formatRM(expectedClosing)}</span>, but closing balance is <span className="tabular-nums">{formatRM(closing)}</span>.
                      {' '}Difference: <strong className="tabular-nums">{formatRM(balanceDiff)}</strong>
                      {matchingBlocked && ' — matching is disabled until this is resolved.'}
                      {!matchingBlocked && <span className="italic"> — override active, proceed with caution.</span>}
                    </div>
                    {matchingBlocked && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={async () => {
                            if (!confirm('Override balance mismatch? You are confirming the statement is correct despite the difference.')) return;
                            try {
                              const res = await fetch(`${config.apiStatements}/${id}/override`, { method: 'POST' });
                              if (res.ok) loadStatement();
                              else alert('Failed to override');
                            } catch { alert('Failed to override'); }
                          }}
                          className="btn-thick-navy text-label-sm px-3 py-1.5 text-white whitespace-nowrap"
                        >
                          Override &amp; Proceed
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col px-6 pl-14 pt-2 pb-0 animate-in ledger-binding">
          {loading || !statement ? (
            <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
          ) : (
            <>
              {/* Transaction table */}
              <div ref={tableScrollRef} className="bg-white flex-1 min-h-0 overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-2 py-2.5 text-left w-[90px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                      <th className="px-2 py-2.5 text-left w-[78px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date</th>
                      <th className="px-2 py-2.5 text-left w-[30%] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                      <th className="px-2 py-2.5 text-right w-[90px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Debit</th>
                      <th className="px-2 py-2.5 text-right w-[90px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Credit</th>
                      <th className="px-2 py-2.5 text-right w-[90px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                      <th className="px-2 py-2.5 text-left min-w-[200px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Notes</th>
                      <th className="px-2 py-2.5 text-right w-[100px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">
                        <div className="flex items-center justify-end gap-1.5">
                          Actions
                          <HelpTooltip items={[
                            { label: 'Confirm', description: 'Accept a suggested match and create a journal entry.' },
                            { label: 'Match', description: 'Manually link an unmatched bank transaction to a payment.' },
                            { label: 'Unmatch', description: 'Remove the match. Reverses the journal entry if confirmed.' },
                          ]} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((txn, idx) => {
                      const isExpanded = previewTxn?.id === txn.id;
                      const mp = txn.matched_payment;
                      const mi = txn.matched_invoice;
                      const msi = txn.matched_sales_invoice;
                      const mia = txn.matched_invoice_allocations;
                      const hasClaims = txn.matched_claims && txn.matched_claims.length > 0;
                      const hasInvoice = !!(mi || (mia && mia.length > 0));
                      const hasSalesInvoice = !!msi;

                      // Detect partial match
                      const txnBankAmt = Number(txn.debit ?? txn.credit ?? 0);
                      const txnMatchedAmt = (() => {
                        let total = 0;
                        if (mia?.length) { for (const a of mia) total += Number(a.allocation_amount); }
                        else if (mi) { total += Number(mi.allocation_amount ?? mi.total_amount); }
                        if (msi) total += Number(msi.total_amount);
                        if (txn.matched_claims?.length) { for (const c of txn.matched_claims) total += Number(c.amount); }
                        if (mp) total += Number(mp.amount);
                        return total;
                      })();
                      const isTxnPartial = txn.recon_status === 'manually_matched' && txnMatchedAmt > 0 && Math.abs(txnMatchedAmt - txnBankAmt) > 0.01;
                      const cfg = isTxnPartial
                        ? { label: 'Partial', cls: 'badge-amber' }
                        : (STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched);

                      // Accountant: debit/credit row coloring, click to open modal for matched or match modal for unmatched
                      // Admin: green for matched rows, alternating for others, click to expand inline
                      const hasExpandable = config.showRichPreview
                        ? true // accountant always clickable
                        : !!(mp || hasClaims || hasInvoice || hasSalesInvoice); // admin only if has matches

                      const rowBg = config.showRichPreview
                        ? (isExpanded ? 'bg-blue-50/60' : txn.debit ? 'bg-red-50/40' : 'bg-green-50/30')
                        : (isExpanded ? 'bg-blue-50/60' : (txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') ? 'bg-green-50/30' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white');

                      const handleRowClick = () => {
                        if (config.showRichPreview) {
                          // Accountant: unmatched opens match modal, matched opens preview modal
                          if (txn.recon_status === 'unmatched') { openMatchModal(txn); }
                          else { setPreviewTxn(isExpanded ? null : txn); setExpandedDocUrl(null); }
                        } else {
                          // Admin: expand inline if has expandable content
                          if (hasExpandable) setPreviewTxn(isExpanded ? null : txn);
                        }
                      };

                      return (
                        <React.Fragment key={txn.id}>
                        <tr className={`transition-colors ${hasExpandable ? 'cursor-pointer hover:bg-[var(--surface-header)]' : 'hover:bg-[var(--surface-header)]'} ${rowBg}`}
                          onClick={handleRowClick}
                        >
                          <td data-col="Status" className="px-2 py-2.5">
                            <div className="flex items-center gap-1">
                              {!config.showRichPreview && hasExpandable && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                              )}
                              <span className={cfg.cls} data-tooltip={cfg.tooltip}>{cfg.label}</span>
                              {txn.recon_status === 'manually_matched' && (() => {
                                // Check for missing documents on matched items
                                const inv = txn.matched_invoice;
                                const mias = txn.matched_invoice_allocations;
                                const isPV = inv?.invoice_number?.startsWith('PV-');
                                const isOR = txn.matched_sales_invoice?.invoice_number?.startsWith('OR-');
                                const invMissingDoc = inv && !inv.file_url;
                                const allocMissingDoc = mias?.some(a => !(a as { file_url?: string }).file_url);
                                if ((isPV || isOR) && (invMissingDoc || allocMissingDoc)) {
                                  return (
                                    <span className="relative group/nodoc">
                                      <span className="text-[11px] font-black text-white bg-[var(--reject-red)] px-1 py-0.5 leading-none whitespace-nowrap cursor-default">!</span>
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[var(--text-primary)] text-white text-[10px] whitespace-nowrap opacity-0 group-hover/nodoc:opacity-100 transition-opacity pointer-events-none z-20">No document attached to {isPV ? 'payment voucher' : 'official receipt'}</span>
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {/* Accountant: tooltip on hover */}
                            {config.showRichPreview && (
                              <div className="absolute left-4 top-full z-20 mt-0.5 px-3 py-2 bg-[var(--text-primary)] text-white text-xs max-w-[400px] opacity-0 group-hover/row:opacity-100 transition-opacity duration-75 pointer-events-none shadow-lg whitespace-pre-line">
                                {txn.description.split(' | ').join('\n')}
                                {txn.reference ? `\nRef: ${txn.reference}` : ''}
                                {txn.cheque_number ? `\nCheque: ${txn.cheque_number}` : ''}
                              </div>
                            )}
                          </td>
                          <td data-col="Date" className="px-2 py-2.5 text-body-sm text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{formatDate(txn.transaction_date)}</td>
                          <td data-col="Description" className="px-2 py-2.5 text-body-sm text-[var(--text-primary)] max-w-[250px] truncate" title={txn.description}>
                            {txn.description.split(' | ')[0]}
                            {txn.reference && <span className="ml-1 text-[var(--text-secondary)] text-label-sm">({txn.reference})</span>}
                          </td>
                          <td data-col="Debit" className="px-2 py-2.5 text-body-sm text-right tabular-nums text-[var(--reject-red)] whitespace-nowrap">{txn.debit ? formatRM(txn.debit) : '-'}</td>
                          <td data-col="Credit" className="px-2 py-2.5 text-body-sm text-right tabular-nums text-[var(--match-green)] whitespace-nowrap">{txn.credit ? formatRM(txn.credit) : '-'}</td>
                          <td data-col="Balance" className="px-2 py-2.5 text-body-sm text-right tabular-nums text-[var(--text-secondary)] whitespace-nowrap">{txn.balance ? formatRM(txn.balance) : '-'}</td>
                          <td data-col="Notes" className="px-2 py-2.5 text-body-sm text-[var(--text-secondary)]">
                            {txn.notes || '—'}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {txn.recon_status === 'unmatched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); openMatchModal(txn); }} disabled={matchingBlocked} title={matchingBlocked ? 'Fix balance mismatch before matching' : 'Match'} className={`btn-thick-green text-label-sm w-9 py-1.5 text-white text-center ${matchingBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}>✓</button>
                              </div>
                            )}
                            {txn.recon_status === 'matched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); setPreviewTxn(txn); }} disabled={matchingBlocked} title={matchingBlocked ? 'Fix balance mismatch before reviewing' : 'Review'} className={`btn-thick-amber text-label-sm w-[70px] py-1.5 text-center ${matchingBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}>Review</button>
                                <button onClick={(e) => { e.stopPropagation(); requestUnmatch(txn); }} disabled={matchingBlocked} title={matchingBlocked ? 'Fix balance mismatch before unmatching' : 'Unmatch'} className={`btn-thick-red text-label-sm w-9 py-1.5 text-white text-center ${matchingBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}>✕</button>
                              </div>
                            )}
                            {txn.recon_status === 'manually_matched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); requestUnmatch(txn); }} disabled={matchingBlocked} title={matchingBlocked ? 'Fix balance mismatch before unmatching' : 'Unmatch'} className={`btn-thick-red text-label-sm w-9 py-1.5 text-white text-center ${matchingBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}>✕</button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Admin: Inline expansion */}
                        {!config.showRichPreview && isExpanded && hasExpandable && (
                          <tr className="bg-blue-50/30">
                            <td colSpan={8} className="px-5 py-4">
                              {/* Matched Claims */}
                              {hasClaims && (
                                <div className="mb-3">
                                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Matched Claim{txn.matched_claims.length > 1 ? 's' : ''}</p>
                                  {txn.matched_claims.map((claim) => (
                                    <div key={claim.id} className="bg-white border-b-2 border-r border-[rgba(0,0,0,0.08)] p-3 mb-2 last:mb-0">
                                      <p className="text-body-sm font-semibold text-[var(--text-primary)]">{claim.employee_name} — {claim.merchant}</p>
                                      <p className="text-body-sm text-[var(--text-secondary)]">{claim.category_name} · {formatDate(claim.claim_date)}</p>
                                      <p className="text-body-sm font-medium text-[var(--text-primary)] mt-1 tabular-nums">{formatRM(claim.amount)}</p>
                                      {claim.file_url && (
                                        <a href={claim.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 mt-2 text-label-sm text-[var(--primary)] hover:opacity-80">
                                          View Receipt &rarr;
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {mp && (<><div className="grid grid-cols-3 gap-4 mb-3">
                                <div>
                                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Payment To</p>
                                  <p className="text-body-md font-medium text-[var(--text-primary)]">{mp.supplier_name}</p>
                                  <p className="text-body-sm text-[var(--text-secondary)]">{formatDate(mp.payment_date)} — {formatRM(mp.amount)} — {mp.direction}</p>
                                  {mp.reference && <p className="text-label-sm text-[var(--text-secondary)]">Ref: {mp.reference}</p>}
                                  {mp.notes && <p className="text-label-sm text-[var(--text-secondary)] italic">{mp.notes}</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Match Info</p>
                                  <span className={cfg.cls} data-tooltip={cfg.tooltip}>{cfg.label}</span>
                                  {txn.matched_at && <p className="text-label-sm text-[var(--text-secondary)] mt-1">{formatDate(txn.matched_at)}</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Bank Description</p>
                                  <p className="text-body-sm text-[var(--text-secondary)]">{txn.description.replace(/ \| /g, '\n')}</p>
                                </div>
                              </div>

                              {mp.allocations.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Linked Invoices ({mp.allocations.length})</p>
                                  <div className="space-y-1">
                                    {mp.allocations.map((a) => (
                                      <div key={a.invoice_id}
                                        onClick={(e) => { e.stopPropagation(); setPreviewInvoice(a); }}
                                        className="flex items-center justify-between bg-white px-3 py-2 border-b border-[var(--surface-low)] hover:bg-[var(--surface-low)] transition-colors cursor-pointer">
                                        <div>
                                          <span className="text-body-sm font-medium text-[var(--primary)]">{a.invoice_number ?? 'No number'}</span>
                                          {a.invoice_number?.startsWith('PV-') && !a.file_url && (
                                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">No doc</span>
                                          )}
                                          <span className="text-label-sm text-[var(--text-secondary)] ml-2">{a.vendor_name} — {formatDate(a.issue_date)}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-body-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(a.allocated_amount)}</span>
                                          <span className="text-label-sm text-[var(--text-secondary)] ml-1">/ {formatRM(a.total_amount)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mp.receipts.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Linked Receipts ({mp.receipts.length})</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {mp.receipts.map((r) => (
                                      <div key={r.id}
                                        onClick={(e) => { e.stopPropagation(); setPreviewReceipt(r); }}
                                        className="flex items-center gap-3 bg-white px-3 py-2 border-b border-[var(--surface-low)] hover:bg-[var(--surface-low)] transition-colors cursor-pointer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="w-10 h-10 object-cover flex-shrink-0" />}
                                        <div className="min-w-0">
                                          <p className="text-body-sm font-medium text-[var(--primary)] truncate">{r.merchant}</p>
                                          <p className="text-label-sm text-[var(--text-secondary)]">{r.receipt_number ?? 'No #'} — {formatDate(r.claim_date)} — <span className="tabular-nums">{formatRM(r.amount)}</span></p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mp.allocations.length === 0 && mp.receipts.length === 0 && (
                                <p className="text-body-sm text-[var(--text-secondary)] italic">No invoices or receipts linked to this payment yet.</p>
                              )}

                              {/* Admin JV Preview (simple) */}
                              {(txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') && (() => {
                                const receipt = mp.receipts[0];
                                const hasExplicitGl = !!(receipt?.gl_label && receipt?.contra_gl_label);
                                const bankGl = statement.bank_gl_label;
                                // Use matched item amounts (not bank txn amount) — partial matches
                                const matchedAmt = (() => {
                                  let total = 0;
                                  if (txn.matched_invoice_allocations?.length) {
                                    for (const a of txn.matched_invoice_allocations) total += Number(a.allocation_amount);
                                  } else if (txn.matched_invoice) {
                                    total += Number(txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount);
                                  }
                                  if (txn.matched_claims?.length) {
                                    for (const c of txn.matched_claims) total += Number(c.amount);
                                  }
                                  if (txn.matched_sales_invoice) total += Number(txn.matched_sales_invoice.total_amount);
                                  return total > 0 ? total.toFixed(2) : (txn.credit ?? txn.debit ?? '0');
                                })();

                                const debitLabel = hasExplicitGl ? receipt.gl_label! : (txn.credit ? (bankGl ?? `${statement.bank_name} (no GL mapped)`) : (receipt?.gl_label ?? 'Trade Payables (default)'));
                                const creditLabel = hasExplicitGl ? receipt.contra_gl_label! : (txn.credit ? (receipt?.gl_label ?? 'Staff Claims Payable (default)') : (bankGl ?? `${statement.bank_name} (no GL mapped)`));

                                const glMismatch = hasExplicitGl && bankGl && receipt.gl_label !== bankGl && receipt.contra_gl_label !== bankGl;

                                return (
                                  <div className="mt-3 bg-white border-b-2 border-r border-[rgba(0,0,0,0.08)] p-3">
                                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Journal Entry Preview</p>
                                    <table className="w-full text-body-sm">
                                      <thead>
                                        <tr className="text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">
                                          <th className="py-1">Account</th>
                                          <th className="py-1 text-right">Debit</th>
                                          <th className="py-1 text-right">Credit</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr><td className="py-1 text-[var(--text-primary)] font-medium">{debitLabel}</td><td className="py-1 text-right tabular-nums">{formatRM(matchedAmt)}</td><td className="py-1 text-right">-</td></tr>
                                        <tr><td className="py-1 text-[var(--text-primary)] font-medium">{creditLabel}</td><td className="py-1 text-right">-</td><td className="py-1 text-right tabular-nums">{formatRM(matchedAmt)}</td></tr>
                                      </tbody>
                                    </table>
                                    {glMismatch && (
                                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1.5">
                                        Warning: Receipt GL does not reference this bank statement&apos;s GL ({bankGl}). Verify the GL accounts are correct before confirming.
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                              </>)}
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t-2 border-[var(--surface-header)]">
                      <td colSpan={3} className="px-2 py-2.5 text-body-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-low)]">Total</td>
                      <td className="px-2 py-2.5 text-body-sm text-right tabular-nums font-bold text-[var(--reject-red)] whitespace-nowrap bg-[var(--surface-low)]">{formatRM(totalDebit)}</td>
                      <td className="px-2 py-2.5 text-body-sm text-right tabular-nums font-bold text-[var(--match-green)] whitespace-nowrap bg-[var(--surface-low)]">{formatRM(totalCredit)}</td>
                      <td colSpan={3} className="bg-[var(--surface-low)]" />
                    </tr>
                    <tr className="border-t border-[var(--primary-container)]">
                      <td colSpan={3} className="px-2 py-2.5 text-body-sm font-semibold text-white bg-[var(--primary)]">Matched</td>
                      <td className="px-2 py-2.5 text-body-sm text-right tabular-nums font-bold text-white/80 whitespace-nowrap bg-[var(--primary)]">{formatRM(matchedDebit)}</td>
                      <td className="px-2 py-2.5 text-body-sm text-right tabular-nums font-bold text-white/80 whitespace-nowrap bg-[var(--primary)]">{formatRM(matchedCredit)}</td>
                      <td colSpan={3} className="bg-[var(--primary)]" />
                    </tr>
                    {statement && statement.summary.unmatched === 0 && (Math.abs(matchedDebit - totalDebit) > 0.01 || Math.abs(matchedCredit - totalCredit) > 0.01) && (
                      <tr className="bg-amber-50 border-t border-amber-200">
                        <td colSpan={8} className="px-2 py-2.5 text-body-sm text-amber-700">
                          <span className="font-semibold">Reconciliation gap:</span>{' '}
                          All transactions are matched but totals differ —
                          {Math.abs(matchedDebit - totalDebit) > 0.01 && <> Debit: matched <span className="tabular-nums font-semibold">{formatRM(matchedDebit)}</span> vs total <span className="tabular-nums font-semibold">{formatRM(totalDebit)}</span></>}
                          {Math.abs(matchedDebit - totalDebit) > 0.01 && Math.abs(matchedCredit - totalCredit) > 0.01 && ' | '}
                          {Math.abs(matchedCredit - totalCredit) > 0.01 && <> Credit: matched <span className="tabular-nums font-semibold">{formatRM(matchedCredit)}</span> vs total <span className="tabular-nums font-semibold">{formatRM(totalCredit)}</span></>}
                          . Some matches may be partial.
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
                {filteredTxns.length === 0 && (
                  <div className="text-center py-8 text-sm text-[var(--text-secondary)]">No transactions in this filter.</div>
                )}
              </div>

            </>
          )}

          {/* ═══ TRANSACTION PREVIEW MODAL (accountant only — rich preview) ═══ */}
          {config.showRichPreview && previewTxn && (
            <BankReconPreviewModal
              txn={previewTxn}
              statement={statement}
              config={config}
              expandedDocUrl={expandedDocUrl}
              confirming={confirming}
              onClose={() => setPreviewTxn(null)}
              onConfirm={doConfirm}
              onUnmatch={(txnId) => {
                const txn = statement?.transactions.find(t => t.id === txnId);
                if (txn) { setPreviewTxn(null); requestUnmatch(txn); }
              }}
              onOpenMatchModal={openMatchModal}
              onSetExpandedDocUrl={setExpandedDocUrl}
              onSetPreviewInvoice={setPreviewInvoice}
              onSetPreviewClaim={setPreviewClaim}
              matchingDisabled={matchingBlocked}
              onRefresh={loadStatement}
              onPrev={(() => {
                const idx = filteredTxns.findIndex(t => t.id === previewTxn.id);
                return idx > 0 ? () => setPreviewTxn(filteredTxns[idx - 1]) : undefined;
              })()}
              onNext={(() => {
                const idx = filteredTxns.findIndex(t => t.id === previewTxn.id);
                return idx >= 0 && idx < filteredTxns.length - 1 ? () => setPreviewTxn(filteredTxns[idx + 1]) : undefined;
              })()}
            />
          )}

          {/* ═══ MATCH MODAL ═══ */}
          {matchingTxn && (
            <BankReconMatchModal
              matchingTxn={matchingTxn}
              config={config}
              statement={statement}
              claimSearch={claimSearch}
              onClaimSearchChange={setClaimSearch}
              onSearchOutstandingItems={searchOutstandingItems}
              outstandingItems={outstandingItems}
              candidates={candidates}
              loadingCandidates={loadingCandidates}
              selectedItem={selectedItem}
              onSetSelectedItem={setSelectedItem}
              selectedClaimIds={selectedClaimIds}
              onSetSelectedClaimIds={setSelectedClaimIds}
              matchTab={matchTab}
              onSetMatchTab={setMatchTab}
              txnDescDraft={txnDescDraft}
              onSetTxnDescDraft={setTxnDescDraft}
              onSaveDescription={async () => {
                const trimmed = txnDescDraft.trim();
                if (!trimmed || !config.apiUpdateTxn) return;
                const newDesc = trimmed.split('\n').join(' | ');
                await fetch(config.apiUpdateTxn, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bankTransactionId: matchingTxn.id, description: newDesc }),
                });
                setMatchingTxn({ ...matchingTxn, description: newDesc });
                if (statement) {
                  setStatement({
                    ...statement,
                    transactions: statement.transactions.map((t) =>
                      t.id === matchingTxn.id ? { ...t, description: newDesc } : t
                    ),
                  });
                }
              }}
              onResetDescription={() => setTxnDescDraft(matchingTxn.description.split(' | ').join('\n'))}
              descriptionChanged={txnDescDraft.trim().split('\n').join(' | ') !== matchingTxn.description}
              expandedDocUrl={expandedDocUrl}
              onSetExpandedDocUrl={setExpandedDocUrl}
              matchSubmitting={matchSubmitting}
              matchError={matchError}
              onMatchItem={doMatchItem}
              onMatchLegacy={doMatchLegacy}
              onClose={closeMatchModal}
              showVoucherForm={showVoucherForm}
              showReceiptForm={showReceiptForm}
              voucherSuppliers={voucherSuppliers}
              voucherCategories={voucherCategories}
              voucherData={voucherData}
              onSetVoucherData={setVoucherData}
              creatingVoucher={creatingVoucher}
              creatingNewSupplier={creatingNewSupplier}
              onSetCreatingNewSupplier={setCreatingNewSupplier}
              voucherError={voucherError}
              receiptGlAccounts={receiptGlAccounts}
              onOpenVoucherForm={openVoucherForm}
              onOpenReceiptForm={openReceiptForm}
              onCreateVoucher={doCreateVoucher}
              onCreateReceipt={doCreateReceipt}
              onCloseVoucherForm={() => setShowVoucherForm(false)}
              onCloseReceiptForm={() => setShowReceiptForm(false)}
              onFetchNextVoucherNumber={fetchNextVoucherNumber}
              onFetchNextReceiptNumber={fetchNextReceiptNumber}
              onPrev={(() => {
                const idx = filteredTxns.findIndex(t => t.id === matchingTxn.id);
                return idx > 0 ? () => { closeMatchModal(); openMatchModal(filteredTxns[idx - 1]); } : undefined;
              })()}
              onNext={(() => {
                const idx = filteredTxns.findIndex(t => t.id === matchingTxn.id);
                return idx >= 0 && idx < filteredTxns.length - 1 ? () => { closeMatchModal(); openMatchModal(filteredTxns[idx + 1]); } : undefined;
              })()}
            />
          )}

        </main>
      </div>

      {/* ═══ Invoice Preview Modal ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <dl className="space-y-3">
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice No.</dt><dd className="text-body-md text-[var(--text-primary)] font-medium">{previewInvoice.invoice_number ?? '-'}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Vendor</dt><dd className="text-body-md text-[var(--text-primary)]">{previewInvoice.vendor_name}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Issue Date</dt><dd className="text-body-md text-[var(--text-primary)]">{formatDate(previewInvoice.issue_date)}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Amount</dt><dd className="text-title-md font-bold text-[var(--text-primary)] tabular-nums">{formatRM(previewInvoice.total_amount)}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Allocated to Payment</dt><dd className="text-title-md font-bold text-[var(--match-green)] tabular-nums">{formatRM(previewInvoice.allocated_amount)}</dd></div>
              </dl>

              {previewTxn && (
                <div className="bg-[var(--surface-low)] p-3">
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Reconciled via Bank Transaction</p>
                  <p className="text-body-sm text-[var(--text-secondary)]">{previewTxn.description.split(' | ')[0]}</p>
                  <p className="text-label-sm text-[var(--text-secondary)] tabular-nums">{formatDate(previewTxn.transaction_date)} — {previewTxn.debit ? `Debit ${formatRM(previewTxn.debit)}` : `Credit ${formatRM(previewTxn.credit)}`}</p>
                </div>
              )}
            </div>
            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)]">
              <button
                onClick={() => window.open(`${config.linkPrefix}/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                className="btn-thick-navy w-full py-2 text-sm font-semibold"
              >
                Open in Invoices
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ Claim Preview Modal (accountant only) ═══ */}
      {config.showClaimPreview && previewClaim && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee</dt><dd className="text-body-md text-[var(--text-primary)] font-medium">{previewClaim.employee_name}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</dt><dd className="text-body-md text-[var(--text-primary)]">{previewClaim.merchant}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</dt><dd className="text-body-md text-[var(--text-primary)]">{previewClaim.category_name}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt><dd className="text-body-md text-[var(--text-primary)]">{formatDate(previewClaim.claim_date)}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount</dt><dd className="text-title-md font-bold text-[var(--text-primary)] tabular-nums">{formatRM(previewClaim.amount)}</dd></div>
                {previewClaim.receipt_number && <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt #</dt><dd className="text-body-md text-[var(--text-primary)]">{previewClaim.receipt_number}</dd></div>}
              </dl>
              {previewClaim.file_url && (
                <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-body-sm text-[var(--primary)] hover:opacity-80">
                  View Receipt Document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)]">
              <button onClick={() => setPreviewClaim(null)} className="btn-thick-white w-full py-2 text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ Receipt Preview Modal ═══ */}
      {previewReceipt && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewReceipt(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewReceipt(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Receipt Details</h2>
              <button onClick={() => setPreviewReceipt(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                previewReceipt.file_url ? (
                  <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--surface-header)] cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--surface-header)]" />
                )
              ) : (
                <div className="w-full h-40 border border-[var(--surface-header)] bg-[var(--surface-low)] flex items-center justify-center text-[var(--text-secondary)] text-sm">No image</div>
              )}
              {previewReceipt.file_url && (
                <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--primary)] hover:underline">View full document</a>
              )}
              <dl className="space-y-3">
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</dt><dd className="text-body-md text-[var(--text-primary)] font-medium">{previewReceipt.merchant}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt No.</dt><dd className="text-body-md text-[var(--text-primary)]">{previewReceipt.receipt_number ?? '-'}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt><dd className="text-body-md text-[var(--text-primary)]">{formatDate(previewReceipt.claim_date)}</dd></div>
                <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount</dt><dd className="text-title-md font-bold text-[var(--text-primary)] tabular-nums">{formatRM(previewReceipt.amount)}</dd></div>
                {previewReceipt.gl_label && (
                  <div><dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">GL Account</dt><dd className="text-body-md text-[var(--text-primary)]">{previewReceipt.gl_label}</dd></div>
                )}
              </dl>

              {previewTxn && (
                <div className="bg-[var(--surface-low)] p-3">
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Reconciled via Bank Transaction</p>
                  <p className="text-body-sm text-[var(--text-secondary)]">{previewTxn.description.split(' | ')[0]}</p>
                  <p className="text-label-sm text-[var(--text-secondary)] tabular-nums">{formatDate(previewTxn.transaction_date)} — {previewTxn.debit ? `Debit ${formatRM(previewTxn.debit)}` : `Credit ${formatRM(previewTxn.credit)}`}</p>
                </div>
              )}
            </div>
            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)]">
              <button
                onClick={() => window.open(`${config.linkPrefix}/claims?search=${encodeURIComponent(previewReceipt.receipt_number ?? previewReceipt.merchant)}`, '_blank')}
                className="btn-thick-navy w-full py-2 text-sm font-semibold"
              >
                Open in Claims
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ UNMATCH CONFIRMATION MODAL ═══ */}
      {unmatchConfirmTxn && (() => {
        const ut = unmatchConfirmTxn;
        const mi = ut.matched_invoice;
        const msi = ut.matched_sales_invoice;
        const mia = ut.matched_invoice_allocations;
        const mc = ut.matched_claims;
        const mp = ut.matched_payment;
        const hasInv = !!(mi || (mia && mia.length > 0));
        const hasSales = !!msi;
        const hasClaims = mc && mc.length > 0;
        const hasPayment = !!mp;
        const isConfirmed = ut.recon_status === 'manually_matched';

        return (
          <>
            <div className="fixed inset-0 bg-[#070E1B]/50 backdrop-blur-[2px] z-[60]" onClick={() => setUnmatchConfirmTxn(null)} />
            <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" onClick={() => setUnmatchConfirmTxn(null)}>
              <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 bg-[var(--reject-red)]">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest">Confirm Unmatch</h3>
                  <p className="text-xs text-white/80 mt-1">This will reverse all effects of this match:</p>
                </div>

                <div className="p-6 space-y-4">
                  {/* Transaction summary */}
                  <div className="bg-[var(--surface-low)] p-3 space-y-1">
                    <p className="text-xs text-[var(--text-secondary)]">{ut.description.split(' | ')[0]}</p>
                    <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
                      {ut.debit ? `Debit ${formatRM(ut.debit)}` : `Credit ${formatRM(ut.credit)}`}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">{formatDate(ut.transaction_date)}</p>
                  </div>

                  {/* What will happen */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">The following will be reversed:</p>
                    <ul className="space-y-1.5 text-sm text-[var(--text-primary)]">
                      {isConfirmed && (
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                          <span>Journal Entry will be <strong>reversed</strong> (DR/CR flipped)</span>
                        </li>
                      )}
                      {hasInv && (
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                          <span>
                            {mia && mia.length > 1
                              ? `${mia.length} invoice allocations removed`
                              : `Invoice ${mi?.invoice_number ?? ''} — ${mi?.vendor_name ?? ''}`
                            } — payment status reset
                          </span>
                        </li>
                      )}
                      {hasSales && (
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                          <span>Sales invoice {msi!.invoice_number ?? ''} — {msi!.vendor_name} — payment status reset</span>
                        </li>
                      )}
                      {hasClaims && (
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                          <span>{mc!.length} claim{mc!.length > 1 ? 's' : ''} — payment status reset to unpaid</span>
                        </li>
                      )}
                      {hasPayment && (
                        <li className="flex items-start gap-2">
                          <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                          <span>Payment record {mp!.reference ?? ''} — {mp!.supplier_name} unlinked</span>
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                        <span>Transaction status reset to <strong>Unmatched</strong></span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
                  <button
                    onClick={() => doUnmatch(ut.id)}
                    disabled={unmatching}
                    className="btn-thick-red flex-1 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {unmatching ? 'Unmatching...' : 'Confirm Unmatch'}
                  </button>
                  <button
                    onClick={() => setUnmatchConfirmTxn(null)}
                    className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}
