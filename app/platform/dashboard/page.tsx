'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PlatformSidebar from '@/components/PlatformSidebar';
import { usePageTitle } from '@/lib/use-page-title';

interface Analytics {
  firms: { total: number; active: number; inactive: number; recent: { id: string; name: string; created_at: string; is_active: boolean }[] };
  users: { total: number; accountants: number; admins: number; employees: number; platform_owners: number };
  activity: {
    claims: { total: number; thisMonth: number };
    invoices: { total: number; thisMonth: number };
    journalEntries: { total: number; thisMonth: number };
  };
  firmStats: { id: string; name: string; users: number; employees: number; claims: number; invoices: number; journalEntries: number }[];
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white card-popped px-5 py-4">
      <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">{label}</p>
      <p className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PlatformDashboardPage() {
  usePageTitle('Platform Dashboard');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/platform/analytics')
      .then(r => r.json())
      .then(j => { setData(j.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <PlatformSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center bg-white border-b border-[#E0E3E5] pl-14 pr-6">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Platform Dashboard</h1>
        </header>

        <main className="flex-1 overflow-y-auto paper-texture">
          <div className="ledger-binding p-8 pl-14 space-y-6 animate-in">
            {loading ? (
              <div className="text-center py-12 text-sm text-[var(--text-secondary)]">Loading...</div>
            ) : data ? (
              <>
                {/* Top stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <StatCard label="Total Firms" value={data.firms.total} sub={`${data.firms.active} active, ${data.firms.inactive} inactive`} />
                  <StatCard label="Total Users" value={data.users.total} />
                  <StatCard label="Accountants" value={data.users.accountants} />
                  <StatCard label="Admins" value={data.users.admins} />
                  <StatCard label="Employees" value={data.users.employees} />
                  <StatCard label="Platform Owners" value={data.users.platform_owners} />
                </div>

                {/* Activity this month */}
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Activity This Month</h2>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Claims" value={data.activity.claims.thisMonth} sub={`${data.activity.claims.total} total`} />
                    <StatCard label="Invoices" value={data.activity.invoices.thisMonth} sub={`${data.activity.invoices.total} total`} />
                    <StatCard label="Journal Entries" value={data.activity.journalEntries.thisMonth} sub={`${data.activity.journalEntries.total} total`} />
                  </div>
                </div>

                {/* Firm stats table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Firms Overview</h2>
                    <Link href="/platform/firms" className="text-xs text-[var(--primary)] hover:underline">Manage Firms</Link>
                  </div>
                  <div className="bg-white card-popped overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Firm</th>
                          <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right w-[80px]">Users</th>
                          <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right w-[80px]">Employees</th>
                          <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right w-[80px]">Claims</th>
                          <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right w-[80px]">Invoices</th>
                          <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right w-[80px]">JVs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.firmStats.map((f, i) => (
                          <tr key={f.id} className={`hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]'}`}>
                            <td className="px-5 py-2.5 font-medium text-[var(--text-primary)]">{f.name}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.users}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.employees}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.claims}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.invoices}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.journalEntries}</td>
                          </tr>
                        ))}
                        {data.firmStats.length === 0 && (
                          <tr><td colSpan={6} className="text-center py-8 text-[var(--text-secondary)] text-sm">No firms yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent firms */}
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Recently Created Firms</h2>
                  <div className="bg-white card-popped">
                    {data.firms.recent.map((f, i) => (
                      <div key={f.id} className={`flex items-center justify-between px-5 py-3 ${i > 0 ? 'border-t border-[var(--surface-low)]' : ''}`}>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{f.name}</p>
                          <p className="text-xs text-[var(--text-secondary)] tabular-nums">{new Date(f.created_at).toLocaleDateString('en-MY')}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 font-medium ${f.is_active ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]' : 'bg-[var(--surface-header)] text-[var(--text-secondary)]'}`} style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                          {f.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-sm text-[var(--text-secondary)]">Failed to load analytics.</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
