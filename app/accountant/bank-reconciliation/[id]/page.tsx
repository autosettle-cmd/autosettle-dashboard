'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import HelpTooltip from '@/components/HelpTooltip';
import GlAccountSelect from '@/components/GlAccountSelect';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

interface PaymentAllocation {
  invoice_id: string;
  invoice_number: string | null;
  vendor_name: string;
  total_amount: string;
  issue_date: string;
  allocated_amount: string;
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
  matched_sales_invoice: { id: string; invoice_number: string; total_amount: string; amount_paid: string; issue_date: string; buyer_name: string } | null;
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

function formatDate(val: string) {
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

function formatRM(val: string | number | null) {
  if (val === null || val === undefined) return '-';
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  matched:          { label: 'Suggested',  cls: 'badge-amber' },
  manually_matched: { label: 'Confirmed',  cls: 'badge-green' },
  unmatched:        { label: 'Unmatched',  cls: 'badge-red' },
};

export default function AccountantReconciliationWorkspacePage() {
  usePageTitle('Bank Reconciliation');
  const { id } = useParams<{ id: string }>();
  useFirm(); // keep hook active for sidebar context

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'suggested' | 'confirmed'>('all');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [matchingTxn, setMatchingTxn] = useState<BankTxn | null>(null);
  const [editingTxnDesc, setEditingTxnDesc] = useState(false);
  const [txnDescDraft, setTxnDescDraft] = useState('');
  const [previewTxn, setPreviewTxn] = useState<BankTxn | null>(null);
  const [expandedDocUrl, setExpandedDocUrl] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<PaymentAllocation | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceipt | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewClaim, setPreviewClaim] = useState<any | null>(null);
  const [_candidates, _setCandidates] = useState<CandidatePayment[]>([]);
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

  // Payment voucher / official receipt creation (shared supplier+category lists)
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [voucherSuppliers, setVoucherSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [voucherCategories, setVoucherCategories] = useState<{ id: string; name: string }[]>([]);
  const [voucherData, setVoucherData] = useState({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: '' });
  const [creatingVoucher, setCreatingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState('');
  const [creatingNewSupplier, setCreatingNewSupplier] = useState(false);
  const [receiptGlAccounts, setReceiptGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);

  const loadStatement = () => {
    fetch(`/api/bank-reconciliation/statements/${id}`)
      .then((r) => r.json())
      .then((j) => { setStatement(j.data); setLoading(false); })
      .catch((err) => { console.error('Failed to load statement:', err); setLoading(false); });
  };

  useEffect(() => { loadStatement(); }, [id]);

  // Auto-rematch when statement loads with unmatched transactions
  const [autoRematched, setAutoRematched] = useState(false);
  useEffect(() => {
    if (!statement || autoRematched || rematching) return;
    const unmatched = statement.transactions.filter(t => t.recon_status === 'unmatched').length;
    if (unmatched > 0) {
      setAutoRematched(true);
      doRematch();
    }
  }, [statement]);


  const filteredTxns = statement?.transactions.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'suggested') return t.recon_status === 'matched';
    if (filter === 'confirmed') return t.recon_status === 'manually_matched';
    return t.recon_status === filter;
  }) ?? [];

  const suggestedCount = statement?.transactions.filter((t) => t.recon_status === 'matched').length ?? 0;
  const confirmedCount = statement?.transactions.filter((t) => t.recon_status === 'manually_matched').length ?? 0;

  const doConfirm = async (txnIds: string[]) => {
    setConfirming(true);
    setConfirmError('');
    try {
      const res = await fetch('/api/bank-reconciliation/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionIds: txnIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errMsg = json.error || 'Failed to confirm';
        setConfirmError(errMsg);
        alert(errMsg);
      } else {
        loadStatement();
      }
    } catch (e) { console.error(e); }
    finally { setConfirming(false); }
  };

  const doConfirmAll = () => {
    const suggestedIds = (statement?.transactions ?? [])
      .filter((t) => t.recon_status === 'matched')
      .map((t) => t.id);
    if (suggestedIds.length > 0) doConfirm(suggestedIds);
  };

  const closeMatchModal = () => {
    setMatchingTxn(null);
    setShowVoucherForm(false);
    setShowReceiptForm(false);
    setEditingTxnDesc(false);
    setTxnDescDraft('');
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: '' });
    setVoucherError('');
    setSelectedClaimIds(new Set());
    setMatchTab('invoices');
  };

  const openMatchModal = async (txn: BankTxn) => {
    // Always use the statement's firm -- bank statement belongs to exactly one firm
    const firmId = statement?.firm_id;
    if (!firmId) return;
    setMatchingTxn(txn);
    setShowVoucherForm(false);
    setShowReceiptForm(false);
    setVoucherError('');
    setMatchError('');
    setSelectedItem(null);
    setClaimSearch('');
    setLoadingCandidates(true);

    const amount = txn.debit ?? txn.credit ?? '';
    const direction = txn.debit ? 'outgoing' : 'incoming'; // debit in bank = money out (withdrawal), credit = money in (deposit)

    // Fetch outstanding invoices/claims
    const params = new URLSearchParams({ firmId, direction });
    if (amount) params.set('amount', amount);
    const res = await fetch(`/api/bank-reconciliation/outstanding-items?${params}`);
    const json = await res.json();
    setOutstandingItems(json.data ?? []);
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
    const res = await fetch(`/api/bank-reconciliation/outstanding-items?${params}`);
    const json = await res.json();
    setOutstandingItems(json.data ?? []);
  };

  const _doMatch = async (paymentId: string) => {
    if (!matchingTxn) return;
    await fetch('/api/bank-reconciliation/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: matchingTxn.id, paymentId }),
    });
    closeMatchModal();
    loadStatement();
  };

  const doMatchItem = async (item?: { type: string; id: string }) => {
    if (!matchingTxn) return;
    setMatchSubmitting(true);
    setMatchError('');
    try {
      const body: Record<string, unknown> = { bankTransactionId: matchingTxn.id };

      // Multi-claim match
      if (selectedClaimIds.size > 0) {
        body.claimIds = Array.from(selectedClaimIds);
      } else if (item) {
        if (item.type === 'invoice') body.invoiceId = item.id;
        else if (item.type === 'sales_invoice') body.salesInvoiceId = item.id;
        else if (item.type === 'claim') body.claimIds = [item.id];
      }

      const res = await fetch('/api/bank-reconciliation/match-item', {
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
      closeMatchModal();
      loadStatement();
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'Network error');
    }
    setMatchSubmitting(false);
  };

  // Save name-like description lines as supplier aliases for future auto-match
  const saveDescriptionAlias = (txn: BankTxn, supplierId?: string) => {
    if (!supplierId) return;
    const bankKeywords = /^(transfer|bulk|credit|debit|duitnow|instant|ibft|ibg|qr|settle|payment|giro|dr|cr|fps|epayment|salary|loan|interest|commission|charge|fee|reversal|mbb|cimb|ocbc|rhb|maybank|hsbc|uob|amb|sal\s)/i;
    const lines = txn.description.split(' | ').map(l => l.trim());
    for (const line of lines) {
      const lower = line.toLowerCase().replace(/\s*\*\s*$/, '').trim();
      if (lower.length < 3 || bankKeywords.test(lower) || /^\d/.test(lower) || /[(){}[\]]/.test(lower)) continue;
      const words = lower.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2 || !words.every(w => /^[a-zA-Z.*@'-]+$/.test(w))) continue;
      // Save as alias (fire-and-forget)
      fetch('/api/suppliers/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, alias: lower }),
      }).catch(() => {});
    }
  };

  // Shared: resolve supplier from bank transaction description
  // Level 1: supplier alias lookup (DB — learned from past vouchers/receipts/invoices)
  // Level 2: exact/partial match against existing supplier names
  // Level 3: extract name-like line from description for new supplier
  const resolveSupplierFromDesc = async (
    txn: BankTxn,
    suppliers: { id: string; name: string }[],
    firmId: string
  ): Promise<{ type: 'existing'; id: string; name: string } | { type: 'new'; name: string } | null> => {
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

  const openVoucherForm = async () => {
    setShowVoucherForm(true);
    setCreatingNewSupplier(false);
    setVoucherError('');
    const lastGl = localStorage.getItem('lastVoucherGl') || '';
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: lastGl });
    const firmId = statement?.firm_id;
    if (!firmId) return;
    const [suppRes, catRes, glRes] = await Promise.all([
      fetch(`/api/suppliers?firmId=${firmId}`).then((r) => r.json()),
      fetch(`/api/categories?firmId=${firmId}`).then((r) => r.json()),
      receiptGlAccounts.length > 0 ? Promise.resolve({ data: receiptGlAccounts }) : fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()),
    ]);
    const suppliers = (suppRes.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    setVoucherSuppliers(suppliers);
    setVoucherCategories(catRes.data ?? []);
    if (glRes.data) setReceiptGlAccounts(glRes.data);

    // Auto-resolve supplier from transaction description
    if (matchingTxn && firmId) {
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
    const prefix = name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PV';
    // Search existing invoices for PV-PREFIX-NNN pattern
    try {
      const res = await fetch(`/api/invoices?search=PV-${prefix}&firmId=${statement.firm_id}&take=50`);
      const j = await res.json();
      let maxNum = 0;
      const regex = new RegExp(`PV-${prefix}-(\\d+)`);
      for (const inv of j.data ?? []) {
        const match = inv.invoice_number?.match(regex);
        if (match) { const n = parseInt(match[1], 10); if (n > maxNum) maxNum = n; }
      }
      setVoucherData(prev => ({ ...prev, reference: `PV-${prefix}-${String(maxNum + 1).padStart(3, '0')}` }));
    } catch { /* ignore */ }
    // Auto-suggest GL from supplier
    if (supplierId) {
      try {
        const suppRes = await fetch(`/api/suppliers/${supplierId}?`);
        const suppJ = await suppRes.json();
        const defaultGl = suppJ.data?.default_gl_account_id;
        if (defaultGl) { setVoucherData(prev => ({ ...prev, gl_account_id: prev.gl_account_id || defaultGl })); }
      } catch { /* ignore */ }
    }
  };

  const doCreateVoucher = async () => {
    if (!matchingTxn || !voucherData.category_id) return;
    setCreatingVoucher(true);
    setVoucherError('');
    try {
      const res = await fetch('/api/bank-reconciliation/create-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: matchingTxn.id, ...voucherData }),
      });
      const json = await res.json();
      if (!res.ok) { setVoucherError(json.error || 'Failed to create payment voucher'); return; }
      if (json.data?.jv_warning) setVoucherError(`Created, but JV warning: ${json.data.jv_warning}`);
      if (voucherData.gl_account_id) localStorage.setItem('lastVoucherGl', voucherData.gl_account_id);
      // Save description names as supplier alias for future auto-match
      saveDescriptionAlias(matchingTxn, voucherData.supplier_id || json.data?.supplier_id);
      closeMatchModal();
      loadStatement();
    } finally { setCreatingVoucher(false); }
  };

  const openReceiptForm = async () => {
    setShowReceiptForm(true);
    setCreatingNewSupplier(false);
    setVoucherError('');
    const lastGl = localStorage.getItem('lastReceiptGl') || '';
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '', new_supplier_name: '', gl_account_id: lastGl });
    const firmId = statement?.firm_id;
    if (!firmId) return;
    const [suppRes, glRes] = await Promise.all([
      fetch(`/api/suppliers?firmId=${firmId}`).then((r) => r.json()),
      fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()),
    ]);
    const suppliers = (suppRes.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    setVoucherSuppliers(suppliers);
    setReceiptGlAccounts(glRes.data ?? []);

    // Auto-resolve supplier from transaction description
    if (matchingTxn && firmId) {
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
      // Fetch next receipt number
      const res = await fetch(`/api/bank-reconciliation/next-receipt-number?name=${encodeURIComponent(name.trim())}&firmId=${statement.firm_id}`);
      const j = await res.json();
      if (j.data) setVoucherData(prev => ({ ...prev, reference: j.data }));
    } catch { /* ignore */ }
    // Auto-suggest GL from supplier's default or last receipt
    if (supplierId) {
      try {
        const suppRes = await fetch(`/api/suppliers/${supplierId}?`);
        const suppJ = await suppRes.json();
        const defaultGl = suppJ.data?.default_gl_account_id;
        if (defaultGl) { setVoucherData(prev => ({ ...prev, gl_account_id: prev.gl_account_id || defaultGl })); return; }
        // Fallback: last SalesInvoice GL for this supplier
        const invRes = await fetch(`/api/sales-invoices?supplierId=${supplierId}&take=1`);
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
      const res = await fetch('/api/bank-reconciliation/create-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: matchingTxn.id, ...voucherData }),
      });
      const json = await res.json();
      if (!res.ok) { setVoucherError(json.error || 'Failed to create official receipt'); return; }
      if (json.data?.jv_warning) setVoucherError(`Created, but JV warning: ${json.data.jv_warning}`);
      if (voucherData.gl_account_id) localStorage.setItem('lastReceiptGl', voucherData.gl_account_id);
      // Save description names as supplier alias for future auto-match
      saveDescriptionAlias(matchingTxn, voucherData.supplier_id || json.data?.supplier_id);
      closeMatchModal();
      loadStatement();
    } finally { setCreatingVoucher(false); }
  };

  const doUnmatch = async (txnId: string) => {
    await fetch('/api/bank-reconciliation/unmatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: txnId }),
    });
    loadStatement();
  };


  const doRematch = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const res = await fetch('/api/bank-reconciliation/rematch', {
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
  return (
    <div className="flex h-screen overflow-hidden paper-texture">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[var(--surface-container-highest)]">
          <div className="flex items-center gap-3">
            <Link href="/accountant/bank-reconciliation" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
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
                {(() => {
                  const totalDebit = statement.transactions.reduce((s, t) => s + Number(t.debit ?? 0), 0);
                  const totalCredit = statement.transactions.reduce((s, t) => s + Number(t.credit ?? 0), 0);
                  return [
                    { label: 'Opening Balance', value: formatRM(statement.opening_balance), color: 'text-[var(--text-primary)]' },
                    { label: 'Total Debit', value: formatRM(totalDebit), color: 'text-[var(--reject-red)]' },
                    { label: 'Total Credit', value: formatRM(totalCredit), color: 'text-[var(--match-green)]' },
                    { label: 'Closing Balance', value: formatRM(statement.closing_balance), color: 'text-[var(--text-primary)]' },
                    { label: 'Confirmed', value: `${confirmedCount} / ${statement.summary.total}`, color: 'text-[var(--match-green)]' },
                    { label: 'Suggested', value: String(suggestedCount), color: suggestedCount > 0 ? 'text-amber-600' : 'text-[var(--match-green)]' },
                    { label: 'Unmatched', value: String(statement.summary.unmatched), color: statement.summary.unmatched > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--match-green)]' },
                  ];
                })().map((c) => (
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
                  <button
                    onClick={doConfirmAll}
                    disabled={confirming}
                    className="ml-auto btn-thick-green px-4 py-1.5 text-body-sm font-medium disabled:opacity-50"
                  >
                    {confirming ? 'Confirming...' : `Confirm All (${suggestedCount})`}
                  </button>
                )}
              </div>

              {confirmError && (
                <div className="mb-3 bg-[var(--error-container)] px-4 py-2 text-sm text-[var(--on-error-container)] whitespace-pre-line">{confirmError}</div>
              )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-6 pl-14 pt-2 pb-6 animate-in ledger-binding">
          {loading || !statement ? (
            <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
          ) : (
            <>
              {/* Transaction table */}
              <div className="bg-white overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--surface-header)]">
                      <th className="px-4 py-2.5 text-left w-[70px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                      <th className="px-3 py-2.5 text-left w-[80px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                      <th className="px-3 py-2.5 text-right w-[110px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Debit</th>
                      <th className="px-3 py-2.5 text-right w-[110px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Credit</th>
                      <th className="px-3 py-2.5 text-right w-[110px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                      <th className="px-3 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Matched To</th>
                      <th className="px-3 py-2.5 text-right w-[120px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">
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
                      const cfg = STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched;
                      const isSelected = previewTxn?.id === txn.id;
                      const mp = txn.matched_payment;
                      const rowBg = isSelected ? 'bg-blue-50/60' : txn.debit ? 'bg-red-50/40' : 'bg-green-50/30';
                      return (
                        <React.Fragment key={txn.id}>
                        <tr className={`group/row relative transition-colors cursor-pointer hover:bg-[var(--surface-header)] ${rowBg}`}
                          onClick={() => {
                            if (txn.recon_status === 'unmatched') { openMatchModal(txn); }
                            else { setPreviewTxn(isSelected ? null : txn); setExpandedDocUrl(null); }
                          }}
                        >
                          <td className="px-4 py-2.5">
                            <span className={cfg.cls}>{cfg.label}</span>
                            <div className="absolute left-4 top-full z-20 mt-0.5 px-3 py-2 bg-[var(--text-primary)] text-white text-xs max-w-[400px] opacity-0 group-hover/row:opacity-100 transition-opacity duration-75 pointer-events-none shadow-lg whitespace-pre-line">
                              {txn.description.split(' | ').join('\n')}
                              {txn.reference ? `\nRef: ${txn.reference}` : ''}
                              {txn.cheque_number ? `\nCheque: ${txn.cheque_number}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-body-sm text-[var(--text-secondary)] tabular-nums">{formatDate(txn.transaction_date)}</td>
                          <td className="px-3 py-2.5 text-body-sm text-[var(--text-primary)] max-w-[250px] truncate relative group/desc">
                            {txn.description.split(' | ')[0]}
                            {txn.reference && <span className="ml-1 text-[var(--text-secondary)] text-label-sm">({txn.reference})</span>}
                            {txn.description.includes(' | ') && (
                              <div className="absolute left-0 top-full z-10 mt-0.5 px-3 py-2 bg-[var(--text-primary)] text-white text-xs whitespace-pre-line max-w-[350px] opacity-0 group-hover/desc:opacity-100 transition-opacity duration-75 pointer-events-none shadow-lg">
                                {txn.description.split(' | ').join('\n')}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[var(--reject-red)]">{txn.debit ? formatRM(txn.debit) : '-'}</td>
                          <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[var(--match-green)]">{txn.credit ? formatRM(txn.credit) : '-'}</td>
                          <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[var(--text-secondary)]">{txn.balance ? formatRM(txn.balance) : '-'}</td>
                          <td className="px-3 py-2.5 text-body-sm text-[var(--text-secondary)]">
                            {mp ? (
                              <span>{mp.supplier_name} {mp.reference ? `(${mp.reference})` : ''}</span>
                            ) : txn.notes ? (
                              <span className="text-[var(--text-secondary)] italic">{txn.notes}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {txn.recon_status === 'unmatched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); openMatchModal(txn); }} className="btn-thick-navy text-label-sm w-[70px] py-1.5 text-white text-center">Match</button>
                              </div>
                            )}
                            {txn.recon_status === 'matched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); doConfirm([txn.id]); }} disabled={confirming} className="btn-thick-green text-label-sm w-[70px] py-1.5 text-white text-center disabled:opacity-50">Confirm</button>
                                <button onClick={(e) => { e.stopPropagation(); doUnmatch(txn.id); }} className="btn-thick-red text-label-sm w-[70px] py-1.5 text-white text-center">Unmatch</button>
                              </div>
                            )}
                            {txn.recon_status === 'manually_matched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); doUnmatch(txn.id); }} className="btn-thick-red text-label-sm w-[70px] py-1.5 text-white text-center">Unmatch</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {/* Inline expansion removed — uses preview modal */}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const allTxns = statement.transactions;
                      const totalDr = allTxns.reduce((s, t) => s + Number(t.debit ?? 0), 0);
                      const totalCr = allTxns.reduce((s, t) => s + Number(t.credit ?? 0), 0);
                      const opening = Number(statement.opening_balance ?? 0);
                      const closing = Number(statement.closing_balance ?? 0);
                      const expected = opening - totalDr + totalCr;
                      const diff = Math.abs(expected - closing);
                      const mismatch = diff > 0.01;
                      return (
                        <>
                          <tr className="bg-[var(--surface-low)] border-t-2 border-[var(--surface-header)]">
                            <td colSpan={3} className="px-4 py-2.5 text-body-sm font-semibold text-[var(--text-primary)]">Total</td>
                            <td className="px-3 py-2.5 text-body-sm text-right tabular-nums font-bold text-[var(--reject-red)] whitespace-nowrap">{formatRM(totalDr)}</td>
                            <td className="px-3 py-2.5 text-body-sm text-right tabular-nums font-bold text-[var(--match-green)] whitespace-nowrap">{formatRM(totalCr)}</td>
                            <td colSpan={3} />
                          </tr>
                          {mismatch && (
                            <tr className="bg-amber-50 border-t border-amber-200">
                              <td colSpan={8} className="px-4 py-2.5 text-body-sm text-amber-700">
                                <span className="font-semibold">Balance mismatch:</span> Opening (<span className="tabular-nums">{formatRM(opening)}</span>) - Debit (<span className="tabular-nums">{formatRM(totalDr)}</span>) + Credit (<span className="tabular-nums">{formatRM(totalCr)}</span>) = <span className="tabular-nums">{formatRM(expected)}</span>, but closing balance is <span className="tabular-nums">{formatRM(closing)}</span>. Difference: <strong className="tabular-nums">{formatRM(diff)}</strong> — the bank statement may have been parsed incorrectly.
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
                {filteredTxns.length === 0 && (
                  <div className="text-center py-8 text-sm text-[var(--text-secondary)]">No transactions in this filter.</div>
                )}
              </div>

            </>
          )}

          {/* ═══ TRANSACTION PREVIEW MODAL ═══ */}
          {previewTxn && (() => {
            const txn = previewTxn;
            const cfg = STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched;
            const mp = txn.matched_payment;
            const hasInvoices = !!(txn.matched_invoice || (txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 0));
            const hasSalesInvoice = !!txn.matched_sales_invoice;
            const hasClaims = txn.matched_claims && txn.matched_claims.length > 0;
            const hasMatches = hasInvoices || hasSalesInvoice || hasClaims || !!mp;

            return (
              <>
                <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewTxn(null)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewTxn(null)}>
                <div className="bg-white shadow-2xl w-full max-w-[1100px] max-h-[85vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
                  <div className="h-12 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
                    <h2 className="text-white font-bold text-xs uppercase tracking-widest">Transaction Details</h2>
                    <button onClick={() => setPreviewTxn(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
                  </div>

                  <div className="flex-1 flex min-h-0">
                    {/* ── Left: Transaction Details ── */}
                    <div className="w-2/5 overflow-y-auto p-5 space-y-3 border-r border-[#E0E3E5]">
                      <div className="flex items-center gap-2">
                        <span className={cfg.cls}>{cfg.label}</span>
                        {txn.matched_at && <span className="text-[10px] text-[var(--text-secondary)]">Matched {formatDate(txn.matched_at)}</span>}
                      </div>

                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt><dd className="text-sm text-[var(--text-primary)] tabular-nums">{formatDate(txn.transaction_date)}</dd></div>
                        {txn.debit && <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Debit</dt><dd className="text-sm font-medium text-[var(--reject-red)] tabular-nums">{formatRM(txn.debit)}</dd></div>}
                        {txn.credit && <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Credit</dt><dd className="text-sm font-medium text-[var(--match-green)] tabular-nums">{formatRM(txn.credit)}</dd></div>}
                        <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Balance</dt><dd className="text-sm text-[var(--text-secondary)] tabular-nums">{txn.balance ? formatRM(txn.balance) : '-'}</dd></div>
                      </dl>

                      <div className="border-t border-[#E0E3E5] pt-2">
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Description</p>
                        {txn.description.split(' | ').map((line, i) => (
                          <p key={i} className="text-sm text-[var(--text-primary)]">{line}</p>
                        ))}
                        {txn.reference && <p className="text-xs text-[var(--text-secondary)] mt-1">Ref: {txn.reference}</p>}
                        {txn.cheque_number && <p className="text-xs text-[var(--text-secondary)]">Cheque: {txn.cheque_number}</p>}
                      </div>

                      {txn.notes && (
                        <p className="text-xs text-[var(--text-secondary)] border-l-2 border-[var(--outline)] pl-3 py-1">{txn.notes}</p>
                      )}
                    </div>

                    {/* ── Right: Matched Items + Actions ── */}
                    <div className="w-3/5 flex flex-col min-h-0">
                      <div className="flex-1 overflow-y-auto p-5 space-y-3">
                        {hasMatches ? (
                          <>
                            {/* Matched invoices */}
                            {hasInvoices && (
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Invoice{txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 1 ? 's' : ''}</p>
                                {(txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 0
                                  ? txn.matched_invoice_allocations
                                  : txn.matched_invoice ? [{ invoice_id: txn.matched_invoice.id, invoice_number: txn.matched_invoice.invoice_number, vendor_name: txn.matched_invoice.vendor_name, total_amount: txn.matched_invoice.total_amount, allocation_amount: txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount, issue_date: txn.matched_invoice.issue_date }] : []
                                ).map((alloc, idx) => {
                                  const docUrl = txn.matched_invoice?.file_url ?? null;
                                  const driveMatch = docUrl?.match(/\/d\/([^/]+)/);
                                  const fileId = driveMatch?.[1];
                                  const isDocExpanded = expandedDocUrl === (docUrl ?? `inv-${idx}`);
                                  return (
                                  <div key={idx} className="mb-1.5">
                                    <button
                                      onClick={() => {
                                        if (docUrl) setExpandedDocUrl(isDocExpanded ? null : docUrl);
                                        else setPreviewInvoice({ invoice_id: 'invoice_id' in alloc ? alloc.invoice_id : txn.matched_invoice!.id, invoice_number: alloc.invoice_number, vendor_name: alloc.vendor_name, total_amount: alloc.total_amount, issue_date: alloc.issue_date, allocated_amount: String(alloc.allocation_amount) });
                                      }}
                                      className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${isDocExpanded ? '!bg-blue-50' : ''}`}>
                                      <div>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">{alloc.vendor_name}</p>
                                        <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{alloc.invoice_number} · {formatDate(alloc.issue_date)}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(String(alloc.allocation_amount))}</p>
                                        <p className="text-[10px] text-[var(--text-secondary)] tabular-nums normal-case tracking-normal">of {formatRM(alloc.total_amount)}</p>
                                      </div>
                                    </button>
                                    {isDocExpanded && fileId && (
                                      <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-[350px] border border-t-0 border-[#E0E3E5]" title="Invoice Preview" allow="autoplay" />
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Matched sales invoice */}
                            {hasSalesInvoice && txn.matched_sales_invoice && (
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Sales Invoice</p>
                                {(() => {
                                  const si = txn.matched_sales_invoice!;
                                  const siKey = `si-${si.id}`;
                                  const isSiExpanded = expandedDocUrl === siKey;
                                  return (
                                    <div>
                                      <button
                                        onClick={() => setExpandedDocUrl(isSiExpanded ? null : siKey)}
                                        className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${isSiExpanded ? '!bg-blue-50' : ''}`}>
                                        <div>
                                          <p className="text-sm font-medium text-[var(--text-primary)]">{si.buyer_name}</p>
                                          <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{si.invoice_number} · {formatDate(si.issue_date)}</p>
                                        </div>
                                        <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(si.total_amount)}</p>
                                      </button>
                                      {isSiExpanded && (
                                        <div className="border border-t-0 border-[#E0E3E5] p-3 bg-[var(--surface-low)] space-y-1">
                                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Invoice No.</dt><dd className="text-[var(--text-primary)]">{si.invoice_number}</dd></div>
                                            <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Issue Date</dt><dd className="text-[var(--text-primary)]">{formatDate(si.issue_date)}</dd></div>
                                            <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Total</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(si.total_amount)}</dd></div>
                                            <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Paid</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(si.amount_paid)}</dd></div>
                                          </dl>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Matched claims */}
                            {hasClaims && (
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Claim{txn.matched_claims.length > 1 ? 's' : ''}</p>
                                {txn.matched_claims.map((claim) => {
                                  const claimDocUrl = claim.file_url;
                                  const claimDriveMatch = claimDocUrl?.match(/\/d\/([^/]+)/);
                                  const claimFileId = claimDriveMatch?.[1];
                                  const isClaimDocExpanded = expandedDocUrl === (claimDocUrl ?? `claim-${claim.id}`);
                                  return (
                                  <div key={claim.id} className="mb-1.5">
                                    <button
                                      onClick={() => {
                                        if (claimDocUrl) setExpandedDocUrl(isClaimDocExpanded ? null : claimDocUrl);
                                        else if (claim.thumbnail_url) setExpandedDocUrl(isClaimDocExpanded ? null : (claim.thumbnail_url ?? `claim-${claim.id}`));
                                        else setPreviewClaim(claim);
                                      }}
                                      className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${isClaimDocExpanded ? '!bg-blue-50' : ''}`}>
                                      <div>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">{claim.employee_name} — {claim.merchant}</p>
                                        <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{claim.category_name} · {formatDate(claim.claim_date)}</p>
                                      </div>
                                      <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(claim.amount)}</p>
                                    </button>
                                    {isClaimDocExpanded && claimFileId && (
                                      <iframe src={`https://drive.google.com/file/d/${claimFileId}/preview`} className="w-full h-[350px] border border-t-0 border-[#E0E3E5]" title="Claim Preview" allow="autoplay" />
                                    )}
                                    {isClaimDocExpanded && claim.thumbnail_url && !claimFileId && (
                                      <div className="border border-t-0 border-[#E0E3E5] p-2">
                                        <img src={claim.thumbnail_url} alt="Claim" className="w-full object-contain max-h-[350px]" />
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Legacy matched payment */}
                            {mp && (
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Payment</p>
                                <div className="btn-thick-white w-full px-3 py-2 text-left cursor-default">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">{mp.supplier_name}</p>
                                  <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{formatDate(mp.payment_date)} — {formatRM(mp.amount)} — {mp.direction}</p>
                                  {mp.reference && <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">Ref: {mp.reference}</p>}
                                </div>
                              </div>
                            )}
                            {/* JV Preview */}
                            {(txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') && hasMatches && (() => {
                              const bankGl = statement?.bank_gl_label;
                              const amount = txn.debit ?? txn.credit;

                              // Build JV lines from matched items
                              const jvLines: { account: string; debit: string | null; credit: string | null }[] = [];

                              if (txn.debit) {
                                // Money out: DR contra (Trade Payables) / CR bank
                                const invoiceAllocs = txn.matched_invoice_allocations?.length
                                  ? txn.matched_invoice_allocations
                                  : txn.matched_invoice ? [{ vendor_name: txn.matched_invoice.vendor_name, allocation_amount: txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount }] : [];
                                for (const alloc of invoiceAllocs) {
                                  jvLines.push({ account: `Trade Payables — ${alloc.vendor_name}`, debit: formatRM(String(alloc.allocation_amount)), credit: null });
                                }
                                if (txn.matched_claims?.length) {
                                  for (const c of txn.matched_claims) {
                                    jvLines.push({ account: `${c.category_name} — ${c.merchant}`, debit: formatRM(c.amount), credit: null });
                                  }
                                }
                                jvLines.push({ account: bankGl ?? `${statement?.bank_name ?? 'Bank'} (no GL)`, debit: null, credit: formatRM(amount) });
                              } else {
                                // Money in: DR bank / CR contra (Trade Receivables)
                                jvLines.push({ account: bankGl ?? `${statement?.bank_name ?? 'Bank'} (no GL)`, debit: formatRM(amount), credit: null });
                                if (txn.matched_sales_invoice) {
                                  jvLines.push({ account: `Trade Receivables — ${txn.matched_sales_invoice.buyer_name}`, debit: null, credit: formatRM(txn.matched_sales_invoice.total_amount) });
                                }
                                if (txn.matched_claims?.length) {
                                  for (const c of txn.matched_claims) {
                                    jvLines.push({ account: `${c.category_name} — ${c.merchant}`, debit: null, credit: formatRM(c.amount) });
                                  }
                                }
                              }

                              if (jvLines.length < 2) return null;

                              return (
                                <div className="border border-[#E0E3E5] p-3 mt-1">
                                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Journal Entry Preview</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                                        <th className="py-1 text-left">Account</th>
                                        <th className="py-1 text-right w-24">Debit</th>
                                        <th className="py-1 text-right w-24">Credit</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {jvLines.map((line, i) => (
                                        <tr key={i}>
                                          <td className="py-1 text-[var(--text-primary)]">{line.account}</td>
                                          <td className="py-1 text-right tabular-nums">{line.debit ?? '-'}</td>
                                          <td className="py-1 text-right tabular-nums">{line.credit ?? '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {!bankGl && (
                                    <p className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-1">
                                      Bank account has no GL mapped — JV will fail on confirm.
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
                            No matched items
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="p-3 flex-shrink-0 bg-[var(--surface-low)] border-t border-[#E0E3E5] space-y-1.5">
                        <div className="flex gap-2">
                          {txn.recon_status === 'matched' && (
                            <>
                              <button onClick={() => { doConfirm([txn.id]); setPreviewTxn(null); }} disabled={confirming} className="btn-thick-green flex-1 py-1.5 text-xs disabled:opacity-50">
                                Confirm
                              </button>
                              <button onClick={() => { doUnmatch(txn.id); setPreviewTxn(null); }} className="btn-thick-red flex-1 py-1.5 text-xs">
                                Unmatch
                              </button>
                            </>
                          )}
                          {txn.recon_status === 'manually_matched' && (
                            <>
                              <div className="flex-1 flex items-center justify-center py-1.5 text-xs font-semibold text-[var(--match-green)] bg-green-50 border border-green-200">
                                Confirmed
                              </div>
                              <div className="flex-1 relative group">
                                <button disabled className="btn-thick-white w-full py-1.5 text-xs opacity-40 cursor-not-allowed">
                                  Edit
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[var(--text-primary)] text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                  Unmatch first to edit
                                </div>
                              </div>
                              <button onClick={() => { doUnmatch(txn.id); setPreviewTxn(null); }} className="btn-thick-red flex-1 py-1.5 text-xs">
                                Unmatch
                              </button>
                            </>
                          )}
                          {txn.recon_status === 'unmatched' && (
                            <button onClick={() => { setPreviewTxn(null); openMatchModal(txn); }} className="btn-thick-navy flex-1 py-1.5 text-xs">
                              Match
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </>
            );
          })()}

          {/* Match modal */}
          {matchingTxn && (
            <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={closeMatchModal}>
              <div className="bg-white shadow-xl w-[720px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="bg-[var(--primary)] px-6 py-4">
                  <h2 className="text-white font-bold text-sm uppercase tracking-widest">
                    {matchingTxn.debit ? 'Match Outgoing Payment' : 'Match Incoming Payment'}
                  </h2>
                </div>
                <div className="p-6 pb-0">
                  <div className="bg-[var(--surface-low)] p-4 mb-4">
                    {editingTxnDesc ? (
                      <div className="space-y-2">
                        <textarea
                          value={txnDescDraft}
                          onChange={(e) => setTxnDescDraft(e.target.value)}
                          className="input-field w-full text-sm"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const trimmed = txnDescDraft.trim();
                              if (!trimmed) return;
                              const newDesc = trimmed.split('\n').join(' | ');
                              await fetch('/api/bank-reconciliation/update-txn', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bankTransactionId: matchingTxn.id, description: newDesc }),
                              });
                              setMatchingTxn({ ...matchingTxn, description: newDesc });
                              setEditingTxnDesc(false);
                            }}
                            className="btn-thick-green px-3 py-1 text-[10px]"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingTxnDesc(false)} className="btn-thick-white px-3 py-1 text-[10px]">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="cursor-pointer group/desc-edit" onClick={() => { setEditingTxnDesc(true); setTxnDescDraft(matchingTxn.description.split(' | ').join('\n')); }}>
                        {matchingTxn.description.split(' | ').map((line, i) => (
                          <p key={i} className={`${i === 0 ? 'text-body-md font-medium text-[var(--text-primary)]' : 'text-body-sm text-[var(--text-secondary)]'}`}>{line}</p>
                        ))}
                        <span className="text-[10px] text-[var(--primary)] opacity-0 group-hover/desc-edit:opacity-100 transition-opacity">Click to edit</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-1.5 text-body-sm text-[var(--text-secondary)]">
                      <span className="tabular-nums">{formatDate(matchingTxn.transaction_date)}</span>
                      <span className="font-semibold text-[var(--text-primary)] tabular-nums">{matchingTxn.debit ? `Debit ${formatRM(matchingTxn.debit)}` : `Credit ${formatRM(matchingTxn.credit)}`}</span>
                      {matchingTxn.reference && <span>Ref: {matchingTxn.reference}</span>}
                    </div>
                  </div>

                  {/* Search outstanding items */}
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="Search by name, invoice number, or amount..."
                      value={claimSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setClaimSearch(val);
                        searchOutstandingItems(val);
                      }}
                      className="input-field w-full"
                    />
                  </div>

                  {/* Tabs -- only show for debit (outgoing) which has both invoices and claims */}
                  {matchingTxn.debit && (
                    <div className="flex border-b border-[var(--surface-header)]">
                      {(() => {
                        const invoiceCount = outstandingItems.filter((i: { type: string }) => i.type !== 'claim').length;
                        const claimCount = outstandingItems.filter((i: { type: string }) => i.type === 'claim').length;
                        return (
                          <>
                            <button
                              onClick={() => { setMatchTab('invoices'); setSelectedClaimIds(new Set()); }}
                              className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors ${
                                matchTab === 'invoices' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              Invoices ({invoiceCount})
                            </button>
                            <button
                              onClick={() => { setMatchTab('claims'); setSelectedItem(null); }}
                              className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors ${
                                matchTab === 'claims' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              Claims ({claimCount})
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4">
                {loadingCandidates ? (
                  <p className="text-sm text-[var(--text-secondary)] py-8 text-center">Loading...</p>
                ) : outstandingItems.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] py-8 text-center">No outstanding items found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(() => {
                      const invoiceItems = outstandingItems.filter((i: { type: string }) => i.type !== 'claim');
                      const claimItems = outstandingItems.filter((i: { type: string }) => i.type === 'claim');

                      // Group claims by employee
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const employeeGroups = new Map<string, { employeeName: string; claims: any[]; total: number }>();
                      for (const c of claimItems) {
                        const key = c.employeeId || c.name;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const group = employeeGroups.get(key) ?? { employeeName: c.employeeName || c.name, claims: [] as any[], total: 0 };
                        group.claims.push(c);
                        group.total += c.remaining;
                        employeeGroups.set(key, group);
                      }

                      // For credit (incoming), show only sales invoices (no tabs)
                      const showInvoices = !matchingTxn.debit || matchTab === 'invoices';
                      const showClaims = matchingTxn.debit && matchTab === 'claims';

                      return (
                        <>
                          {/* Invoice / Sales Invoice items */}
                          {showInvoices && invoiceItems.length > 0 && (
                            <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                              {matchingTxn.debit ? 'Outstanding Invoices' : 'Outstanding Sales Invoices'} ({invoiceItems.length})
                            </p>
                          )}
                          {showInvoices && invoiceItems.map((item: { type: string; id: string; reference: string | null; name: string; totalAmount: number; remaining: number; date: string; fileUrl?: string | null }) => {
                            const isSelected = selectedItem?.id === item.id;
                            const docUrl = item.fileUrl;
                            const driveMatch = docUrl?.match(/\/d\/([^/]+)/);
                            const fileId = driveMatch?.[1];
                            const isExpanded = expandedDocUrl === `match-${item.id}`;
                            return (
                              <div key={`${item.type}-${item.id}`} className="mb-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedItem(isSelected ? null : { type: item.type, id: item.id });
                                    setSelectedClaimIds(new Set());
                                    setExpandedDocUrl(isExpanded ? null : `match-${item.id}`);
                                  }}
                                  className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${
                                    isSelected ? '!bg-blue-50' : ''
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${
                                        item.type === 'invoice' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                      }`}>
                                        {item.type === 'invoice' ? 'INV' : 'SALES'}
                                      </span>
                                      <p className="text-sm font-medium text-[var(--text-primary)] truncate normal-case tracking-normal">{item.name}</p>
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 normal-case tracking-normal">
                                      {item.reference ?? ''} {item.reference ? '·' : ''} {formatDate(item.date)}
                                    </p>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-3">
                                    <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(String(item.remaining))}</p>
                                    {item.remaining !== item.totalAmount && (
                                      <p className="text-[10px] text-[var(--text-secondary)] tabular-nums normal-case tracking-normal">of {formatRM(String(item.totalAmount))}</p>
                                    )}
                                  </div>
                                </button>
                                {isExpanded && fileId && (
                                  <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-[300px] border border-t-0 border-[#E0E3E5]" title="Document Preview" allow="autoplay" />
                                )}
                                {isExpanded && !fileId && (
                                  <div className="border border-t-0 border-[#E0E3E5] p-3 bg-[var(--surface-low)] space-y-1">
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                      <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Type</dt><dd className="text-[var(--text-primary)]">{item.type === 'invoice' ? 'Purchase Invoice' : 'Sales Invoice'}</dd></div>
                                      <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">{item.type === 'invoice' ? 'Invoice No.' : 'Receipt No.'}</dt><dd className="text-[var(--text-primary)]">{item.reference ?? '—'}</dd></div>
                                      <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Date</dt><dd className="text-[var(--text-primary)]">{formatDate(item.date)}</dd></div>
                                      <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Total</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(String(item.totalAmount))}</dd></div>
                                      <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Remaining</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(String(item.remaining))}</dd></div>
                                    </dl>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {showInvoices && invoiceItems.length === 0 && (
                            <p className="text-sm text-[var(--text-secondary)] py-4 text-center">No outstanding invoices.</p>
                          )}

                          {/* Claims grouped by employee */}
                          {showClaims && Array.from(employeeGroups.entries()).map(([empKey, group]) => {
                            const allIds = new Set(group.claims.map((c: { id: string }) => c.id));
                            const allSelected = group.claims.every((c: { id: string }) => selectedClaimIds.has(c.id));
                            const someSelected = group.claims.some((c: { id: string }) => selectedClaimIds.has(c.id));

                            const toggleAll = () => {
                              setSelectedItem(null);
                              setSelectedClaimIds(prev => {
                                const next = new Set(prev);
                                if (allSelected) { allIds.forEach(id => next.delete(id)); }
                                else { allIds.forEach(id => next.add(id)); }
                                return next;
                              });
                            };

                            const toggleOne = (claimId: string) => {
                              setSelectedItem(null);
                              setSelectedClaimIds(prev => {
                                const next = new Set(prev);
                                if (next.has(claimId)) next.delete(claimId); else next.add(claimId);
                                return next;
                              });
                            };

                            return (
                              <div key={empKey} className="border-b border-[var(--surface-low)] overflow-hidden">
                                <div
                                  onClick={toggleAll}
                                  className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                                    allSelected ? 'bg-blue-50' : someSelected ? 'bg-blue-50/50' : 'hover:bg-[var(--surface-low)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={allSelected} onChange={() => {}} className="border-gray-300 text-[var(--primary)]" onClick={e => e.stopPropagation()} />
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700">CLAIMS</span>
                                    <p className="text-body-sm font-medium text-[var(--text-primary)]">{group.employeeName}</p>
                                    <span className="text-label-sm text-[var(--text-secondary)]">({group.claims.length})</span>
                                  </div>
                                  <p className="text-body-md font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(String(group.total))}</p>
                                </div>
                                <div className="border-t border-[var(--surface-low)]">
                                  {group.claims.map((c: { id: string; merchant: string; remaining: number; date: string; categoryName?: string; reference: string | null; fileUrl?: string | null; thumbnailUrl?: string | null }) => {
                                    const claimDocUrl = c.fileUrl;
                                    const claimDriveMatch = claimDocUrl?.match(/\/d\/([^/]+)/);
                                    const claimFileId = claimDriveMatch?.[1];
                                    const isClaimExpanded = expandedDocUrl === `match-claim-${c.id}`;
                                    return (
                                    <div key={c.id}>
                                      <div
                                        onClick={() => {
                                          toggleOne(c.id);
                                          if (claimDocUrl || c.thumbnailUrl) setExpandedDocUrl(isClaimExpanded ? null : `match-claim-${c.id}`);
                                        }}
                                        className={`flex items-center justify-between px-3 py-2 pl-10 cursor-pointer transition-colors border-t border-[var(--surface-low)] first:border-t-0 ${
                                          selectedClaimIds.has(c.id) ? 'bg-blue-50' : 'hover:bg-[var(--surface-low)]'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <input type="checkbox" checked={selectedClaimIds.has(c.id)} onChange={() => {}} className="border-gray-300 text-[var(--primary)]" onClick={e => e.stopPropagation()} />
                                          <div className="min-w-0">
                                            <p className="text-body-sm text-[var(--text-primary)] truncate">{c.merchant}</p>
                                            <p className="text-label-sm text-[var(--text-secondary)]">
                                              {c.reference ?? ''}{c.reference ? ' · ' : ''}{formatDate(c.date)}
                                              {c.categoryName ? ` · ${c.categoryName}` : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <p className="text-body-sm font-medium tabular-nums text-[var(--text-primary)] ml-3">{formatRM(String(c.remaining))}</p>
                                      </div>
                                      {isClaimExpanded && claimFileId && (
                                        <iframe src={`https://drive.google.com/file/d/${claimFileId}/preview`} className="w-full h-[250px] border border-t-0 border-[var(--surface-low)]" title="Claim Preview" allow="autoplay" />
                                      )}
                                      {isClaimExpanded && c.thumbnailUrl && !claimFileId && (
                                        <div className="border border-t-0 border-[var(--surface-low)] p-2">
                                          <img src={c.thumbnailUrl} alt="Claim" className="w-full object-contain max-h-[250px]" />
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {showClaims && employeeGroups.size === 0 && (
                            <p className="text-sm text-[var(--text-secondary)] py-4 text-center">No outstanding claims.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
                </div>

                <div className="px-6 pb-6 pt-2 bg-[var(--surface-low)]">
                {/* Match error */}
                {matchError && <p className="text-sm text-[var(--reject-red)] mb-2">{matchError}</p>}

                {/* Confirm match button */}
                {(selectedItem || selectedClaimIds.size > 0) && (
                  <button
                    onClick={() => doMatchItem(selectedItem ?? undefined)}
                    disabled={matchSubmitting}
                    className="btn-thick-green w-full py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {matchSubmitting ? 'Matching...' : selectedClaimIds.size > 1 ? `Match ${selectedClaimIds.size} Claims` : 'Confirm & Create JV'}
                  </button>
                )}

                {/* Official receipt option -- credit (money coming in) transactions only */}
                {matchingTxn.credit && (
                  <>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-[var(--surface-header)]" />
                      <span className="text-label-sm text-[var(--text-secondary)]">or</span>
                      <div className="flex-1 h-px bg-[var(--surface-header)]" />
                    </div>

                    {!showReceiptForm ? (
                      <button
                        onClick={openReceiptForm}
                        className="btn-thick-green w-full px-3 py-2 text-body-md font-medium"
                      >
                        + Create Official Receipt
                      </button>
                    ) : (
                      <div className="space-y-3 bg-white p-4">
                        <h3 className="text-body-md font-semibold text-[var(--text-primary)]">Create Official Receipt</h3>
                        <div className="bg-[var(--surface-low)] p-2.5 text-body-sm text-[var(--text-secondary)] flex gap-3">
                          <span>Amount: <strong className="tabular-nums">{formatRM(matchingTxn.credit)}</strong></span>
                          <span>Date: <strong>{formatDate(matchingTxn.transaction_date)}</strong></span>
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Received From</label>
                          {!creatingNewSupplier ? (
                            <div className="flex gap-2">
                              <select
                                value={voucherData.supplier_id}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  setVoucherData({ ...voucherData, supplier_id: id, new_supplier_name: '', gl_account_id: '' });
                                  const name = voucherSuppliers.find(s => s.id === id)?.name || 'Walk-in Customer';
                                  fetchNextReceiptNumber(name, id || undefined);
                                }}
                                className="input-field flex-1"
                              >
                                <option value="">Walk-in Customer (default)</option>
                                {voucherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                              <button
                                type="button"
                                onClick={() => { setCreatingNewSupplier(true); setVoucherData(prev => ({ ...prev, supplier_id: '', new_supplier_name: '' })); }}
                                className="btn-thick-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                              >
                                + New
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={voucherData.new_supplier_name}
                                onChange={(e) => {
                                  setVoucherData({ ...voucherData, new_supplier_name: e.target.value, supplier_id: '' });
                                }}
                                onBlur={() => { if (voucherData.new_supplier_name.trim()) fetchNextReceiptNumber(voucherData.new_supplier_name); }}
                                className="input-field flex-1"
                                placeholder="Enter new supplier name..."
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => { setCreatingNewSupplier(false); setVoucherData(prev => ({ ...prev, new_supplier_name: '' })); }}
                                className="btn-thick-white px-2.5 py-1.5 text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt No.</label>
                          <input
                            type="text"
                            value={voucherData.reference}
                            onChange={(e) => setVoucherData({ ...voucherData, reference: e.target.value })}
                            className="input-field w-full"
                            placeholder="Auto-generated"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">CR Account (Sales/Income GL)</label>
                          <GlAccountSelect
                            value={voucherData.gl_account_id}
                            onChange={(id) => setVoucherData({ ...voucherData, gl_account_id: id })}
                            accounts={receiptGlAccounts}
                            firmId={statement?.firm_id}
                            placeholder="Select GL account..."
                            preferredType="Revenue"
                          />
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">DR Bank Account (auto) / CR this account</p>
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes (optional)</label>
                          <input
                            type="text"
                            value={voucherData.notes}
                            onChange={(e) => setVoucherData({ ...voucherData, notes: e.target.value })}
                            className="input-field w-full"
                            placeholder="e.g. Payment received for invoice #123"
                          />
                        </div>
                        {voucherError && <p className="text-sm text-[var(--reject-red)]">{voucherError}</p>}
                        <div className="flex gap-3">
                          <button
                            onClick={doCreateReceipt}
                            disabled={creatingVoucher}
                            className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {creatingVoucher ? 'Creating...' : 'Create & Match'}
                          </button>
                          <button
                            onClick={() => setShowReceiptForm(false)}
                            className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Payment voucher option -- debit (money going out) transactions only */}
                {matchingTxn.debit && (
                  <>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-[var(--surface-header)]" />
                      <span className="text-label-sm text-[var(--text-secondary)]">or</span>
                      <div className="flex-1 h-px bg-[var(--surface-header)]" />
                    </div>

                    {!showVoucherForm ? (
                      <button
                        onClick={openVoucherForm}
                        className="btn-thick-navy w-full px-3 py-2 text-body-md font-medium"
                      >
                        + Create Payment Voucher
                      </button>
                    ) : (
                      <div className="space-y-3 bg-white p-4">
                        <h3 className="text-body-md font-semibold text-[var(--text-primary)]">Create Payment Voucher</h3>
                        <div className="bg-[var(--surface-low)] p-2.5 text-body-sm text-[var(--text-secondary)] flex gap-3">
                          <span>Amount: <strong className="tabular-nums">{formatRM(matchingTxn.debit)}</strong></span>
                          <span>Date: <strong>{formatDate(matchingTxn.transaction_date)}</strong></span>
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Paid To</label>
                          {!creatingNewSupplier ? (
                            <div className="flex gap-2">
                              <select
                                value={voucherData.supplier_id}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  setVoucherData({ ...voucherData, supplier_id: id, new_supplier_name: '', gl_account_id: '' });
                                  const name = voucherSuppliers.find(s => s.id === id)?.name || 'Walk-in Customer';
                                  fetchNextVoucherNumber(name, id || undefined);
                                }}
                                className="input-field flex-1"
                              >
                                <option value="">Walk-in Customer (default)</option>
                                {voucherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                              <button
                                type="button"
                                onClick={() => { setCreatingNewSupplier(true); setVoucherData(prev => ({ ...prev, supplier_id: '', new_supplier_name: '' })); }}
                                className="btn-thick-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                              >+ New</button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={voucherData.new_supplier_name}
                                onChange={(e) => setVoucherData({ ...voucherData, new_supplier_name: e.target.value, supplier_id: '' })}
                                onBlur={() => { if (voucherData.new_supplier_name.trim()) fetchNextVoucherNumber(voucherData.new_supplier_name); }}
                                className="input-field flex-1"
                                placeholder="Enter new supplier name..."
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => { setCreatingNewSupplier(false); setVoucherData(prev => ({ ...prev, new_supplier_name: '' })); }}
                                className="btn-thick-white px-2.5 py-1.5 text-xs font-medium"
                              >Cancel</button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Voucher No.</label>
                          <input
                            type="text"
                            value={voucherData.reference}
                            onChange={(e) => setVoucherData({ ...voucherData, reference: e.target.value })}
                            className="input-field w-full"
                            placeholder="Auto-generated"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                          <select
                            value={voucherData.category_id}
                            onChange={(e) => setVoucherData({ ...voucherData, category_id: e.target.value })}
                            className="input-field w-full"
                          >
                            <option value="">Select category...</option>
                            {voucherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">DR Account (Expense GL)</label>
                          <GlAccountSelect
                            value={voucherData.gl_account_id}
                            onChange={(id) => setVoucherData({ ...voucherData, gl_account_id: id })}
                            accounts={receiptGlAccounts}
                            firmId={statement?.firm_id}
                            placeholder="Select GL account..."
                            preferredType="Expense"
                          />
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">DR this account / CR Bank Account (auto)</p>
                        </div>
                        <div>
                          <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes (optional)</label>
                          <input
                            type="text"
                            value={voucherData.notes}
                            onChange={(e) => setVoucherData({ ...voucherData, notes: e.target.value })}
                            className="input-field w-full"
                            placeholder="e.g. Supplier payment for invoice #123"
                          />
                        </div>
                        {voucherError && <p className="text-sm text-[var(--reject-red)]">{voucherError}</p>}
                        <div className="flex gap-3">
                          <button
                            onClick={doCreateVoucher}
                            disabled={creatingVoucher || !voucherData.category_id}
                            className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {creatingVoucher ? 'Creating...' : 'Create & Match'}
                          </button>
                          <button
                            onClick={() => setShowVoucherForm(false)}
                            className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <button onClick={closeMatchModal} className="btn-thick-white mt-4 w-full px-3 py-2 text-body-md">
                  Cancel
                </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* === Invoice Preview Modal === */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
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
                onClick={() => window.open(`/accountant/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                className="btn-thick-navy w-full py-2 text-sm font-semibold"
              >
                Open in Invoices
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* === Claim Preview Modal === */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
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

      {/* === Receipt Preview Modal === */}
      {previewReceipt && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewReceipt(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewReceipt(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Receipt Details</h2>
              <button onClick={() => setPreviewReceipt(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                previewReceipt.file_url ? (
                  <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--surface-header)] cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
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
                onClick={() => window.open(`/accountant/claims?search=${encodeURIComponent(previewReceipt.receipt_number ?? previewReceipt.merchant)}`, '_blank')}
                className="btn-thick-navy w-full py-2 text-sm font-semibold"
              >
                Open in Claims
              </button>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
