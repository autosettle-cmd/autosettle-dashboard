'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

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
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
  invoices: AgingInvoice[];
}

interface Summary {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/admin/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/admin/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/admin/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/admin/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/admin/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Bucket cell helper ──────────────────────────────────────────────────────

function BucketCell({ value, highlight }: { value: number; highlight?: boolean }) {
  if (value === 0) return <td className="px-4 py-3 text-right text-gray-300 tabular-nums text-[13px]">-</td>;
  return (
    <td className={`px-4 py-3 text-right tabular-nums text-[13px] font-semibold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
      {formatRM(value)}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgingReportPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  const [supplierData, setSupplierData] = useState<SupplierBucket[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/invoices/aging')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setSupplierData(j.data.suppliers);
          setSummary(j.data.summary);
        }
        setLoading(false);
      })
      .catch((e) => { console.error(e); setLoading(false); });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ backgroundColor: '#152237' }}>
        <div className="h-14 flex items-center gap-2 px-5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#A60201' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white font-bold text-base tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map(({ label, href, icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  active ? 'text-white bg-white/[0.1]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-bold">
              {(session?.user?.name ?? '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '—'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left">
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Link href="/admin/invoices" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-gray-900 font-semibold text-[15px]">Aging Report — Accounts Payable</h1>
          </div>
          <p className="text-gray-400 text-xs">
            As of {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
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
            <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <th className="px-5 py-3 text-left" style={{ width: '28%' }}>Supplier</th>
                    <th className="px-4 py-3 text-right">Current</th>
                    <th className="px-4 py-3 text-right">1-30 Days</th>
                    <th className="px-4 py-3 text-right">31-60 Days</th>
                    <th className="px-4 py-3 text-right">61-90 Days</th>
                    <th className="px-4 py-3 text-right">90+ Days</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierData.map((s) => (
                    <>
                      {/* Supplier summary row */}
                      <tr
                        key={s.supplier_id}
                        onClick={() => setExpandedId(expandedId === s.supplier_id ? null : s.supplier_id)}
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer border-b border-gray-50"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <svg
                              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${expandedId === s.supplier_id ? 'rotate-90' : ''}`}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                            <div>
                              <p className="text-[13px] font-semibold text-gray-900">{s.supplier_name}</p>
                              <p className="text-[11px] text-gray-400">{s.invoices.length} invoice{s.invoices.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </td>
                        <BucketCell value={s.current} />
                        <BucketCell value={s.days1_30} highlight={s.days1_30 > 0} />
                        <BucketCell value={s.days31_60} highlight={s.days31_60 > 0} />
                        <BucketCell value={s.days61_90} highlight={s.days61_90 > 0} />
                        <BucketCell value={s.days90plus} highlight={s.days90plus > 0} />
                        <td className="px-4 py-3 text-right tabular-nums text-[13px] font-bold text-gray-900">
                          {formatRM(s.total)}
                        </td>
                      </tr>

                      {/* Expanded invoices */}
                      {expandedId === s.supplier_id && s.invoices.map((inv) => {
                        const pmtCfg = PAYMENT_CFG[inv.payment_status];
                        return (
                          <tr key={inv.id} className="bg-gray-50/50 border-b border-gray-50/80 text-[12px]">
                            <td className="px-5 py-2.5 pl-12">
                              <div className="flex items-center gap-3">
                                <span className="text-gray-500 tabular-nums">{formatDate(inv.issue_date)}</span>
                                <span className="text-gray-700 font-medium">{inv.invoice_number ?? '-'}</span>
                                {pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}
                              </div>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                Due: {inv.due_date ? formatDate(inv.due_date) : 'N/A'} · {inv.category_name}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === 'current' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '1-30' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '31-60' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '61-90' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{inv.bucket === '90+' ? formatRMStr(inv.balance) : '-'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-700">{formatRMStr(inv.balance)}</td>
                          </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>

                {/* Summary footer */}
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-[13px]">
                      <td className="px-5 py-3.5 text-gray-900">Total</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-900">{formatRM(summary.current)}</td>
                      <td className={`px-4 py-3.5 text-right tabular-nums ${summary.days1_30 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days1_30)}</td>
                      <td className={`px-4 py-3.5 text-right tabular-nums ${summary.days31_60 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days31_60)}</td>
                      <td className={`px-4 py-3.5 text-right tabular-nums ${summary.days61_90 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days61_90)}</td>
                      <td className={`px-4 py-3.5 text-right tabular-nums ${summary.days90plus > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(summary.days90plus)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-gray-900">{formatRM(summary.total)}</td>
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
