'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePageTitle } from '@/lib/use-page-title';
import GlAccountSelect from '@/components/GlAccountSelect';
import { useFirm } from '@/contexts/FirmContext';
import StatCard from '@/components/StatCard';
import SearchButton from '@/components/SearchButton';
import type { InvoicesPageConfig } from '@/components/pages/InvoicesPageContent';

const InvoicePreviewPanel = dynamic(() => import('@/components/invoices/InvoicePreviewPanel'));
const InvoiceRejectModal = dynamic(() => import('@/components/invoices/InvoiceRejectModal'));

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimStats {
  thisMonth: number;
  thisMonthAmount: string;
  pendingReview: number;
  pendingAmount: string;
  pendingApproval: number;
  pendingApprovalAmount: string;
}

interface ReceiptStats {
  thisMonth: number;
  thisMonthAmount: string;
  unlinked: number;
  unlinkedAmount: string;
  notApproved: number;
  notApprovedAmount: string;
}

interface InvoiceStats {
  thisMonth: number;
  thisMonthAmount: string;
  pendingReview: number;
  pendingAmount: string;
  pendingApproval: number;
  pendingApprovalAmount: string;
}

interface Stats {
  claims: ClaimStats;
  receipts: ReceiptStats;
  invoices: InvoiceStats;
}

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_name: string;
  firm_name: string;
  firm_id: string;
  merchant: string;
  category_name: string;
  category_id: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: string;
  payment_status: string;
  confidence: string;
  receipt_number: string | null;
  description: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  rejection_reason: string | null;
  gl_account_id: string | null;
  gl_account_label: string | null;
  linked_payment_count: number;
}

interface InvoiceRow {
  id: string;
  vendor_name_raw: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  payment_terms: string | null;
  subtotal: string | null;
  tax_amount: string | null;
  total_amount: string;
  amount_paid: string;
  category_name: string;
  category_id: string;
  firm_id: string;
  firm_name: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  supplier_name: string | null;
  supplier_link_status: 'auto_matched' | 'unmatched' | 'confirmed';
  supplier_id: string | null;
  supplier_default_gl_id: string | null;
  supplier_default_contra_gl_id: string | null;
  uploader_name: string;
  confidence: string;
  thumbnail_url: string | null;
  file_url: string | null;
  notes: string | null;
  gl_account_id: string | null;
  gl_account_label: string | null;
  contra_gl_account_id: string | null;
  contra_gl_account_label: string | null;
  rejection_reason: string | null;
  lines: { id: string; description: string; quantity: string; unit_price: string; tax_amount: string; line_total: string; gl_account_id: string | null; gl_account_label: string | null; sort_order: number }[];
}

interface EditData {
  claim_date?: string;
  merchant: string;
  amount: string;
  category_id: string;
  receipt_number: string;
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'badge-amber' },
  reviewed:       { label: 'Reviewed',       cls: 'badge-blue'  },
};

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',  cls: 'badge-amber' },
  approved:         { label: 'Approved', cls: 'badge-green' },
  not_approved:     { label: 'Rejected', cls: 'badge-red'   },
};

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray'   },
  partially_paid: { label: 'Partial', cls: 'badge-amber'  },
  paid:           { label: 'Paid',    cls: 'badge-purple' },
};

const LINK_CFG: Record<string, { label: string; cls: string }> = {
  confirmed:    { label: 'Confirmed',   cls: 'badge-green' },
  auto_matched: { label: 'Suggested',   cls: 'badge-amber' },
  unmatched:    { label: 'Unconfirmed', cls: 'badge-red'   },
};

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountantDashboard() {
  usePageTitle('Dashboard');
  const { data: session } = useSession();
  const { firmId: globalFirmId, firmsLoaded } = useFirm();

  const [stats, setStats] = useState<Stats | null>(null);
  const [bankReconStats, setBankReconStats] = useState<{ totalStatements: number; unmatched: number; suggestedMatch: number } | null>(null);
  const [pendingClaims, setPendingClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [unlinkedReceipts, setUnlinkedReceipts] = useState<ClaimRow[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<InvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [activeTab, setActiveTab] = useState<'claims' | 'receipts' | 'invoices'>('claims');
  const [page, setPage] = useState(0);
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const PAGE_SIZE = 20;

  // GL account state for preview modals
  const [glAccounts, setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [selectedGlAccountId, setSelectedGlAccountId] = useState('');
  const [selectedContraGlId, setSelectedContraGlId] = useState('');
  const [_defaultContraGlId, setDefaultContraGlId] = useState('');

  // Invoice preview panel state (for shared component)
  const [invoiceEditMode, setInvoiceEditMode] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoiceEditData, setInvoiceEditData] = useState<any>(null);
  const [invoiceEditSaving, setInvoiceEditSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; firm_id: string; default_gl_account_id?: string | null; default_contra_gl_account_id?: string | null }[]>([]);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [showLineItems, setShowLineItems] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [lineSaving] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; invoiceIds: string[]; reason: string }>({ open: false, invoiceIds: [], reason: '' });
  const [fullInvoice, setFullInvoice] = useState<InvoiceRow | null>(null);

  const invoiceConfig: InvoicesPageConfig = {
    role: 'accountant',
    apiInvoices: '/api/invoices',
    apiBatch: '/api/invoices/batch',
    apiDelete: '/api/invoices/delete',
    apiCategories: '/api/categories',
    apiSuppliers: '/api/suppliers',
    linkPrefix: '/accountant',
    showFirmColumn: false,
    showApproval: true,
    showGlFields: true,
    showLineItems: true,
    firmsLoaded: true,
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const firstName = session?.user?.name?.split(' ')[0] ?? '';

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim, previewInvoice]);

  // Fetch GL accounts when claim preview opens + smart suggestion from history
  useEffect(() => {
    if (previewClaim) {
      let cancelled = false;
      Promise.all([
        fetch(`/api/gl-accounts?firmId=${previewClaim.firm_id}`).then(r => r.json()),
        fetch(`/api/categories?firmId=${previewClaim.firm_id}`).then(r => r.json()),
        fetch(`/api/accounting-settings?firmId=${previewClaim.firm_id}`).then(r => r.json()),
      ]).then(async ([glJson, catJson, settingsJson]) => {
        if (cancelled) return;
        const accounts = glJson.data ?? [];
        setGlAccounts(accounts);

        let glId = '';
        if (previewClaim.gl_account_id) {
          glId = previewClaim.gl_account_id;
        }

        // Priority: history suggestion first, then category override as fallback
        if (!glId && previewClaim.category_id) {
          try {
            const params = new URLSearchParams({ firmId: previewClaim.firm_id, categoryId: previewClaim.category_id });
            if (previewClaim.merchant) params.set('merchant', previewClaim.merchant);
            if (previewClaim.description) params.set('description', previewClaim.description);
            const suggestRes = await fetch(`/api/gl-accounts/suggest?${params}`);
            const suggestJson = await suggestRes.json();
            if (!cancelled && suggestJson.data?.gl_account_id) {
              glId = suggestJson.data.gl_account_id;
            }
          } catch { /* fail silently */ }
        }

        if (!glId) {
          const catData = catJson.data ?? [];
          const match = catData.find((c: { id: string; gl_account_id?: string }) => c.id === previewClaim.category_id);
          glId = match?.gl_account_id ?? '';
        }

        if (!cancelled) setSelectedGlAccountId(glId);
        let contraId = settingsJson.data?.default_staff_claims_gl_id ?? '';
        if (!contraId) {
          const claimsPayable = accounts.find((a: { name: string; account_type: string }) =>
            a.account_type === 'Liability' && /staff.?claims|claims.?payable/i.test(a.name)
          );
          if (claimsPayable) contraId = claimsPayable.id;
        }
        if (!cancelled) { setDefaultContraGlId(contraId); setSelectedContraGlId(contraId); }
      }).catch(console.error);
      return () => { cancelled = true; };
    } else {
      setGlAccounts([]); setSelectedGlAccountId(''); setSelectedContraGlId(''); setDefaultContraGlId('');
    }
  }, [previewClaim]);

  // Fetch full invoice + GL + suppliers in one batch when invoice preview opens
  useEffect(() => {
    if (previewInvoice) {
      let cancelled = false;
      setInvoiceEditMode(false);
      setInvoiceEditData(null);
      setShowLineItems(false);

      const firmId = previewInvoice.firm_id;
      const aliasPromise = previewInvoice.vendor_name_raw
        ? fetch(`/api/suppliers/by-alias?alias=${encodeURIComponent(previewInvoice.vendor_name_raw)}&firmId=${firmId}`).then(r => r.json()).catch(() => ({ data: null }))
        : Promise.resolve({ data: null });

      // Single Promise.all: invoice + GL + categories + settings + suppliers + alias
      Promise.all([
        fetch(`/api/invoices/${previewInvoice.id}`).then(r => r.json()),
        fetch(`/api/gl-accounts?firmId=${firmId}`).then(r => r.json()),
        fetch(`/api/categories?firmId=${firmId}`).then(r => r.json()),
        fetch(`/api/accounting-settings?firmId=${firmId}`).then(r => r.json()),
        fetch(`/api/suppliers?firmId=${firmId}`).then(r => r.json()),
        aliasPromise,
      ]).then(([invJson, glJson, catJson, settingsJson, suppJson, aliasJson]) => {
        if (cancelled) return;

        // Full invoice data
        if (invJson.data) setFullInvoice(invJson.data);
        const inv = invJson.data || previewInvoice;

        // GL accounts
        const accounts = glJson.data ?? [];
        setGlAccounts(accounts);

        // Categories
        setCategories(catJson.data ?? []);

        // Suppliers
        setSuppliers((suppJson.data ?? []).map((s: { id: string; name: string; firm_id: string; default_gl_account_id?: string; default_contra_gl_account_id?: string }) => ({
          id: s.id, name: s.name, firm_id: s.firm_id, default_gl_account_id: s.default_gl_account_id, default_contra_gl_account_id: s.default_contra_gl_account_id,
        })));

        // GL suggestion
        const aliasGl = aliasJson.data?.default_gl_account_id || '';
        const aliasContraGl = aliasJson.data?.default_contra_gl_account_id || '';

        // Expense GL: invoice → supplier default → alias match → category → empty
        if (inv.gl_account_id) {
          setSelectedGlAccountId(inv.gl_account_id);
        } else if (inv.supplier_default_gl_id) {
          setSelectedGlAccountId(inv.supplier_default_gl_id);
        } else if (aliasGl) {
          setSelectedGlAccountId(aliasGl);
        } else {
          const match = (catJson.data ?? []).find((c: { id: string; gl_account_id?: string }) => c.id === inv.category_id);
          setSelectedGlAccountId(match?.gl_account_id ?? '');
        }

        // Contra GL: invoice → supplier default → alias match → vendor-name fuzzy → firm default
        const firmDefaultContra = settingsJson.data?.gl_defaults?.trade_payables?.id || settingsJson.data?.default_trade_payables_gl_id || '';
        let resolvedContra = inv.contra_gl_account_id || inv.supplier_default_contra_gl_id || aliasContraGl;

        if (!resolvedContra) {
          const vendorLower = inv.vendor_name_raw.toLowerCase().replace(/[^a-z0-9]/g, '');
          const liabilityGls = accounts.filter((g: { account_type: string }) => g.account_type === 'Liability');
          const nameMatch = liabilityGls.find((g: { name: string }) => {
            const glLower = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return glLower.length > 2 && (vendorLower.includes(glLower) || glLower.includes(vendorLower));
          });
          if (nameMatch) resolvedContra = nameMatch.id;
        }

        setDefaultContraGlId(inv.supplier_default_contra_gl_id || aliasContraGl || firmDefaultContra);
        setSelectedContraGlId(resolvedContra || firmDefaultContra);
      }).catch(console.error);

      return () => { cancelled = true; };
    } else if (!previewClaim) {
      setGlAccounts([]); setSelectedGlAccountId(''); setSelectedContraGlId(''); setDefaultContraGlId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewInvoice]);

  // Fetch categories when entering edit mode
  useEffect(() => {
    if (editMode && categories.length === 0) {
      fetch('/api/categories')
        .then((r) => r.json())
        .then((j) => setCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [editMode, categories.length]);

  // Single consolidated dashboard fetch
  useEffect(() => {
    if (!firmsLoaded) return;
    const params = globalFirmId ? `?firmId=${globalFirmId}` : '';
    fetch(`/api/dashboard${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setStats(j.data.stats);
          setBankReconStats(j.data.bankRecon);
          setPendingClaims(j.data.pendingClaims ?? []);
          setUnlinkedReceipts(j.data.unlinkedReceipts ?? []);
          setPendingInvoices(j.data.pendingInvoices ?? []);
        }
        setLoadingClaims(false);
        setLoadingReceipts(false);
        setLoadingInvoices(false);
      })
      .catch((e) => {
        console.error(e);
        setLoadingClaims(false);
        setLoadingReceipts(false);
        setLoadingInvoices(false);
      });
  }, [refreshKey, firmsLoaded, globalFirmId]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const saveClaimEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/claims/${previewClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditMode(false);
        setEditData(null);
        setPreviewClaim(null);
        refresh();
      }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const approveClaim = async (id: string, glAccountId?: string, contraGlId?: string) => {
    try {
      const res = await fetch('/api/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimIds: [id],
          action: 'approve',
          ...(glAccountId && { gl_account_id: glAccountId }),
          ...(contraGlId && { contra_gl_account_id: contraGlId }),
        }),
      });
      if (res.ok) { setPreviewClaim(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  const rejectClaim = async (id: string) => {
    const reason = prompt('Rejection reason (optional):');
    try {
      const res = await fetch('/api/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: [id], action: 'reject', rejectionReason: reason || undefined }),
      });
      if (res.ok) { setPreviewClaim(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  // ─── Invoice preview actions (for shared InvoicePreviewPanel) ────────────

  const markInvoiceReviewed = async (id: string, glAccountId?: string) => {
    try {
      const body: Record<string, string> = { status: 'reviewed' };
      if (glAccountId) body.gl_account_id = glAccountId;
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        refresh();
        if (fullInvoice) {
          const glMatch = glAccountId ? glAccounts.find(a => a.id === glAccountId) : null;
          setFullInvoice({
            ...fullInvoice,
            status: 'reviewed',
            ...(glAccountId ? { gl_account_id: glAccountId, gl_account_label: glMatch ? `${glMatch.account_code} — ${glMatch.name}` : null } : {}),
          });
        }
      }
    } catch (e) { console.error(e); }
  };

  const invoiceBatchAction = async (invoiceIds: string[], action: 'approve' | 'reject' | 'revert', reason?: string, glAccountId?: string, contraGlId?: string) => {
    try {
      const res = await fetch('/api/invoices/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds, action, ...(reason && { reason }), ...(glAccountId && { gl_account_id: glAccountId }), ...(contraGlId && { contra_gl_account_id: contraGlId }) }),
      });
      if (res.ok) {
        refresh();
        if (fullInvoice && invoiceIds.includes(fullInvoice.id)) {
          const resolvedExpenseGlId = glAccountId || fullInvoice.gl_account_id || fullInvoice.supplier_default_gl_id;
          const resolvedContraGlId = contraGlId || fullInvoice.supplier_default_contra_gl_id;
          const expenseGl = resolvedExpenseGlId ? glAccounts.find(a => a.id === resolvedExpenseGlId) : null;
          const contraGl = resolvedContraGlId ? glAccounts.find(a => a.id === resolvedContraGlId) : null;
          setFullInvoice({
            ...fullInvoice,
            approval: action === 'approve' ? 'approved' : action === 'reject' ? 'not_approved' : 'pending_approval',
            ...(action === 'reject' && reason ? { rejection_reason: reason } : {}),
            ...(action === 'approve' ? {
              ...(resolvedExpenseGlId ? { gl_account_id: resolvedExpenseGlId, gl_account_label: expenseGl ? `${expenseGl.account_code} — ${expenseGl.name}` : fullInvoice.gl_account_label } : {}),
              ...(resolvedContraGlId ? { contra_gl_account_id: resolvedContraGlId, contra_gl_account_label: contraGl ? `${contraGl.account_code} — ${contraGl.name}` : null } : {}),
            } : {}),
          });
        }
      } else {
        const json = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(json.error || `Failed to ${action}`);
      }
    } catch (e) { console.error(e); }
  };

  const invoiceSaveEdit = async () => {
    if (!fullInvoice || !invoiceEditData) return;
    setInvoiceEditSaving(true);
    try {
      const body: Record<string, unknown> = { ...invoiceEditData };
      if (selectedGlAccountId) body.gl_account_id = selectedGlAccountId;
      const res = await fetch(`/api/invoices/${fullInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setInvoiceEditMode(false);
        setInvoiceEditData(null);
        // Refetch full invoice to get updated data
        const freshRes = await fetch(`/api/invoices/${fullInvoice.id}`);
        const freshJson = await freshRes.json();
        if (freshJson.data) setFullInvoice(freshJson.data);
        refresh();
      } else {
        const json = await res.json().catch(() => ({ error: 'Save failed' }));
        alert(json.error || 'Save failed');
      }
    } catch (e) { console.error(e); }
    finally { setInvoiceEditSaving(false); }
  };

  const invoiceConfirmSupplier = async (invoiceId: string, supplierId: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, supplier_link_status: 'confirmed' }),
      });
      if (res.ok && fullInvoice?.id === invoiceId) {
        const sup = suppliers.find(s => s.id === supplierId);
        setFullInvoice({ ...fullInvoice, supplier_id: supplierId, supplier_name: sup?.name ?? fullInvoice.supplier_name, supplier_link_status: 'confirmed' });
        refresh();
      }
    } catch (e) { console.error(e); }
  };

  const invoiceCreateAndAssignSupplier = async () => {
    if (!fullInvoice || !newSupplierName.trim()) return;
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim(), firm_id: fullInvoice.firm_id }),
      });
      const j = await res.json();
      if (j.data?.id) {
        setSuppliers(prev => [...prev, { id: j.data.id, name: newSupplierName.trim(), firm_id: fullInvoice.firm_id }]);
        setCreatingSupplier(false);
        setNewSupplierName('');
        await invoiceConfirmSupplier(fullInvoice.id, j.data.id);
      }
    } catch (e) { console.error(e); }
  };

  const invoiceDelete = async (id: string) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/invoices/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id }),
      });
      if (res.ok) { setPreviewInvoice(null); setFullInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[#191C1E]">
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <div className="flex items-center gap-3">
            <SearchButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 pl-14 paper-texture animate-in">

          {/* ── Stats ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="dash-housing">
              <p className="text-[10px] font-label font-bold uppercase tracking-widest mb-2" style={{ color: '#234B6E' }}>Expense Claims</p>
              <div className="grid grid-cols-3 gap-2 card-stagger">
                <StatCard label="This Month"        value={stats?.claims.thisMonth ?? null}        amount={stats ? formatRM(stats.claims.thisMonthAmount) : null}            color="default" href="/accountant/claims?type=claim" />
                <StatCard label="Pending Review"     value={stats?.claims.pendingReview ?? null}    amount={stats ? formatRM(stats.claims.pendingAmount) : null}              color="amber"   href="/accountant/claims?type=claim&status=pending_review" />
                <StatCard label="Pending Approval"   value={stats?.claims.pendingApproval ?? null}  amount={stats ? formatRM(stats.claims.pendingApprovalAmount) : null}      color="primary" href="/accountant/claims?type=claim&status=pending_approval" />
              </div>
            </div>

            <div className="dash-housing">
              <p className="text-[10px] font-label font-bold uppercase tracking-widest mb-2" style={{ color: '#234B6E' }}>Receipts</p>
              <div className="grid grid-cols-3 gap-2 card-stagger">
                <StatCard label="This Month"     value={stats?.receipts.thisMonth ?? null}    amount={stats ? formatRM(stats.receipts.thisMonthAmount) : null}   color="default" href="/accountant/claims?type=receipt" />
                <StatCard label="Unallocated"    value={stats?.receipts.unlinked ?? null}     amount={stats ? formatRM(stats.receipts.unlinkedAmount) : null}    color="amber"   href="/accountant/claims?type=receipt" />
                <StatCard label="Not Approved"   value={stats?.receipts.notApproved ?? null}  amount={stats ? formatRM(stats.receipts.notApprovedAmount) : null} color="primary" href="/accountant/claims?type=receipt" />
              </div>
            </div>

            <div className="dash-housing">
              <p className="text-[10px] font-label font-bold uppercase tracking-widest mb-2" style={{ color: '#234B6E' }}>Invoices</p>
              <div className="grid grid-cols-3 gap-2 card-stagger">
                <StatCard label="This Month"       value={stats?.invoices.thisMonth ?? null}       amount={stats ? formatRM(stats.invoices.thisMonthAmount) : null}           color="default" href="/accountant/invoices?tab=received" />
                <StatCard label="Pending Review"   value={stats?.invoices.pendingReview ?? null}   amount={stats ? formatRM(stats.invoices.pendingAmount) : null}             color="amber"   href="/accountant/invoices?tab=received&status=pending_review" />
                <StatCard label="Pending Approval" value={stats?.invoices.pendingApproval ?? null} amount={stats ? formatRM(stats.invoices.pendingApprovalAmount) : null}     color="primary" href="/accountant/invoices?tab=received&status=pending_approval" />
              </div>
            </div>

            <div className="dash-housing">
              <p className="text-[10px] font-label font-bold uppercase tracking-widest mb-2" style={{ color: '#234B6E' }}>Bank Reconciliation</p>
              <div className="grid grid-cols-3 gap-2 card-stagger">
                <StatCard label="Statements"        value={bankReconStats?.totalStatements ?? null}  color="default" href="/accountant/bank-reconciliation" />
                <StatCard label="Unmatched"         value={bankReconStats?.unmatched ?? null}         color={bankReconStats && bankReconStats.unmatched > 0 ? 'amber' : 'green'} href="/accountant/bank-reconciliation" />
                <StatCard label="Pending Confirm"   value={bankReconStats?.suggestedMatch ?? null}    color={bankReconStats && bankReconStats.suggestedMatch > 0 ? 'primary' : 'green'} href="/accountant/bank-reconciliation" />
              </div>
            </div>
          </div>

          {/* ── Needs Attention ────────────────────────────── */}
          <div className="bg-white">
            {/* Tab header */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-[#D0D3D8]" style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.12), inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.5)' }}>
              <div className="flex gap-2">
                {([
                  ['claims', 'Claims', pendingClaims.length],
                  ['receipts', 'Receipts', unlinkedReceipts.length],
                  ['invoices', 'Invoices', pendingInvoices.length],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); setPage(0); }}
                    className={`relative px-4 py-1.5 text-label-sm font-bold uppercase tracking-wider transition-colors ${
                      activeTab === key ? 'btn-thick-navy' : 'btn-thick-white'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className="notification-badge">{count}</span>
                    )}
                  </button>
                ))}
              </div>
              <Link
                href={activeTab === 'claims' ? '/accountant/claims' : activeTab === 'receipts' ? '/accountant/claims?type=receipt' : '/accountant/invoices'}
                className="text-[#234B6E] font-bold hover:opacity-80 text-sm transition-opacity"
              >
                View all {activeTab} &rarr;
              </Link>
            </div>

            {/* Claims tab */}
            {activeTab === 'claims' && (
              loadingClaims ? (
                <div className="px-5 py-12 text-center text-sm text-[#444650]">Loading...</div>
              ) : pendingClaims.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#444650]">No claims pending review</p>
                  <p className="text-xs text-[#444650] mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Date</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Employee</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Merchant</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Category</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650] text-right">Amount</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="table-stagger">
                      {pendingClaims.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c, idx) => {
                        const cfg = STATUS_CFG[c.status];
                        return (
                          <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[#F2F4F6]' : 'bg-white'}`}>
                            <td data-col="Date" className="px-6 py-3 text-[#444650] tabular-nums">{formatDate(c.claim_date)}</td>
                            <td data-col="Employee" className="px-6 py-3 text-[#191C1E] font-medium">{c.employee_name}</td>
                            <td data-col="Merchant" className="px-6 py-3 text-[#444650]">{c.merchant}</td>
                            <td data-col="Category" className="px-6 py-3 text-[#444650]">{c.category_name}</td>
                            <td data-col="Amount" className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                            <td data-col="Status" className="px-6 py-3">
                              {cfg && <span className={cfg.cls}>{cfg.label}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination total={pendingClaims.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
              )
            )}

            {/* Receipts tab */}
            {activeTab === 'receipts' && (
              loadingReceipts ? (
                <div className="px-5 py-12 text-center text-sm text-[#444650]">Loading...</div>
              ) : unlinkedReceipts.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#444650]">No unlinked receipts</p>
                  <p className="text-xs text-[#444650] mt-1">All receipts have been linked to payments.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="px-6 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[#444650]">Date</th>
                        <th className="px-6 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[#444650]">Merchant</th>
                        <th className="px-6 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[#444650]">Amount</th>
                        <th className="px-6 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[#444650]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="table-stagger">
                      {unlinkedReceipts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, idx) => (
                        <tr
                          key={r.id}
                          className={`group hover:bg-[#F2F4F6] transition-colors cursor-pointer text-body-md ${idx % 2 === 1 ? 'bg-[#F2F4F6]' : 'bg-white'}`}
                          onClick={() => setPreviewClaim(r)}
                        >
                          <td data-col="Date" className="px-6 py-2.5 text-[#444650]">{formatDate(r.claim_date)}</td>
                          <td data-col="Merchant" className="px-6 py-2.5 text-[#444650] font-medium">{r.merchant}</td>
                          <td data-col="Amount" className="px-6 py-2.5 text-right text-[#191C1E] font-semibold tabular-nums">{formatRM(r.amount)}</td>
                          <td data-col="Status" className="px-6 py-2.5"><span className="badge-amber">Unlinked</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination total={unlinkedReceipts.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
              )
            )}

            {/* Invoices tab */}
            {activeTab === 'invoices' && (
              loadingInvoices ? (
                <div className="px-5 py-12 text-center text-sm text-[#444650]">Loading...</div>
              ) : pendingInvoices.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#444650]">No invoices pending approval</p>
                  <p className="text-xs text-[#444650] mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Issue Date</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Vendor</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Invoice #</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Due Date</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650] text-right">Amount</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Payment</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[#444650]">Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="table-stagger">
                      {pendingInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((inv, idx) => {
                        const pmtCfg = PAYMENT_CFG[inv.payment_status];
                        const linkCfg = LINK_CFG[inv.supplier_link_status];
                        return (
                          <tr key={inv.id} onClick={() => setPreviewInvoice(inv)} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[#F2F4F6]' : 'bg-white'}`}>
                            <td data-col="Issue Date" className="px-6 py-3 text-[#444650] tabular-nums">{formatDate(inv.issue_date)}</td>
                            <td data-col="Vendor" className="px-6 py-3 text-[#191C1E] font-medium">{inv.vendor_name_raw}</td>
                            <td data-col="Invoice #" className="px-6 py-3 text-[#444650]">{inv.invoice_number ?? '-'}</td>
                            <td data-col="Due Date" className="px-6 py-3 text-[#444650] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                            <td data-col="Amount" className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                            <td data-col="Payment" className="px-6 py-3">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                            <td data-col="Supplier" className="px-6 py-3">{linkCfg && <span className={linkCfg.cls}>{linkCfg.label}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination total={pendingInvoices.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
              )
            )}
          </div>

        </main>
      </div>

      {/* ═══ CLAIM PREVIEW PANEL ═══ */}
      {previewClaim && (() => {
        const claimDriveMatch = previewClaim.file_url?.match(/\/d\/([^/]+)/);
        const claimFileId = claimDriveMatch?.[1];
        return (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[1100px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
            </div>

            {/* Two-panel body */}
            <div className="flex-1 flex min-h-0">
              {/* Left panel — details */}
              <div className="w-2/5 flex-shrink-0 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4">

              {editMode && editData ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Date</label>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Merchant</label>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Amount (RM)</label>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-recessed w-full">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Receipt Number</label>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Description</label>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <Field label="Employee" value={previewClaim.employee_name} />
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2">
                    Saving will reset status to Pending Review and approval to Pending.
                  </p>
                </div>
              ) : (
                <>
                  <dl className="space-y-3">
                    <Field label="Date"        value={formatDate(previewClaim.claim_date)} />
                    <Field label="Merchant"    value={previewClaim.merchant} />
                    <Field label="Employee"    value={previewClaim.employee_name} />
                    <Field label="Category"    value={previewClaim.category_name} />
                    <Field label="Amount"      value={formatRM(previewClaim.amount)} />
                    <Field label="Receipt No." value={previewClaim.receipt_number} />
                    <Field label="Description" value={previewClaim.description} />
                  </dl>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[STATUS_CFG[previewClaim.status], APPROVAL_CFG[previewClaim.approval]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH' ? 'text-green-600' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    }`}>{previewClaim.confidence}</span>
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 p-3">
                      <p className="text-[10px] font-label font-bold text-red-700 uppercase tracking-widest mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-700">{previewClaim.rejection_reason}</p>
                    </div>
                  )}
                </>
              )}

              {/* GL Account Assignment */}
              {!editMode && previewClaim.approval !== 'not_approved' && glAccounts.length > 0 && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Expense GL (Debit)</label>
                    {previewClaim.approval === 'approved' ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[var(--surface-header)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F6F3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                        <span className="text-sm font-medium text-[var(--text-primary)]">{previewClaim.gl_account_label ?? 'Not assigned'}</span>
                      </div>
                    ) : (
                      <GlAccountSelect
                        value={selectedGlAccountId}
                        onChange={setSelectedGlAccountId}
                        accounts={glAccounts}
                        firmId={previewClaim.firm_id}
                        placeholder="Select GL Account"
                        preferredType="Expense"
                        defaultType="Expense"
                        onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Contra GL (Credit)</label>
                    {previewClaim.approval === 'approved' ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[var(--surface-header)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F6F3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                        <span className="text-sm font-medium text-[var(--text-primary)]">{glAccounts.find(a => a.id === selectedContraGlId)?.account_code ?? ''} — {glAccounts.find(a => a.id === selectedContraGlId)?.name ?? 'Default'}</span>
                      </div>
                    ) : (
                      <GlAccountSelect
                        value={selectedContraGlId}
                        onChange={setSelectedContraGlId}
                        accounts={glAccounts}
                        firmId={previewClaim.firm_id}
                        placeholder="Select Contra GL Account"
                        preferredType="Liability"
                        defaultType="Liability"
                        defaultBalance="Credit"
                        onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                      />
                    )}
                  </div>
                </div>
              )}
              </div>{/* close left panel */}

              {/* Right panel — document preview + actions */}
              <div className="w-3/5 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                  {claimFileId ? (
                    <iframe src={`https://drive.google.com/file/d/${claimFileId}/preview`} className="w-full h-full min-h-[400px]" title="Document Preview" allow="autoplay" />
                  ) : previewClaim.thumbnail_url ? (
                    <div className="flex items-center justify-center h-full p-5">
                      {previewClaim.file_url ? (
                        <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer">
                          <img src={previewClaim.thumbnail_url} alt="Receipt" className="max-w-full max-h-[60vh] object-contain cursor-pointer hover:opacity-90 transition-opacity" />
                        </a>
                      ) : (
                        <img src={previewClaim.thumbnail_url} alt="Receipt" className="max-w-full max-h-[60vh] object-contain" />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No document available</div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex-shrink-0 p-4 flex gap-3 bg-[var(--surface-low)]">
                  {editMode ? (
                    <>
                      <button onClick={saveClaimEdit} disabled={editSaving} className="btn-thick-navy flex-1 px-5 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                        {editSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button onClick={() => { setEditMode(false); setEditData(null); }} className="btn-thick-white flex-1 px-5 py-2.5 text-sm font-semibold">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditMode(true);
                          setEditData({
                            claim_date: previewClaim.claim_date.split('T')[0],
                            merchant: previewClaim.merchant,
                            amount: previewClaim.amount,
                            category_id: previewClaim.category_id,
                            receipt_number: previewClaim.receipt_number ?? '',
                            description: previewClaim.description ?? '',
                          });
                        }}
                        className="btn-thick-navy px-5 py-2.5 text-sm font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => approveClaim(previewClaim.id, selectedGlAccountId || undefined, selectedContraGlId || undefined)}
                        disabled={previewClaim.approval === 'approved'}
                        className="btn-thick-green flex-1 px-5 py-2.5 text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectClaim(previewClaim.id)}
                        disabled={previewClaim.approval === 'not_approved'}
                        className="btn-thick-red flex-1 px-5 py-2.5 text-sm"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>{/* close two-panel body */}
          </div>
          </div>
        </>
        );
      })()}

      {/* ═══ INVOICE PREVIEW PANEL (shared component) ═══ */}
      {fullInvoice && (
        <InvoicePreviewPanel
          config={invoiceConfig}
          previewInvoice={fullInvoice}
          setPreviewInvoice={(inv) => { setFullInvoice(inv as InvoiceRow | null); if (!inv) setPreviewInvoice(null); }}
          editMode={invoiceEditMode}
          setEditMode={setInvoiceEditMode}
          editData={invoiceEditData}
          setEditData={setInvoiceEditData}
          editSaving={invoiceEditSaving}
          saveEdit={invoiceSaveEdit}
          selectedGlAccountId={selectedGlAccountId}
          setSelectedGlAccountId={setSelectedGlAccountId}
          selectedContraGlId={selectedContraGlId}
          setSelectedContraGlId={setSelectedContraGlId}
          glAccounts={glAccounts}
          setGlAccounts={setGlAccounts}
          categories={categories}
          suppliers={suppliers}
          setSuppliers={setSuppliers}
          creatingSupplier={creatingSupplier}
          setCreatingSupplier={setCreatingSupplier}
          newSupplierName={newSupplierName}
          setNewSupplierName={setNewSupplierName}
          confirmSupplier={invoiceConfirmSupplier}
          createAndAssignSupplier={invoiceCreateAndAssignSupplier}
          showLineItems={showLineItems}
          setShowLineItems={setShowLineItems}
          lineItems={lineItems}
          lineSaving={lineSaving}
          lineItemsTotal={lineItems.reduce((s, l) => s + Number(l.line_total || 0), 0)}
          addLineItem={() => setLineItems(prev => [...prev, { description: '', unit_price: '', tax_amount: '', line_total: '', gl_account_id: '' }])}
          removeLineItem={(idx) => setLineItems(prev => prev.filter((_, i) => i !== idx))}
          updateLineItem={(idx, field, value) => setLineItems(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))}
          saveLineItems={() => {}}
          removeAllLineItems={() => setLineItems([])}
          markAsReviewed={markInvoiceReviewed}
          batchAction={invoiceBatchAction}
          setRejectModal={setRejectModal}
          deleteInvoice={invoiceDelete}
          refresh={refresh}
          onPrev={(() => {
            const idx = pendingInvoices.findIndex(i => i.id === fullInvoice.id);
            return idx > 0 ? () => { setPreviewInvoice(pendingInvoices[idx - 1]); setFullInvoice(null); } : undefined;
          })()}
          onNext={(() => {
            const idx = pendingInvoices.findIndex(i => i.id === fullInvoice.id);
            return idx >= 0 && idx < pendingInvoices.length - 1 ? () => { setPreviewInvoice(pendingInvoices[idx + 1]); setFullInvoice(null); } : undefined;
          })()}
        />
      )}

      {/* Reject modal for invoice rejection */}
      <InvoiceRejectModal
        open={rejectModal.open}
        invoiceCount={rejectModal.invoiceIds.length}
        reason={rejectModal.reason}
        onReasonChange={(reason) => setRejectModal(prev => ({ ...prev, reason }))}
        onConfirm={() => {
          invoiceBatchAction(rejectModal.invoiceIds, 'reject', rejectModal.reason);
          setRejectModal({ open: false, invoiceIds: [], reason: '' });
        }}
        onClose={() => setRejectModal({ open: false, invoiceIds: [], reason: '' })}
      />

    </>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function Pagination({ total, page, pageSize, onPageChange }: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <p className="text-body-sm text-[#444650]">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}
