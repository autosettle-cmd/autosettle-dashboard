'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalSubmitted: number;
  pendingApproval: number;
  approvedThisMonth: number;
  approvedAmountThisMonth: string;
}

interface ClaimRow {
  id: string;
  claim_date: string;
  merchant: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  reviewed:       { label: 'Reviewed',       cls: 'bg-blue-100  text-blue-800  border border-blue-200'  },
};

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',  cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  approved:         { label: 'Approved', cls: 'bg-green-100 text-green-800 border border-green-200' },
  not_approved:     { label: 'Rejected', cls: 'bg-red-100   text-red-800   border border-red-200'   },
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
  { label: 'Dashboard',  href: '/employee/dashboard' },
  { label: 'My Claims',  href: '/employee/claims'    },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentClaims, setRecentClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);

  // Load stats
  useEffect(() => {
    fetch('/api/employee/stats')
      .then((r) => r.json())
      .then((j) => { if (j.data) setStats(j.data); })
      .catch(console.error);
  }, []);

  // Load recent claims (max 5)
  useEffect(() => {
    fetch('/api/employee/claims')
      .then((r) => r.json())
      .then((j) => {
        setRecentClaims((j.data ?? []).slice(0, 5));
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
          <p className="text-white/50 text-xs mt-0.5 capitalize">{session?.user?.role ?? 'employee'}</p>
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
            <StatCard label="Total Submitted"        value={stats?.totalSubmitted ?? null}    color="gray"  />
            <StatCard label="Pending Approval"       value={stats?.pendingApproval ?? null}   color="amber" />
            <StatCard label="Approved This Month"    value={stats?.approvedThisMonth ?? null} color="green" />
            <StatCard label="Total Approved (RM)"    value={stats ? formatRM(stats.approvedAmountThisMonth) : null} color="green" />
          </div>

          {/* ── Recent Submissions ─────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Recent Submissions</h2>
              <Link
                href="/employee/claims"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                View all claims &rarr;
              </Link>
            </div>

            {loadingClaims ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : recentClaims.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No claims submitted yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Merchant</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Approval</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentClaims.map((c) => {
                    const sCfg = STATUS_CFG[c.status];
                    const aCfg = APPROVAL_CFG[c.approval];
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3 text-gray-600">{formatDate(c.claim_date)}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium">{c.merchant}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium text-right">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3">
                          {sCfg && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sCfg.cls}`}>
                              {sCfg.label}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {aCfg && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${aCfg.cls}`}>
                              {aCfg.label}
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
