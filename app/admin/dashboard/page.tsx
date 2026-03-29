'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalClaims: number;
  pendingReview: number;
  reviewedThisMonth: number;
  totalAmount: string;
}

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_name: string;
  merchant: string;
  category_name: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  reviewed:       { label: 'Reviewed',       cls: 'bg-blue-100  text-blue-800  border border-blue-200'  },
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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard'   },
  { label: 'Claims',     href: '/admin/claims'      },
  { label: 'Receipts',   href: '/admin/receipts'    },
  { label: 'Employees',  href: '/admin/employees'   },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingClaims, setPendingClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);

  // Load stats
  useEffect(() => {
    fetch('/api/admin/claims/stats')
      .then((r) => r.json())
      .then((j) => { if (j.data) setStats(j.data); })
      .catch(console.error);
  }, []);

  // Load pending claims (max 5)
  useEffect(() => {
    fetch('/api/admin/claims?status=pending_review')
      .then((r) => r.json())
      .then((j) => {
        setPendingClaims((j.data ?? []).slice(0, 5));
        setLoadingClaims(false);
      })
      .catch((e) => { console.error(e); setLoadingClaims(false); });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#152237' }}>
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <span className="text-white font-bold text-xl tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center h-10 px-6 text-sm transition-colors ${
                  active ? 'text-white bg-white/10' : 'text-white/65 hover:text-white hover:bg-white/5'
                }`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r"
                    style={{ backgroundColor: '#A60201' }}
                  />
                )}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-white text-sm font-medium truncate">{session?.user?.name ?? '—'}</p>
          <p className="text-white/50 text-xs mt-0.5 capitalize">{session?.user?.role ?? 'admin'}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs text-white/60 hover:text-white py-1.5 px-3 rounded border border-white/20 hover:border-white/40 transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center px-6" style={{ backgroundColor: '#152237' }}>
          <h1 className="text-white font-semibold text-lg">Dashboard</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">

          {/* ── Stats ─────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Claims"           value={stats?.totalClaims ?? null}         color="gray" />
            <StatCard label="Pending Review"         value={stats?.pendingReview ?? null}       color="amber" />
            <StatCard label="Reviewed This Month"    value={stats?.reviewedThisMonth ?? null}   color="green" />
            <StatCard label="Total Amount (RM)"      value={stats ? formatRM(stats.totalAmount) : null} color="green" />
          </div>

          {/* ── Needs Attention ────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Needs Attention</h2>
              <Link
                href="/admin/claims"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                View all claims &rarr;
              </Link>
            </div>

            {loadingClaims ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : pendingClaims.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No claims pending review. You&apos;re all caught up.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Merchant</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendingClaims.map((c) => {
                    const cfg = STATUS_CFG[c.status];
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3 text-gray-600">{formatDate(c.claim_date)}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium">{c.employee_name}</td>
                        <td className="px-5 py-3 text-gray-600">{c.merchant}</td>
                        <td className="px-5 py-3 text-gray-600">{c.category_name}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium text-right">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3">
                          {cfg && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number | null; color: 'gray' | 'amber' | 'green' }) {
  const styles = {
    gray:  { border: 'border-gray-200',  text: 'text-gray-900',  sub: 'text-gray-500'  },
    amber: { border: 'border-amber-200', text: 'text-amber-600', sub: 'text-amber-500' },
    green: { border: 'border-green-200', text: 'text-green-600', sub: 'text-green-500' },
  }[color];

  return (
    <div className={`bg-white border ${styles.border} rounded-lg p-4 shadow-sm`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${styles.sub}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1.5 ${styles.text}`}>
        {value ?? <span className="text-gray-300">&mdash;</span>}
      </p>
    </div>
  );
}
