'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimStats {
  thisMonth: number;
  thisMonthAmount: string;
  pendingReview: number;
  pendingAmount: string;
}

interface ReceiptStats {
  thisMonth: number;
  thisMonthAmount: string;
  unlinked: number;
  unlinkedAmount: string;
}

interface InvoiceStats {
  thisMonth: number;
  thisMonthAmount: string;
  pendingReview: number;
  pendingAmount: string;
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
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear(),
  ].join('/');
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
  const { data: session } = useSession();

  const [stats, setStats] = useState<Stats | null>(null);
  const [bankReconStats, setBankReconStats] = useState<{ totalStatements: number; unmatched: number } | null>(null);
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
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">
            {firstName ? `${getGreeting()}, ${firstName}` : 'Dashboard'}
          </h1>
          <p className="text-[#8E9196] text-xs">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">

          {/* ── Stats ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 mb-2 card-stagger">
            <StatCard label="Claims This Month"        value={stats?.claims.thisMonth ?? null}      amount={stats ? formatRM(stats.claims.thisMonthAmount) : null}  color="default" href="/admin/claims" />
            <StatCard label="Pending Review (Claims)"  value={stats?.claims.pendingReview ?? null}  amount={stats ? formatRM(stats.claims.pendingAmount) : null}    color="amber"   href="/admin/claims?status=pending_review" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-2 card-stagger">
            <StatCard label="Receipts This Month"     value={stats?.receipts.thisMonth ?? null}    amount={stats ? formatRM(stats.receipts.thisMonthAmount) : null} color="default" href="/admin/claims?type=receipt" />
            <StatCard label="Unallocated Receipts"    value={stats?.receipts.unlinked ?? null}     amount={stats ? formatRM(stats.receipts.unlinkedAmount) : null}  color="amber"   href="/admin/claims?type=receipt" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-2 card-stagger">
            <StatCard label="Invoices This Month"       value={stats?.invoices.thisMonth ?? null}     amount={stats ? formatRM(stats.invoices.thisMonthAmount) : null} color="default" href="/admin/invoices" />
            <StatCard label="Pending Review (Invoices)" value={stats?.invoices.pendingReview ?? null} amount={stats ? formatRM(stats.invoices.pendingAmount) : null}   color="amber"   href="/admin/invoices?status=pending_review" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6 card-stagger">
            <StatCard label="Bank Statements" value={bankReconStats?.totalStatements ?? null} color="default" href="/admin/bank-reconciliation" />
            <StatCard label="Unmatched Transactions" value={bankReconStats?.unmatched ?? null} color={bankReconStats && bankReconStats.unmatched > 0 ? 'amber' : 'green'} href="/admin/bank-reconciliation" />
          </div>

          {/* ── Needs Attention ────────────────────────────── */}
          <div className="bg-white rounded-lg">
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
                    className={`relative px-4 py-3 text-body-md font-semibold transition-colors ${
                      activeTab === key ? 'text-[#191C1E]' : 'text-[#8E9196] hover:text-[#434654]'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-label-sm font-bold ${
                        activeTab === key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-[#434654]'
                      }`}>
                        {count}
                      </span>
                    )}
                    {activeTab === key && (
                      <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-t-full" style={{ backgroundColor: 'var(--primary)' }} />
                    )}
                  </button>
                ))}
              </div>
              <Link
                href={activeTab === 'claims' ? '/admin/claims' : activeTab === 'receipts' ? '/admin/claims' : '/admin/invoices'}
                className="text-body-sm font-medium hover:underline transition-colors"
                style={{ color: 'var(--primary)' }}
              >
                View all {activeTab} &rarr;
              </Link>
            </div>

            {/* Claims tab */}
            {activeTab === 'claims' && (
              loadingClaims ? (
                <div className="px-5 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
              ) : pendingClaims.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#8E9196]">No claims pending review</p>
                  <p className="text-xs text-[#8E9196] mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="ds-table-header text-left">
                        <th className="px-6 py-2.5">Date</th>
                        <th className="px-6 py-2.5">Employee</th>
                        <th className="px-6 py-2.5">Merchant</th>
                        <th className="px-6 py-2.5">Category</th>
                        <th className="px-6 py-2.5 text-right">Amount</th>
                        <th className="px-6 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="table-stagger">
                      {pendingClaims.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c) => {
                        const cfg = STATUS_CFG[c.status];
                        return (
                          <tr key={c.id} onClick={() => setPreviewClaim(c)} className="group text-body-md hover:bg-[#F2F4F6] transition-colors cursor-pointer">
                            <td className="px-6 py-3 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                            <td className="px-6 py-3 text-[#191C1E] font-medium">{c.employee_name}</td>
                            <td className="px-6 py-3 text-[#434654] group-hover:text-[var(--accent)] transition-colors duration-200">{c.merchant}</td>
                            <td className="px-6 py-3 text-[#434654]">{c.category_name}</td>
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
                <div className="px-5 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
              ) : unlinkedReceipts.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#8E9196]">No unlinked receipts</p>
                  <p className="text-xs text-[#8E9196] mt-1">All receipts have been linked to payments.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="ds-table-header">
                        <th className="px-6 py-2.5 text-left">Date</th>
                        <th className="px-6 py-2.5 text-left">Merchant</th>
                        <th className="px-6 py-2.5 text-right">Amount</th>
                        <th className="px-6 py-2.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="table-stagger">
                      {unlinkedReceipts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => (
                        <tr
                          key={r.id}
                          className="group hover:bg-[#F2F4F6] transition-colors cursor-pointer text-body-md"
                          onClick={() => setPreviewClaim(r)}
                        >
                          <td className="px-6 py-2.5 text-[#434654]">{formatDate(r.claim_date)}</td>
                          <td className="px-6 py-2.5 text-[#434654] font-medium group-hover:text-[var(--accent)] transition-colors duration-200">{r.merchant}</td>
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
                <div className="px-5 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
              ) : pendingInvoices.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-[#8E9196]">No invoices pending review</p>
                  <p className="text-xs text-[#8E9196] mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="ds-table-header text-left">
                        <th className="px-6 py-2.5">Issue Date</th>
                        <th className="px-6 py-2.5">Vendor</th>
                        <th className="px-6 py-2.5">Invoice #</th>
                        <th className="px-6 py-2.5">Due Date</th>
                        <th className="px-6 py-2.5 text-right">Amount</th>
                        <th className="px-6 py-2.5">Payment</th>
                        <th className="px-6 py-2.5">Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="table-stagger">
                      {pendingInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((inv) => {
                        const pmtCfg = PAYMENT_CFG[inv.payment_status];
                        const linkCfg = LINK_CFG[inv.supplier_link_status];
                        return (
                          <tr key={inv.id} onClick={() => setPreviewInvoice(inv)} className="group text-body-md hover:bg-[#F2F4F6] transition-colors cursor-pointer">
                            <td className="px-6 py-3 text-[#434654] tabular-nums">{formatDate(inv.issue_date)}</td>
                            <td className="px-6 py-3 text-[#191C1E] font-medium group-hover:text-[var(--accent)] transition-colors duration-200">{inv.vendor_name_raw}</td>
                            <td className="px-6 py-3 text-[#434654]">{inv.invoice_number ?? '-'}</td>
                            <td className="px-6 py-3 text-[#434654] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
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
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewClaim.thumbnail_url ? (
                <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image available</div>
              )}

              {editMode && editData ? (
                <div className="space-y-3">
                  <div>
                    <label className="input-label">Date</label>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Merchant</label>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Amount (RM)</label>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-field w-full">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Receipt Number</label>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Description</label>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-field w-full" />
                  </div>
                  <Field label="Employee" value={previewClaim.employee_name} />
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
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
                    <span className="text-label-sm text-[#8E9196] uppercase tracking-wide font-medium">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH' ? 'text-green-600' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    }`}>{previewClaim.confidence}</span>
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-label-sm font-semibold text-red-700 uppercase tracking-wide mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-700">{previewClaim.rejection_reason}</p>
                    </div>
                  )}
                  {previewClaim.file_url && (
                    <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                      View full document &rarr;
                    </a>
                  )}
                </>
              )}
            </div>
            <div className="p-4 flex-shrink-0 flex gap-3">
              {editMode ? (
                <>
                  <button onClick={saveClaimEdit} disabled={editSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
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
                    className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => markAsReviewed(previewClaim.id)}
                    disabled={previewClaim.status === 'reviewed'}
                    className="btn-dark flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                  >
                    Mark as Reviewed
                  </button>
                </>
              )}
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ INVOICE PREVIEW PANEL ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image available</div>
              )}
              <dl className="space-y-3">
                <Field label="Vendor"        value={previewInvoice.vendor_name_raw} />
                <Field label="Invoice No."   value={previewInvoice.invoice_number} />
                <Field label="Issue Date"    value={formatDate(previewInvoice.issue_date)} />
                <Field label="Due Date"      value={previewInvoice.due_date ? formatDate(previewInvoice.due_date) : null} />
                <Field label="Total Amount"  value={formatRM(previewInvoice.total_amount)} />
                <Field label="Amount Paid"   value={formatRM(previewInvoice.amount_paid)} />
                <Field label="Category"      value={previewInvoice.category_name} />
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                  <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                ))}
              </div>
              {/* Supplier link */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Supplier</span>
                  {(() => {
                    const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                    return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                  })()}
                </div>
                <p className="text-sm font-medium text-[#191C1E]">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
              </div>
              {previewInvoice.file_url && (
                <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 flex-shrink-0 flex gap-3">
              <Link
                href="/admin/invoices"
                className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold text-white text-center transition-opacity hover:opacity-85"
              >
                Open in Invoices
              </Link>
              <button
                onClick={() => markInvoiceReviewed(previewInvoice.id)}
                disabled={previewInvoice.status === 'reviewed'}
                className="btn-dark flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
              >
                Mark as Reviewed
              </button>
            </div>
          </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, amount, color, href }: {
  label: string;
  value: string | number | null;
  amount?: string | null;
  color: 'default' | 'amber' | 'green';
  href?: string;
}) {
  const accent = {
    default: { dot: 'bg-gray-300', value: 'text-[#191C1E]' },
    amber:   { dot: 'bg-amber-400', value: 'text-amber-600' },
    green:   { dot: 'bg-emerald-400', value: 'text-emerald-600' },
  }[color];

  const content = (
    <div
      className={`bg-white rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group ${href ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
        <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex items-end justify-between">
        <p className={`text-2xl font-bold tracking-tight ${accent.value}`}>
          {value ?? <span className="text-gray-200">&mdash;</span>}
        </p>
        {amount && <p className="text-body-md font-semibold text-[#8E9196]">{amount}</p>}
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
      <p className="text-body-sm text-[#8E9196]">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}
