'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierInfo {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
}

interface StatementEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementData {
  supplier: SupplierInfo;
  period: { from: string; to: string };
  opening_balance: number;
  entries: StatementEntry[];
  totals: { total_debit: number; total_credit: number };
  closing_balance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/accountant/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/accountant/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/accountant/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Clients',    href: '/accountant/clients',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/accountant/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/accountant/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountantSupplierStatementPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();
  const params = useParams();
  const id = params.id as string;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [dateFrom, setDateFrom] = useState(toInputDate(sixMonthsAgo));
  const [dateTo, setDateTo] = useState(toInputDate(new Date()));
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchStatement() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/suppliers/${id}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      if (!res.ok) throw new Error('Failed to load statement');
      const json = await res.json();
      setData(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStatement(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            const active = pathname === href || (href === '/accountant/suppliers' && pathname.startsWith('/accountant/suppliers'));
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
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '\u2014'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left">
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">

          {/* Back link */}
          <Link href="/accountant/suppliers" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            Back to Suppliers
          </Link>

          {/* Header */}
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
            Statement of Account{data?.supplier ? ` — ${data.supplier.name}` : ''}
          </h1>

          {/* Date range picker */}
          <div className="mt-5 flex items-end gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={fetchStatement} disabled={loading}
              className="h-9 px-5 text-[13px] font-medium text-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#A60201' }}>
              {loading ? 'Loading...' : 'Generate'}
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          {data && (
            <>
              {/* Supplier info */}
              <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
                <div className="flex gap-8">
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Supplier</p>
                    <p className="text-sm text-gray-900 mt-0.5 font-medium">{data.supplier.name}</p>
                  </div>
                  {data.supplier.contact_email && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Email</p>
                      <p className="text-sm text-gray-900 mt-0.5">{data.supplier.contact_email}</p>
                    </div>
                  )}
                  {data.supplier.contact_phone && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Phone</p>
                      <p className="text-sm text-gray-900 mt-0.5">{data.supplier.contact_phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Period</p>
                    <p className="text-sm text-gray-900 mt-0.5">{formatDate(data.period.from)} — {formatDate(data.period.to)}</p>
                  </div>
                </div>
              </div>

              {/* Summary boxes */}
              <div className="mt-4 grid grid-cols-4 gap-3">
                {[
                  { label: 'Opening Balance', value: data.opening_balance },
                  { label: 'Total Debit', value: data.totals.total_debit },
                  { label: 'Total Credit', value: data.totals.total_credit },
                  { label: 'Closing Balance', value: data.closing_balance },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{item.label}</p>
                    <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">{formatRM(item.value)}</p>
                  </div>
                ))}
              </div>

              {/* Statement table */}
              <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Reference</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Description</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Debit</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Credit</th>
                      <th className="px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <td className="px-5 py-2.5 text-[12px] text-gray-500">{formatDate(data.period.from)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-500" colSpan={2}>Opening Balance</td>
                      <td className="px-3 py-2.5 text-[12px] text-right tabular-nums text-gray-400">&mdash;</td>
                      <td className="px-3 py-2.5 text-[12px] text-right tabular-nums text-gray-400">&mdash;</td>
                      <td className="px-5 py-2.5 text-[12px] text-right tabular-nums font-semibold text-gray-900">{formatRM(data.opening_balance)}</td>
                    </tr>

                    {/* Data rows */}
                    {data.entries.map((entry, i) => (
                      <tr key={i} className={`text-[12px] hover:bg-white/60 transition-colors ${i < data.entries.length - 1 ? 'border-b border-gray-100' : 'border-b border-gray-100'}`}>
                        <td className="px-5 py-2.5 text-gray-500 tabular-nums">{formatDate(entry.date)}</td>
                        <td className="px-3 py-2.5 text-gray-700 font-medium">{entry.reference}</td>
                        <td className="px-3 py-2.5 text-gray-500">{entry.description}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{entry.debit > 0 ? formatRM(entry.debit) : '\u2014'}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${entry.credit > 0 ? 'text-green-600' : 'text-gray-900'}`}>{entry.credit > 0 ? formatRM(entry.credit) : '\u2014'}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-gray-900">{formatRM(entry.balance)}</td>
                      </tr>
                    ))}

                    {/* Closing balance row */}
                    <tr className="bg-gray-50/50 border-t-2 border-gray-200">
                      <td className="px-5 py-3 text-[12px] font-semibold text-gray-900">{formatDate(data.period.to)}</td>
                      <td className="px-3 py-3 text-[12px] font-semibold text-gray-900" colSpan={2}>Closing Balance</td>
                      <td className="px-3 py-3 text-[12px] text-right tabular-nums font-semibold text-gray-900">{formatRM(data.totals.total_debit)}</td>
                      <td className={`px-3 py-3 text-[12px] text-right tabular-nums font-semibold ${data.totals.total_credit > 0 ? 'text-green-600' : 'text-gray-900'}`}>{formatRM(data.totals.total_credit)}</td>
                      <td className="px-5 py-3 text-[12px] text-right tabular-nums font-bold text-gray-900">{formatRM(data.closing_balance)}</td>
                    </tr>
                  </tbody>
                </table>

                {data.entries.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">No entries found for this period.</div>
                )}
              </div>
            </>
          )}

          {!data && !loading && !error && (
            <div className="mt-8 text-center text-sm text-gray-400">Select a date range and click Generate to view the statement.</div>
          )}
        </div>
      </main>
    </div>
  );
}
