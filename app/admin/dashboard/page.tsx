'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';
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
  status: string;
  payment_status: string;
  supplier_name: string | null;
  supplier_link_status: string;
  confidence: string;
  thumbnail_url: string | null;
  file_url: string | null;
}

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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  usePageTitle('Dashboard');
  const { data: session } = useSession();

  const [stats, setStats] = useState<Stats | null>(null);
  const [bankReconStats, setBankReconStats] = useState<{ totalStatements: number; unmatched: number; suggestedMatch: number } | null>(null);
  const [pendingClaims, setPendingClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<InvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [unlinkedReceipts, setUnlinkedReceipts] = useState<ClaimRow[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
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

  const refresh = () => setRefreshKey((k) => k + 1);

  const firstName = session?.user?.name?.split(' ')[0] ?? '';

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim, previewInvoice]);

  // Fetch categories when entering edit mode
  useEffect(() => {
    if (editMode && categories.length === 0) {
      fetch('/api/admin/categories')
        .then((r) => r.json())
        .then((j) => setCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [editMode, categories.length]);

  // Single consolidated dashboard fetch
  useEffect(() => {
    fetch('/api/admin/dashboard')
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
  }, [refreshKey]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const saveClaimEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/claims/${previewClaim.id}`, {
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

  const markAsReviewed = async (id: string) => {
    try {
      const res = await fetch('/api/admin/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: [id], action: 'review' }),
      });
      if (res.ok) {
        setPreviewClaim(null);
        refresh();
      }
    } catch (e) { console.error(e); }
  };

  const markInvoiceReviewed = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={"flex h-screen overflow-hidden bg-[#F7F9FB]"}>

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="admin" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[#191C1E]">
            {firstName ? `${getGreeting()}, ${firstName}` : 'Dashboard'}
          </h1>
          <p className="text-[10px] font-label text-[#444650] uppercase tracking-widest">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-8 pl-14 paper-texture animate-in">

          {/* ── Stats ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            <div className="bg-[#F2F4F6] px-4 py-4 card-popped">
              <p className="text-xs font-label font-bold uppercase tracking-widest mb-3" style={{ color: '#234B6E' }}>Expense Claims</p>
              <div className="grid grid-cols-3 gap-3 card-stagger">
                <StatCard label="This Month"        value={stats?.claims.thisMonth ?? null}        amount={stats ? formatRM(stats.claims.thisMonthAmount) : null}            color="default" href="/admin/claims?type=claim" />
                <StatCard label="Pending Review"     value={stats?.claims.pendingReview ?? null}    amount={stats ? formatRM(stats.claims.pendingAmount) : null}              color="amber"   href="/admin/claims?type=claim&status=pending_review" />
                <StatCard label="Pending Approval"   value={stats?.claims.pendingApproval ?? null}  amount={stats ? formatRM(stats.claims.pendingApprovalAmount) : null}      color="primary" href="/admin/claims?type=claim&status=pending_approval" />
              </div>
            </div>

            <div className="bg-[#F2F4F6] px-4 py-4 card-popped">
              <p className="text-xs font-label font-bold uppercase tracking-widest mb-3" style={{ color: '#234B6E' }}>Receipts</p>
              <div className="grid grid-cols-3 gap-3 card-stagger">
                <StatCard label="This Month"     value={stats?.receipts.thisMonth ?? null}    amount={stats ? formatRM(stats.receipts.thisMonthAmount) : null}   color="default" href="/admin/claims?type=receipt" />
                <StatCard label="Unallocated"    value={stats?.receipts.unlinked ?? null}     amount={stats ? formatRM(stats.receipts.unlinkedAmount) : null}    color="amber"   href="/admin/claims?type=receipt" />
                <StatCard label="Not Approved"   value={stats?.receipts.notApproved ?? null}  amount={stats ? formatRM(stats.receipts.notApprovedAmount) : null} color="primary" href="/admin/claims?type=receipt" />
              </div>
            </div>

            <div className="bg-[#F2F4F6] px-4 py-4 card-popped">
              <p className="text-xs font-label font-bold uppercase tracking-widest mb-3" style={{ color: '#234B6E' }}>Invoices</p>
              <div className="grid grid-cols-3 gap-3 card-stagger">
                <StatCard label="This Month"       value={stats?.invoices.thisMonth ?? null}       amount={stats ? formatRM(stats.invoices.thisMonthAmount) : null}           color="default" href="/admin/invoices?tab=received" />
                <StatCard label="Pending Review"   value={stats?.invoices.pendingReview ?? null}   amount={stats ? formatRM(stats.invoices.pendingAmount) : null}             color="amber"   href="/admin/invoices?tab=received&status=pending_review" />
                <StatCard label="Pending Approval" value={stats?.invoices.pendingApproval ?? null} amount={stats ? formatRM(stats.invoices.pendingApprovalAmount) : null}     color="primary" href="/admin/invoices?tab=received&status=pending_approval" />
              </div>
            </div>

            <div className="bg-[#F2F4F6] px-4 py-4 card-popped">
              <p className="text-xs font-label font-bold uppercase tracking-widest mb-3" style={{ color: '#234B6E' }}>Bank Reconciliation</p>
              <div className="grid grid-cols-3 gap-3 card-stagger">
                <StatCard label="Statements"           value={bankReconStats?.totalStatements ?? null}  color="default" href="/admin/bank-reconciliation" />
                <StatCard label="Unmatched"            value={bankReconStats?.unmatched ?? null}         color={bankReconStats && bankReconStats.unmatched > 0 ? 'amber' : 'green'} href="/admin/bank-reconciliation" />
                <StatCard label="Pending Confirmation" value={bankReconStats?.suggestedMatch ?? null}    color={bankReconStats && bankReconStats.suggestedMatch > 0 ? 'primary' : 'green'} href="/admin/bank-reconciliation" />
              </div>
            </div>
          </div>

          {/* ── Needs Attention ────────────────────────────── */}
          <div className="bg-white">
            {/* Tab header */}
            <div className="flex items-center justify-between px-5">
              <div className="flex gap-0">
                {([
                  ['claims', 'Claims', pendingClaims.length],
                  ['receipts', 'Receipts', unlinkedReceipts.length],
                  ['invoices', 'Invoices', pendingInvoices.length],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); setPage(0); }}
                    className={`relative px-3 py-1.5 text-label-sm font-bold uppercase tracking-wider transition-colors ${
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
                href={activeTab === 'claims' ? '/admin/claims' : activeTab === 'receipts' ? '/admin/claims' : '/admin/invoices'}
                className="text-body-sm text-[#234B6E] font-bold hover:opacity-80 transition-colors"
              >
                View all {activeTab} &rarr;
              </Link>
            </div>

            {/* Claims tab */}
            {activeTab === 'claims' && (
              loadingClaims ? (
                <div className="px-5 py-12 text-center text-sm text-[#7A8A9A]">Loading...</div>
              ) : pendingClaims.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#7A8A9A]">No claims pending review</p>
                  <p className="text-xs text-[#7A8A9A] mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#E6E8EA] text-left">
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
                            <td className="px-6 py-3 text-[#444650] group-hover:text-[#234B6E] transition-colors duration-200">{c.merchant}</td>
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
                <div className="px-5 py-12 text-center text-sm text-[#7A8A9A]">Loading...</div>
              ) : unlinkedReceipts.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#7A8A9A]">No unlinked receipts</p>
                  <p className="text-xs text-[#7A8A9A] mt-1">All receipts have been linked to payments.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#E6E8EA]">
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
                          <td className="px-6 py-2.5 text-[#444650] tabular-nums">{formatDate(r.claim_date)}</td>
                          <td className="px-6 py-2.5 text-[#444650] font-medium group-hover:text-[#234B6E] transition-colors duration-200">{r.merchant}</td>
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
                <div className="px-5 py-12 text-center text-sm text-[#7A8A9A]">Loading...</div>
              ) : pendingInvoices.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#7A8A9A]">No invoices pending review</p>
                  <p className="text-xs text-[#7A8A9A] mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#E6E8EA] text-left">
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
                            <td className="px-6 py-3 text-[#191C1E] font-medium group-hover:text-[#234B6E] transition-colors duration-200">{inv.vendor_name_raw}</td>
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
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</label>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-recessed w-full">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt Number</label>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description</label>
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
                  <div className="flex flex-wrap gap-2">
                    {[STATUS_CFG[previewClaim.status], APPROVAL_CFG[previewClaim.approval]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-label text-[var(--text-secondary)] uppercase tracking-widest font-bold">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH' ? 'text-[var(--match-green)]' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'
                    }`}>{previewClaim.confidence}</span>
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-[#FFDAD6] p-3">
                      <p className="text-[10px] font-label font-bold text-[#93000A] uppercase tracking-widest mb-1">Rejection Reason</p>
                      <p className="text-sm text-[#93000A]">{previewClaim.rejection_reason}</p>
                    </div>
                  )}
                </>
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
                        className="btn-thick-navy flex-1 px-5 py-2.5 text-sm font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => markAsReviewed(previewClaim.id)}
                        disabled={previewClaim.status === 'reviewed'}
                        className="btn-thick-green flex-1 px-5 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Mark as Reviewed
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
              </div>

              {/* Right panel — document preview */}
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

                {/* Action buttons in right panel footer */}
                <div className="flex-shrink-0 p-4 space-y-2 bg-[var(--surface-low)]">
                  <div className="flex gap-3">
                    {previewInvoice.status === 'pending_review' ? (
                      <button
                        onClick={() => markInvoiceReviewed(previewInvoice.id)}
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
                            const res = await fetch(`/api/admin/invoices/${previewInvoice.id}`, {
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
                    href="/admin/invoices"
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, amount, color, href }: {
  label: string;
  value: string | number | null;
  amount?: string | null;
  color: 'default' | 'amber' | 'red' | 'primary' | 'green';
  href?: string;
}) {
  const isPrimary = color === 'primary';
  const accent = {
    default: { dot: 'bg-gray-300', value: 'text-[#191C1E]' },
    amber:   { dot: 'bg-amber-400', value: 'text-amber-600' },
    red:     { dot: 'bg-red-400', value: 'text-red-600' },
    primary: { dot: '', value: '' },
    green:   { dot: 'bg-emerald-400', value: 'text-emerald-600' },
  }[color];

  const content = (
    <div
      className={`bg-white px-4 py-3 transition-all duration-150 group card-popped ${href ? 'cursor-pointer hover:shadow-[3px_3px_6px_rgba(0,0,0,0.08)] active:translate-y-[2px]' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`w-1.5 h-1.5 flex-shrink-0 ${accent.dot}`} style={isPrimary ? { backgroundColor: '#234B6E' } : undefined} />
        <p className="text-[11px] font-semibold text-[#444650] uppercase tracking-wide">{label}</p>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-2xl font-extrabold tracking-tight tabular-nums ${accent.value}`} style={isPrimary ? { color: '#234B6E' } : undefined}>
          {value ?? <span className="text-gray-200">&mdash;</span>}
        </p>
        {amount && <p className="text-xs font-medium text-[#444650] tabular-nums whitespace-nowrap">{amount}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
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
      <p className="text-body-sm text-[#7A8A9A]">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="btn-thick-white px-3 py-1.5 text-body-sm font-medium border border-gray-200 text-[#444650] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="btn-thick-white px-3 py-1.5 text-body-sm font-medium border border-gray-200 text-[#444650] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
