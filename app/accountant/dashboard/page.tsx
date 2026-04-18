'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';
import GlAccountSelect from '@/components/GlAccountSelect';
import { useFirm } from '@/contexts/FirmContext';
import StatCard from '@/components/StatCard';

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
  total_amount: string;
  amount_paid: string;
  category_name: string;
  category_id: string;
  firm_id: string;
  status: string;
  approval: string;
  payment_status: string;
  supplier_name: string | null;
  supplier_link_status: string;
  confidence: string;
  thumbnail_url: string | null;
  file_url: string | null;
  gl_account_id: string | null;
  contra_gl_account_id: string | null;
  supplier_id: string | null;
  supplier_default_gl_id: string | null;
  supplier_default_contra_gl_id: string | null;
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

  // Fetch GL accounts when invoice preview opens — full resolution chain
  useEffect(() => {
    if (previewInvoice) {
      const aliasPromise = previewInvoice.vendor_name_raw
        ? fetch(`/api/suppliers/by-alias?alias=${encodeURIComponent(previewInvoice.vendor_name_raw)}&firmId=${previewInvoice.firm_id}`).then(r => r.json()).catch(() => ({ data: null }))
        : Promise.resolve({ data: null });

      Promise.all([
        fetch(`/api/gl-accounts?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
        fetch(`/api/categories?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
        fetch(`/api/accounting-settings?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
        aliasPromise,
      ]).then(([glJson, catJson, settingsJson, aliasJson]) => {
        const accounts = glJson.data ?? [];
        setGlAccounts(accounts);
        const aliasGl = aliasJson.data?.default_gl_account_id || '';
        const aliasContraGl = aliasJson.data?.default_contra_gl_account_id || '';

        // Expense GL: invoice → supplier default → alias match → category → empty
        if (previewInvoice.gl_account_id) {
          setSelectedGlAccountId(previewInvoice.gl_account_id);
        } else if (previewInvoice.supplier_default_gl_id) {
          setSelectedGlAccountId(previewInvoice.supplier_default_gl_id);
        } else if (aliasGl) {
          setSelectedGlAccountId(aliasGl);
        } else {
          const catData = catJson.data ?? [];
          const match = catData.find((c: { id: string; gl_account_id?: string }) => c.id === previewInvoice.category_id);
          setSelectedGlAccountId(match?.gl_account_id ?? '');
        }

        // Contra GL: invoice → supplier default → alias match → vendor-name fuzzy match → firm default
        const firmDefaultContra = settingsJson.data?.gl_defaults?.trade_payables?.id || settingsJson.data?.default_trade_payables_gl_id || '';
        let resolvedContra = previewInvoice.contra_gl_account_id || previewInvoice.supplier_default_contra_gl_id || aliasContraGl;

        // Fuzzy match: vendor name against Liability GL account names
        if (!resolvedContra) {
          const vendorLower = previewInvoice.vendor_name_raw.toLowerCase().replace(/[^a-z0-9]/g, '');
          const liabilityGls = accounts.filter((g: { account_type: string }) => g.account_type === 'Liability');
          const nameMatch = liabilityGls.find((g: { name: string }) => {
            const glLower = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return glLower.length > 2 && (vendorLower.includes(glLower) || glLower.includes(vendorLower));
          });
          if (nameMatch) resolvedContra = nameMatch.id;
        }

        const contraId = resolvedContra || firmDefaultContra;
        setDefaultContraGlId(previewInvoice.supplier_default_contra_gl_id || aliasContraGl || firmDefaultContra);
        setSelectedContraGlId(contraId);
      }).catch(console.error);
    } else if (!previewClaim) {
      setGlAccounts([]); setSelectedGlAccountId(''); setSelectedContraGlId(''); setDefaultContraGlId('');
    }
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

  const markInvoiceReviewed = async (id: string, glAccountId?: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed', ...(glAccountId && { gl_account_id: glAccountId }) }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[#191C1E]">
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-[10px] font-label text-[#444650] uppercase tracking-widest">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
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
                            <td className="px-6 py-3 text-[#444650] tabular-nums">{formatDate(c.claim_date)}</td>
                            <td className="px-6 py-3 text-[#191C1E] font-medium">{c.employee_name}</td>
                            <td className="px-6 py-3 text-[#444650]">{c.merchant}</td>
                            <td className="px-6 py-3 text-[#444650]">{c.category_name}</td>
                            <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                            <td className="px-6 py-3">
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
                          <td className="px-6 py-2.5 text-[#444650]">{formatDate(r.claim_date)}</td>
                          <td className="px-6 py-2.5 text-[#444650] font-medium">{r.merchant}</td>
                          <td className="px-6 py-2.5 text-right text-[#191C1E] font-semibold tabular-nums">{formatRM(r.amount)}</td>
                          <td className="px-6 py-2.5"><span className="badge-amber">Unlinked</span></td>
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
                  <p className="text-sm text-[#444650]">No invoices pending review</p>
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
                            <td className="px-6 py-3 text-[#444650] tabular-nums">{formatDate(inv.issue_date)}</td>
                            <td className="px-6 py-3 text-[#191C1E] font-medium">{inv.vendor_name_raw}</td>
                            <td className="px-6 py-3 text-[#444650]">{inv.invoice_number ?? '-'}</td>
                            <td className="px-6 py-3 text-[#444650] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                            <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                            <td className="px-6 py-3">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                            <td className="px-6 py-3">{linkCfg && <span className={linkCfg.cls}>{linkCfg.label}</span>}</td>
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
              <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
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

      {/* ═══ INVOICE PREVIEW PANEL ═══ */}
      {previewInvoice && (() => {
        const driveMatch = previewInvoice.file_url?.match(/\/d\/([^/]+)/);
        const fileId = driveMatch?.[1];
        return (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[1100px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            {/* Two-panel body */}
            <div className="flex-1 flex min-h-0">
              {/* Left panel — details */}
              <div className="w-2/5 flex-shrink-0 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4">
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Vendor"        value={previewInvoice.vendor_name_raw} />
                  <Field label="Invoice No."   value={previewInvoice.invoice_number} />
                  <Field label="Issue Date"    value={formatDate(previewInvoice.issue_date)} />
                  <Field label="Due Date"      value={previewInvoice.due_date ? formatDate(previewInvoice.due_date) : null} />
                  <Field label="Total Amount"  value={formatRM(previewInvoice.total_amount)} />
                  <Field label="Amount Paid"   value={formatRM(previewInvoice.amount_paid)} />
                  <Field label="Category"      value={previewInvoice.category_name} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                    <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                  ))}
                </div>
                {/* Supplier link */}
                <div className="bg-[var(--surface-low)] p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier</span>
                    {(() => {
                      const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                      return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                    })()}
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
                </div>

                {/* GL Account Assignment */}
                {glAccounts.length > 0 && previewInvoice.approval !== 'not_approved' && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Expense GL (Debit)</label>
                      {previewInvoice.approval === 'approved' ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[var(--surface-header)]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F6F3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                          <span className="text-sm font-medium text-[var(--text-primary)]">{glAccounts.find(a => a.id === selectedGlAccountId)?.account_code ?? ''} — {glAccounts.find(a => a.id === selectedGlAccountId)?.name ?? 'Not assigned'}</span>
                        </div>
                      ) : (
                        <GlAccountSelect
                          value={selectedGlAccountId}
                          onChange={setSelectedGlAccountId}
                          accounts={glAccounts}
                          firmId={previewInvoice.firm_id}
                          placeholder="Select GL Account"
                          preferredType="Expense"
                          defaultType="Expense"
                          onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Contra GL (Credit)</label>
                      {previewInvoice.approval === 'approved' ? (
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
                          firmId={previewInvoice.firm_id}
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
              </div>

              {/* Right panel — document preview + actions */}
              <div className="w-3/5 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto">
                  {fileId ? (
                    <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-full min-h-[400px]" title="Invoice Preview" allow="autoplay" />
                  ) : previewInvoice.thumbnail_url ? (
                    <div className="flex items-center justify-center h-full p-5">
                      {previewInvoice.file_url ? (
                        <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer">
                          <img src={previewInvoice.thumbnail_url} alt="Invoice" className="max-w-full max-h-[60vh] object-contain cursor-pointer hover:opacity-90 transition-opacity" />
                        </a>
                      ) : (
                        <img src={previewInvoice.thumbnail_url} alt="Invoice" className="max-w-full max-h-[60vh] object-contain" />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No document available</div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex-shrink-0 p-4 space-y-2 bg-[var(--surface-low)]">
                  <div className="flex gap-3">
                    {previewInvoice.status === 'pending_review' ? (
                      <button
                        onClick={() => markInvoiceReviewed(previewInvoice.id, selectedGlAccountId || undefined)}
                        className="btn-thick-navy flex-1 px-5 py-2.5 text-sm font-semibold"
                      >
                        Mark as Reviewed
                      </button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200">
                        Reviewed
                      </div>
                    )}
                    {previewInvoice.status === 'reviewed' && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/invoices/${previewInvoice.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'pending_review' }),
                            });
                            if (res.ok) {
                              refresh();
                              setPreviewInvoice({ ...previewInvoice, status: 'pending_review' });
                            }
                          } catch (e) { console.error(e); }
                        }}
                        className="btn-thick-white flex-1 px-5 py-2.5 text-sm font-semibold"
                      >
                        Revert Review
                      </button>
                    )}
                  </div>
                  <Link
                    href="/accountant/invoices"
                    className="btn-thick-white w-full px-5 py-2.5 text-sm font-semibold text-center block"
                  >
                    Open in Invoices
                  </Link>
                </div>
              </div>
            </div>
          </div>
          </div>
        </>
        );
      })()}

    </div>
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
