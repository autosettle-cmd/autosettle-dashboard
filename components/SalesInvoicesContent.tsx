'use client';

import { useState, useEffect } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import GlAccountSelect from '@/components/GlAccountSelect';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesInvoiceItem {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount: string;
  tax_type: string | null;
  tax_rate: string;
  tax_amount: string;
  line_total: string;
  sort_order: number;
}

interface SalesInvoiceRow {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  notes: string | null;
  supplier_id: string;
  buyer_name: string;
  firm_id?: string;
  category_id: string | null;
  category_name: string | null;
  gl_account_id: string | null;
  approval: 'pending_approval' | 'approved' | 'not_approved';
  lhdn_status: string | null;
  items: SalesInvoiceItem[];
  created_at: string;
}

interface SupplierOption {
  id: string;
  name: string;
  firm_id?: string;
}

interface LineItemDraft {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray'   },
  partially_paid: { label: 'Partial', cls: 'badge-amber'  },
  paid:           { label: 'Paid',    cls: 'badge-green'  },
};

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',    cls: 'badge-amber'  },
  approved:         { label: 'Approved',   cls: 'badge-green'  },
  not_approved:     { label: 'Rejected',   cls: 'badge-red'    },
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

function calcLineTotal(item: LineItemDraft): number {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unit_price) || 0;
  return qty * price;
}

function calcLineTax(item: LineItemDraft): number {
  const rate = parseFloat(item.tax_rate) || 0;
  return calcLineTotal(item) * (rate / 100);
}

function emptyLineItem(): LineItemDraft {
  return { description: '', quantity: '1', unit_price: '', tax_rate: '0' };
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
      {children}
    </select>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesInvoicesContent({ role }: { role: 'admin' | 'accountant' }) {
  const apiBase = role === 'admin' ? '/api/admin/sales-invoices' : '/api/sales-invoices';
  const suppliersApi = role === 'admin' ? '/api/admin/suppliers' : '/api/suppliers';

  // Data
  const [invoices, setInvoices] = useState<SalesInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateRange, setDateRange] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Filters — approval
  const [approvalFilter, setApprovalFilter] = useState('');

  // Preview
  const [preview, setPreview] = useState<SalesInvoiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // GL accounts (accountant only)
  const [glAccounts, setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [selectedGlAccountId, setSelectedGlAccountId] = useState('');
  const [selectedContraGlId, setSelectedContraGlId] = useState('');
  const [_categories, setCategories] = useState<{ id: string; name: string; gl_account_id?: string }[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [newBuyerName, setNewBuyerName] = useState('');
  const [creatingBuyer, setCreatingBuyer] = useState(false);
  const [createData, setCreateData] = useState({
    supplier_id: '',
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([emptyLineItem()]);
  const [createError, setCreateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createCategoryId, setCreateCategoryId] = useState('');
  const [createGlAccountId, setCreateGlAccountId] = useState('');
  const [createContraGlId, setCreateContraGlId] = useState('');
  const [createGlAccounts, setCreateGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [createCategories, setCreateCategories] = useState<{ id: string; name: string; gl_account_id?: string }[]>([]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Fetch GL accounts + categories when preview opens (accountant only)
  useEffect(() => {
    if (role !== 'accountant' || !preview?.firm_id) {
      setGlAccounts([]);
      setSelectedGlAccountId('');
      setSelectedContraGlId('');
      return;
    }
    Promise.all([
      fetch(`/api/gl-accounts?firmId=${preview.firm_id}`).then(r => r.json()),
      fetch(`/api/categories?firmId=${preview.firm_id}`).then(r => r.json()),
      fetch(`/api/accounting-settings?firmId=${preview.firm_id}`).then(r => r.json()),
    ]).then(([glJson, catJson, _settingsJson]) => {
      const accounts = glJson.data ?? [];
      setGlAccounts(accounts);
      setCategories(catJson.data ?? []);

      // Pre-fill revenue GL from category mapping
      if (preview.gl_account_id) {
        setSelectedGlAccountId(preview.gl_account_id);
      } else if (preview.category_id) {
        const catData = catJson.data ?? [];
        const match = catData.find((c: { id: string; gl_account_id?: string }) => c.id === preview.category_id);
        setSelectedGlAccountId(match?.gl_account_id ?? '');
      } else {
        setSelectedGlAccountId('');
      }

      // Pre-fill contra GL (Trade Receivables) — no firm default for this, leave empty
      setSelectedContraGlId('');
    }).catch(console.error);
  }, [preview, role]);

  // Fetch GL accounts + categories when create modal opens
  useEffect(() => {
    if (!showCreate) return;

    if (role === 'accountant') {
      // Accountant: fetch GL accounts (need firmId from supplier)
      const selectedSupplier = suppliers.find(s => s.id === createData.supplier_id);
      const firmId = selectedSupplier?.firm_id || suppliers[0]?.firm_id;
      if (!firmId) { setCreateGlAccounts([]); return; }
      fetch(`/api/gl-accounts?firmId=${firmId}`).then(r => r.json())
        .then(j => setCreateGlAccounts(j.data ?? []))
        .catch(console.error);
    } else {
      // Admin: fetch categories (admin API doesn't need firmId)
      fetch(`/api/admin/categories`).then(r => r.json())
        .then(j => setCreateCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [showCreate, createData.supplier_id, suppliers, role]);

  // Batch approve/reject/revert for sales invoices
  const batchAction = async (ids: string[], action: 'approve' | 'reject' | 'revert', glAccountId?: string, contraGlId?: string) => {
    try {
      const res = await fetch('/api/sales-invoices/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesInvoiceIds: ids,
          action,
          ...(glAccountId && { gl_account_id: glAccountId }),
          ...(contraGlId && { contra_gl_account_id: contraGlId }),
        }),
      });
      if (res.ok) {
        refresh();
        if (preview && ids.includes(preview.id)) {
          setPreview({ ...preview, approval: action === 'approve' ? 'approved' : action === 'reject' ? 'not_approved' : 'pending_approval' });
        }
      } else {
        const j = await res.json();
        alert(j.error || 'Action failed');
      }
    } catch (e) { console.error(e); }
  };

  // ─── Fetch invoices ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const p = new URLSearchParams();
    if (paymentFilter) p.set('paymentStatus', paymentFilter);

    // Date range
    const now = new Date();
    if (dateRange === 'this_week') {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      p.set('dateFrom', d.toISOString().split('T')[0]);
    } else if (dateRange === 'this_month') {
      p.set('dateFrom', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    } else if (dateRange === 'last_month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      p.set('dateFrom', lm.toISOString().split('T')[0]);
      p.set('dateTo', lmEnd.toISOString().split('T')[0]);
    } else if (dateRange === 'custom') {
      if (customFrom) p.set('dateFrom', customFrom);
      if (customTo) p.set('dateTo', customTo);
    }

    fetch(`${apiBase}?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setInvoices(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [paymentFilter, dateRange, customFrom, customTo, refreshKey, apiBase]);

  // ─── Fetch suppliers for create modal ────────────────────────────────────────

  useEffect(() => {
    if (!showCreate) return;
    fetch(suppliersApi)
      .then((r) => r.json())
      .then((j) => setSuppliers((j.data ?? []).map((s: SupplierOption & { firm_id?: string }) => ({ id: s.id, name: s.name, firm_id: s.firm_id }))))
      .catch(console.error);
  }, [showCreate, suppliersApi]);

  // ─── Create invoice ──────────────────────────────────────────────────────────

  const submitCreate = async () => {
    if (!createData.supplier_id || !createData.invoice_number || !createData.issue_date) {
      setCreateError('Buyer, Invoice Number, and Issue Date are required.');
      return;
    }
    const validItems = lineItems.filter((li) => li.description.trim() && parseFloat(li.unit_price) > 0);
    if (validItems.length === 0) {
      setCreateError('Add at least one line item with a description and price.');
      return;
    }

    setSubmitting(true);
    setCreateError('');

    try {
      const items = validItems.map((li, idx) => {
        const lineTotal = calcLineTotal(li);
        const taxAmt = calcLineTax(li);
        return {
          description: li.description.trim(),
          quantity: parseFloat(li.quantity) || 1,
          unit_price: parseFloat(li.unit_price) || 0,
          discount: 0,
          tax_rate: parseFloat(li.tax_rate) || 0,
          tax_amount: taxAmt,
          line_total: lineTotal,
          sort_order: idx,
        };
      });

      // For accountant role, include firm_id derived from the selected supplier
      const selectedSupplier = suppliers.find((s) => s.id === createData.supplier_id);
      const payload: Record<string, unknown> = {
        supplier_id: createData.supplier_id,
        invoice_number: createData.invoice_number.trim(),
        issue_date: createData.issue_date,
        due_date: createData.due_date || undefined,
        notes: createData.notes.trim() || undefined,
        items,
      };
      if (role === 'accountant' && selectedSupplier?.firm_id) {
        payload.firm_id = selectedSupplier.firm_id;
      }
      if (createCategoryId) payload.category_id = createCategoryId;
      if (createGlAccountId) payload.gl_account_id = createGlAccountId;
      if (createContraGlId) payload.contra_gl_account_id = createContraGlId;

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const j = await res.json();
      if (!res.ok) {
        setCreateError(j.error || 'Failed to create invoice');
        return;
      }

      setShowCreate(false);
      setCreateData({ supplier_id: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', notes: '' });
      setLineItems([emptyLineItem()]);
      setCreateCategoryId('');
      setCreateGlAccountId('');
      setCreateContraGlId('');
      refresh();
    } catch (e) {
      console.error(e);
      setCreateError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Delete invoice ──────────────────────────────────────────────────────────

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this sales invoice? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPreview(null);
        refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Line item helpers ───────────────────────────────────────────────────────

  const updateLineItem = (idx: number, field: keyof LineItemDraft, value: string) => {
    setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const filteredByApproval = approvalFilter ? invoices.filter(inv => inv.approval === approvalFilter) : invoices;
  const { sorted: sortedInvoices, toggleSort, sortIndicator } = useTableSort(filteredByApproval, 'issue_date', 'desc');

  const subtotal = lineItems.reduce((sum, li) => sum + calcLineTotal(li), 0);
  const taxTotal = lineItems.reduce((sum, li) => sum + calcLineTax(li), 0);
  const grandTotal = subtotal + taxTotal;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">

      {/* ── Filter bar ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
        <Select value={dateRange} onChange={setDateRange}>
          <option value="">All Time</option>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="custom">Custom</option>
        </Select>

        {dateRange === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input-field" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-field" />
          </>
        )}

        <Select value={approvalFilter} onChange={setApprovalFilter}>
          <option value="">All Approval</option>
          <option value="pending_approval">Pending</option>
          <option value="approved">Approved</option>
          <option value="not_approved">Rejected</option>
        </Select>

        <Select value={paymentFilter} onChange={setPaymentFilter}>
          <option value="">All Payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="partially_paid">Partial</option>
          <option value="paid">Paid</option>
        </Select>

        <div className="ml-auto">
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold"
          >
            + New Invoice
          </button>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('invoice_number')}>Invoice #{sortIndicator('invoice_number')}</th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('buyer_name')}>Buyer{sortIndicator('buyer_name')}</th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('issue_date')}>Issue Date{sortIndicator('issue_date')}</th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('due_date')}>Due Date{sortIndicator('due_date')}</th>
              <th className="px-6 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('total_amount')}>Total (RM){sortIndicator('total_amount')}</th>
              <th className="px-6 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('amount_paid')}>Paid (RM){sortIndicator('amount_paid')}</th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>
              <th className="px-6 py-3 cursor-pointer select-none" onClick={() => toggleSort('approval')}>Approval{sortIndicator('approval')}</th>
              <th className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-[#8E9196] text-sm">Loading...</td>
              </tr>
            ) : sortedInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-[#8E9196] text-sm">No sales invoices found.</td>
              </tr>
            ) : (
              sortedInvoices.map((inv) => {
                const paymentCfg = PAYMENT_CFG[inv.payment_status];
                return (
                  <tr
                    key={inv.id}
                    className="group hover:bg-[#F2F4F6] cursor-pointer transition-colors"
                    onClick={() => setPreview(inv)}
                  >
                    <td data-col="Invoice #" className="px-6 py-3 font-medium text-[#191C1E]">{inv.invoice_number || '-'}</td>
                    <td data-col="Buyer" className="px-6 py-3 text-[#434654]">{inv.buyer_name}</td>
                    <td data-col="Issue Date" className="px-6 py-3 text-[#434654] tabular-nums">{formatDate(inv.issue_date)}</td>
                    <td data-col="Due Date" className="px-6 py-3 text-[#434654] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                    <td data-col="Total (RM)" className="px-6 py-3 text-right font-medium text-[#191C1E] tabular-nums">{formatRM(inv.total_amount)}</td>
                    <td data-col="Paid (RM)" className="px-6 py-3 text-right text-[#434654] tabular-nums">{formatRM(inv.amount_paid)}</td>
                    <td data-col="Payment" className="px-6 py-3">
                      {paymentCfg && <span className={paymentCfg.cls}>{paymentCfg.label}</span>}
                    </td>
                    <td data-col="Approval" className="px-6 py-3">
                      {APPROVAL_CFG[inv.approval] && <span className={APPROVAL_CFG[inv.approval].cls}>{APPROVAL_CFG[inv.approval].label}</span>}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreview(inv); }}
                        className="btn-primary text-label-sm px-3 py-1"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ CREATE MODAL ═══ */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-white shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: 'var(--sidebar)' }}>
                <h2 className="text-white font-semibold text-sm">New Sales Invoice</h2>
                <button onClick={() => setShowCreate(false)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              <div className="p-5 space-y-4">
                {createError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{createError}</p>}

                <div>
                  <label className="input-label">Buyer *</label>
                  <select
                    value={createData.supplier_id}
                    onChange={(e) => setCreateData({ ...createData, supplier_id: e.target.value })}
                    className="input-recessed w-full"
                  >
                    <option value="">Select buyer</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={newBuyerName}
                      onChange={(e) => setNewBuyerName(e.target.value)}
                      className="input-recessed flex-1 text-body-sm"
                      placeholder="Or type new buyer name..."
                    />
                    <button
                      type="button"
                      disabled={!newBuyerName.trim() || creatingBuyer}
                      onClick={async () => {
                        setCreatingBuyer(true);
                        try {
                          const res = await fetch(suppliersApi, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newBuyerName.trim(), ...(suppliers[0]?.firm_id ? { firm_id: suppliers[0].firm_id } : {}) }),
                          });
                          const j = await res.json();
                          if (res.ok && j.data) {
                            setSuppliers((prev) => [...prev, { id: j.data.id, name: j.data.name, firm_id: j.data.firm_id }].sort((a, b) => a.name.localeCompare(b.name)));
                            setCreateData({ ...createData, supplier_id: j.data.id });
                            setNewBuyerName('');
                          } else {
                            setCreateError(j.error || 'Failed to create buyer');
                          }
                        } catch { setCreateError('Failed to create buyer'); }
                        setCreatingBuyer(false);
                      }}
                      className="text-label-sm px-3 py-1.5 rounded-lg font-medium text-white btn-primary transition-all duration-200 disabled:opacity-40"
                    >
                      {creatingBuyer ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="input-label">Invoice Number *</label>
                  <input
                    type="text"
                    value={createData.invoice_number}
                    onChange={(e) => setCreateData({ ...createData, invoice_number: e.target.value })}
                    className="input-recessed w-full"
                    placeholder="e.g. SI-2026-001"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">Issue Date *</label>
                    <input
                      type="date"
                      value={createData.issue_date}
                      onChange={(e) => setCreateData({ ...createData, issue_date: e.target.value })}
                      className="input-recessed w-full"
                    />
                  </div>
                  <div>
                    <label className="input-label">Due Date</label>
                    <input
                      type="date"
                      value={createData.due_date}
                      onChange={(e) => setCreateData({ ...createData, due_date: e.target.value })}
                      className="input-recessed w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="input-label">Notes</label>
                  <textarea
                    value={createData.notes}
                    onChange={(e) => setCreateData({ ...createData, notes: e.target.value })}
                    className="input-recessed w-full"
                    rows={2}
                    placeholder="Optional notes"
                  />
                </div>

                {/* ── Category (admin only) ── */}
                {role === 'admin' && createCategories.length > 0 && (
                  <div>
                    <label className="input-label">Category</label>
                    <select value={createCategoryId} onChange={(e) => setCreateCategoryId(e.target.value)} className="input-recessed w-full">
                      <option value="">Select category</option>
                      {createCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {/* ── GL Account Selection (accountant only) ── */}
                {role === 'accountant' && createGlAccounts.length > 0 && (() => {
                  const createFirmId = suppliers.find(s => s.id === createData.supplier_id)?.firm_id || suppliers[0]?.firm_id || '';
                  return (
                    <>
                      <div>
                        <label className="input-label">Revenue GL (Credit)</label>
                        <GlAccountSelect
                          value={createGlAccountId}
                          onChange={setCreateGlAccountId}
                          accounts={createGlAccounts}
                          firmId={createFirmId}
                          placeholder="Select Revenue GL"
                          preferredType="Revenue"
                          defaultType="Revenue"
                          defaultBalance="Credit"
                          onAccountCreated={(a) => setCreateGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                        />
                      </div>
                      <div>
                        <label className="input-label">Contra GL (Debit — Trade Receivables)</label>
                        <GlAccountSelect
                          value={createContraGlId}
                          onChange={setCreateContraGlId}
                          accounts={createGlAccounts}
                          firmId={createFirmId}
                          placeholder="Select Trade Receivables GL"
                          preferredType="Asset"
                          defaultType="Asset"
                          onAccountCreated={(a) => setCreateGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                        />
                      </div>
                    </>
                  );
                })()}

                {/* ── Line items ───────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="input-label mb-0">Line Items</label>
                    <button
                      type="button"
                      onClick={() => setLineItems((prev) => [...prev, emptyLineItem()])}
                      className="text-xs font-medium hover:underline transition-colors"
                      style={{ color: 'var(--primary)' }}
                    >
                      + Add Line Item
                    </button>
                  </div>

                  <div className="space-y-2">
                    {lineItems.map((li, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            placeholder="Description"
                            value={li.description}
                            onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                            className="input-recessed w-full text-sm"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-label-sm text-[#8E9196] font-medium">Qty</label>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={li.quantity}
                                onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                                className="input-recessed w-full text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-label-sm text-[#8E9196] font-medium">Unit Price (RM)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={li.unit_price}
                                onChange={(e) => updateLineItem(idx, 'unit_price', e.target.value)}
                                className="input-recessed w-full text-sm"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="text-label-sm text-[#8E9196] font-medium">Tax Rate (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={li.tax_rate}
                                onChange={(e) => updateLineItem(idx, 'tax_rate', e.target.value)}
                                className="input-recessed w-full text-sm"
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <div className="text-right text-xs text-[#434654]">
                            Line Total: <span className="font-medium text-[#191C1E]">{formatRM(calcLineTotal(li))}</span>
                            {parseFloat(li.tax_rate) > 0 && (
                              <span className="ml-2">+ Tax: <span className="font-medium text-[#191C1E]">{formatRM(calcLineTax(li))}</span></span>
                            )}
                          </div>
                        </div>
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(idx)}
                            className="text-[#8E9196] hover:text-red-500 text-lg leading-none mt-1 transition-colors"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Totals ─────────────────────────────────── */}
                  <div className="mt-3 pt-3 space-y-1 text-sm text-right">
                    <div className="flex justify-end gap-4">
                      <span className="text-[#434654]">Subtotal:</span>
                      <span className="font-medium text-[#191C1E] w-32">{formatRM(subtotal)}</span>
                    </div>
                    <div className="flex justify-end gap-4">
                      <span className="text-[#434654]">Tax:</span>
                      <span className="font-medium text-[#191C1E] w-32">{formatRM(taxTotal)}</span>
                    </div>
                    <div className="flex justify-end gap-4 text-base font-semibold">
                      <span className="text-[#434654]">Total:</span>
                      <span className="text-[#191C1E] w-32">{formatRM(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-5 py-4">
                <button
                  onClick={submitCreate}
                  disabled={submitting}
                  className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Creating...' : 'Create Invoice'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ PREVIEW PANEL ═══ */}
      {preview && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b bg-[var(--primary)]">
              <h2 className="text-white font-semibold text-sm">Sales Invoice Details</h2>
              <button onClick={() => setPreview(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Invoice No."  value={preview.invoice_number} />
                <Field label="Buyer"        value={preview.buyer_name} />
                <Field label="Issue Date"   value={formatDate(preview.issue_date)} />
                <Field label="Due Date"     value={preview.due_date ? formatDate(preview.due_date) : null} />
                <Field label="Subtotal"     value={formatRM(preview.subtotal)} />
                <Field label="Tax"          value={formatRM(preview.tax_amount)} />
                <Field label="Total Amount" value={formatRM(preview.total_amount)} />
                <Field label="Amount Paid"  value={formatRM(preview.amount_paid)} />
                <Field label="Notes"        value={preview.notes} />
              </dl>

              <div className="flex flex-wrap gap-2 pt-1">
                {(() => {
                  const cfg = PAYMENT_CFG[preview.payment_status];
                  return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                })()}
              </div>

              {/* ── Line items ───────────────────────────── */}
              {preview.items && preview.items.length > 0 && (
                <div>
                  <h3 className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide mb-2">Line Items</h3>
                  <div className="rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Tax</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.items.map((item) => (
                          <tr key={item.id}>
                            <td data-col="Description" className="px-3 py-2 text-[#434654]">{item.description}</td>
                            <td data-col="Qty" className="px-3 py-2 text-right text-[#434654] tabular-nums">{Number(item.quantity)}</td>
                            <td data-col="Price" className="px-3 py-2 text-right text-[#434654] tabular-nums">{formatRM(item.unit_price)}</td>
                            <td data-col="Tax" className="px-3 py-2 text-right text-[#434654] tabular-nums">{formatRM(item.tax_amount)}</td>
                            <td data-col="Total" className="px-3 py-2 text-right font-medium text-[#191C1E] tabular-nums">{formatRM(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* ── GL Account Assignment (accountant only) ── */}
            {role === 'accountant' && glAccounts.length > 0 && (
              <div className="px-5 pb-2 space-y-2">
                <div>
                  <label className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide block mb-1">Revenue GL (Credit)</label>
                  {preview.approval === 'approved' ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#F5F6F8] rounded-lg border border-gray-200">
                      <span className="text-sm font-medium text-[#191C1E]">{glAccounts.find(a => a.id === selectedGlAccountId)?.account_code ?? ''} — {glAccounts.find(a => a.id === selectedGlAccountId)?.name ?? 'Not assigned'}</span>
                    </div>
                  ) : (
                    <GlAccountSelect
                      value={selectedGlAccountId}
                      onChange={setSelectedGlAccountId}
                      accounts={glAccounts}
                      firmId={preview.firm_id}
                      placeholder="Select Revenue GL"
                      preferredType="Revenue"
                      defaultType="Revenue"
                      defaultBalance="Credit"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  )}
                </div>
                <div>
                  <label className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide block mb-1">Contra GL (Debit — Trade Receivables)</label>
                  {preview.approval === 'approved' ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#F5F6F8] rounded-lg border border-gray-200">
                      <span className="text-sm font-medium text-[#191C1E]">{glAccounts.find(a => a.id === selectedContraGlId)?.account_code ?? ''} — {glAccounts.find(a => a.id === selectedContraGlId)?.name ?? 'Not assigned'}</span>
                    </div>
                  ) : (
                    <GlAccountSelect
                      value={selectedContraGlId}
                      onChange={setSelectedContraGlId}
                      accounts={glAccounts}
                      firmId={preview.firm_id}
                      placeholder="Select Trade Receivables GL"
                      preferredType="Asset"
                      defaultType="Asset"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Actions ──────────────────────────────── */}
            <div className="flex-shrink-0 p-4 space-y-2">
              {role === 'accountant' && preview.approval === 'pending_approval' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => batchAction([preview.id], 'approve', selectedGlAccountId || undefined, selectedContraGlId || undefined)}
                    className="btn-approve flex-1 py-2 rounded-lg text-sm font-semibold"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => batchAction([preview.id], 'reject')}
                    className="btn-reject flex-1 py-2 rounded-lg text-sm font-semibold"
                  >
                    Reject
                  </button>
                </div>
              )}
              {role === 'accountant' && (preview.approval === 'approved' || preview.approval === 'not_approved') && (
                <div className="flex gap-3">
                  <button
                    onClick={() => batchAction([preview.id], 'revert')}
                    className="btn-reject flex-1 py-2 rounded-lg text-sm font-semibold"
                  >
                    Revert to Pending
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => deleteInvoice(preview.id)}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {deleting ? 'Deleting...' : 'Delete Invoice'}
                </button>
                <button onClick={() => setPreview(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
