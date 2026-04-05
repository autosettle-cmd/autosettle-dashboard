'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgingInvoice {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  total_amount: string;
  amount_paid: string;
  balance: string;
  payment_status: string;
  category_name: string;
  vendor_name_raw: string;
  bucket: string;
}

interface SupplierBucket {
  supplier_id: string;
  supplier_name: string;
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
  invoices: AgingInvoice[];
}

interface Summary {
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
}

interface FirmOption {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray'   },
  partially_paid: { label: 'Partial', cls: 'badge-amber'  },
  paid:           { label: 'Paid',    cls: 'badge-purple' },
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

function formatRM(val: number) {
  return `RM ${val.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRMStr(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Bucket cell helper ──────────────────────────────────────────────────────

function BucketCell({ value, highlight }: { value: number; highlight?: boolean }) {
  if (value === 0) return <td className="px-6 py-3 text-right text-gray-300 tabular-nums text-body-md">-</td>;
  return (
    <td className={`px-6 py-3 text-right tabular-nums text-body-md font-semibold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
      {formatRM(value)}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountantAgingReportPage() {
  const [supplierData, setSupplierData] = useState<SupplierBucket[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmFilter, setFirmFilter] = useState('');

  // Load firms
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => {
        const list = j.data ?? [];
        setFirms(list);
        if (list.length === 1) setFirmFilter(list[0].id);
      })
      .catch(console.error);
  }, []);

  // Load aging data
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (firmFilter) params.set('firmId', firmFilter);
    fetch(`/api/invoices/aging?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setSupplierData(j.data.suppliers);
          setSummary(j.data.summary);
        }
        setLoading(false);
      })
      .catch((e) => { console.error(e); setLoading(false); });
  }, [firmFilter]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <div className="flex items-center gap-3">
            <Link href="/accountant/invoices" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-gray-900 font-bold text-title-lg tracking-tight">Aging Report — Accounts Payable</h1>
          </div>
          <div className="flex items-center gap-3">
            {firms.length > 1 && (
              <select value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)} className="input-field text-body-md">
                <option value="">All Firms</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <p className="text-gray-400 text-xs">
              As of {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">

          {loading ? (
            <div className="text-center text-sm text-gray-400 py-12">Loading aging report...</div>
          ) : supplierData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">No outstanding invoices</p>
              <p className="text-xs text-gray-300 mt-1">All invoices are paid.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="ds-table-header">
                    <th className="px-6 py-3 text-left" style={{ width: '28%' }}>Supplier</th>
                    <th className="px-6 py-3 text-right">0-30 Days</th>
                    <th className="px-6 py-3 text-right">31-60 Days</th>
                    <th className="px-6 py-3 text-right">61-90 Days</th>
                    <th className="px-6 py-3 text-right">90+ Days</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierData.map((s) => (
                    <>
                      {/* Supplier summary row */}
                      <tr
                        key={s.supplier_id}
                        onClick={() => setExpandedId(expandedId === s.supplier_id ? null : s.supplier_id)}
                        className="group hover:bg-[#F2F4F6] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <svg
                              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${expandedId === s.supplier_id ? 'rotate-90' : ''}`}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                            <div>
                              <p className="text-body-md font-semibold text-gray-900">{s.supplier_name}</p>
                              <p className="text-label-sm text-gray-400">{s.invoices.length} invoice{s.invoices.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </td>
                        <BucketCell value={s.days0_30} />
                        <BucketCell value={s.days31_60} highlight={s.days31_60 > 0} />
                        <BucketCell value={s.days61_90} highlight={s.days61_90 > 0} />
                        <BucketCell value={s.days90plus} highlight={s.days90plus > 0} />
                        <td className="px-6 py-3 text-right tabular-nums text-body-md font-bold text-gray-900">
                          {formatRM(s.total)}
                        </td>
                      </tr>

                      {/* Expanded invoices */}
                      {expandedId === s.supplier_id && s.invoices.map((inv) => {
                        const pmtCfg = PAYMENT_CFG[inv.payment_status];
                        return (
                          <tr key={inv.id} className="bg-gray-50/50 text-body-sm">
                            <td className="px-6 py-2.5 pl-12">
                              <div className="flex items-center gap-3">
                                <span className="text-gray-500 tabular-nums">{formatDate(inv.issue_date)}</span>
                                <span className="text-gray-700 font-medium">{inv.invoice_number ?? '-'}</span>
                                {pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}
                              </div>
                              <p className="text-label-sm text-gray-400 mt-0.5">
                                Due: {inv.due_date ? formatDate(inv.due_date) : 'N/A'} · {inv.category_name}
                              </p>
                            </td>
                            <td className="px-6 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '0-30' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-6 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '31-60' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-6 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '61-90' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-6 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '90+' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-6 py-2.5 text-right tabular-nums font-medium text-gray-700">{formatRMStr(inv.balance)}</td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>

                {/* Summary footer */}
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/50 font-bold text-body-md">
                      <td className="px-6 py-3.5 text-gray-900">Total</td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-gray-900">{formatRM(summary.days0_30)}</td>
                      <td className={`px-6 py-3.5 text-right tabular-nums ${summary.days31_60 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days31_60)}</td>
                      <td className={`px-6 py-3.5 text-right tabular-nums ${summary.days61_90 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days61_90)}</td>
                      <td className={`px-6 py-3.5 text-right tabular-nums ${summary.days90plus > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days90plus)}</td>
                      <td className="px-6 py-3.5 text-right tabular-nums text-gray-900">{formatRM(summary.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
