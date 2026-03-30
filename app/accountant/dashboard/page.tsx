'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalThisMonth: number;
  pendingApproval: number;
  approvedThisMonth: number;
  approvedAmountThisMonth: string;
}

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_name: string;
  merchant: string;
  category_name: string;
  amount: string;
  approval: 'pending_approval' | 'approved' | 'not_approved';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/accountant/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Receipts',   href: '/accountant/receipts',   icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { label: 'Clients',    href: '/accountant/clients',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/accountant/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/accountant/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { label: 'Admins',     href: '/accountant/admins',     icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountantDashboard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingClaims, setPendingClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);

  useEffect(() => {
    fetch('/api/claims/stats')
      .then((r) => r.json())
      .then((j) => { if (j.data) setStats(j.data); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/claims?approval=pending_approval')
      .then((r) => r.json())
      .then((j) => {
        setPendingClaims((j.data ?? []).slice(0, 5));
        setLoadingClaims(false);
      })
      .catch((e) => { console.error(e); setLoadingClaims(false); });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ backgroundColor: '#152237' }}>
        {/* Logo */}
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map(({ label, href, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-white bg-white/[0.1]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
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
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Dashboard</h1>
          <p className="text-gray-400 text-xs">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Claims" sublabel="this month" value={stats?.totalThisMonth ?? null} color="default" />
            <StatCard label="Pending Approval" value={stats?.pendingApproval ?? null} color="amber" />
            <StatCard label="Approved" sublabel="this month" value={stats?.approvedThisMonth ?? null} color="green" />
            <StatCard label="Approved Amount" value={stats ? formatRM(stats.approvedAmountThisMonth) : null} color="green" />
          </div>

          {/* Needs Attention */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <h2 className="text-[13px] font-semibold text-gray-900">Needs Attention</h2>
              <Link
                href="/accountant/claims"
                className="text-[12px] font-medium hover:underline transition-colors"
                style={{ color: '#A60201' }}
              >
                View all claims &rarr;
              </Link>
            </div>

            {loadingClaims ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
            ) : pendingClaims.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-gray-400">No pending claims</p>
                <p className="text-xs text-gray-300 mt-1">You&apos;re all caught up.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Employee</th>
                    <th className="px-5 py-2.5">Merchant</th>
                    <th className="px-5 py-2.5">Category</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingClaims.map((c, i) => {
                    const cfg = APPROVAL_CFG[c.approval];
                    return (
                      <tr key={c.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < pendingClaims.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <td className="px-5 py-3 text-gray-500 tabular-nums">{formatDate(c.claim_date)}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium">{c.employee_name}</td>
                        <td className="px-5 py-3 text-gray-600">{c.merchant}</td>
                        <td className="px-5 py-3 text-gray-500">{c.category_name}</td>
                        <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3">
                          {cfg && <span className={cfg.cls}>{cfg.label}</span>}
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, sublabel, value, color }: {
  label: string;
  sublabel?: string;
  value: string | number | null;
  color: 'default' | 'amber' | 'green';
}) {
  const accent = {
    default: { dot: 'bg-gray-300', value: 'text-gray-900' },
    amber:   { dot: 'bg-amber-400', value: 'text-amber-600' },
    green:   { dot: 'bg-emerald-400', value: 'text-emerald-600' },
  }[color];

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${accent.value}`}>
        {value ?? <span className="text-gray-200">&mdash;</span>}
      </p>
      {sublabel && <p className="text-[11px] text-gray-300 mt-0.5">{sublabel}</p>}
    </div>
  );
}
