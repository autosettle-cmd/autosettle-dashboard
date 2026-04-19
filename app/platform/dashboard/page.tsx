'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PlatformSidebar from '@/components/PlatformSidebar';
import { usePageTitle } from '@/lib/use-page-title';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';

interface Analytics {
  firms: { total: number; active: number; inactive: number; recent: { id: string; name: string; created_at: string; is_active: boolean }[] };
  users: { total: number; accountants: number; admins: number; employees: number; platform_owners: number };
  activity: {
    claims: { total: number; thisMonth: number };
    invoices: { total: number; thisMonth: number };
    journalEntries: { total: number; thisMonth: number };
  };
  firmStats: { id: string; name: string; users: number; employees: number; claims: number; invoices: number; journalEntries: number }[];
  charts: {
    uploadVolume: { date: string; claims: number; invoices: number; statements: number }[];
    confidence: { claims: Record<string, number>; invoices: Record<string, number> };
    pipeline: { claims: Pipeline; invoices: Pipeline };
    recon: { matched: number; unmatched: number; excluded: number; total: number };
    ocr: { total: number; avgProcessingMs: number; success: number; failed: number };
  };
}

interface Pipeline { pendingReview: number; reviewed: number; approved: number; paid: number }

// Design system colors
const COLORS = {
  primary: '#234B6E',
  green: '#0A9981',
  red: '#F23545',
  amber: '#E65100',
  gray: '#9CA3AF',
  blue: '#3B82F6',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white card-popped px-5 py-4">
      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white card-popped p-5">
      <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-4">{title}</h3>
      {children}
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

                {/* ═══ CHARTS ═══ */}

                {/* Upload Volume — last 30 days */}
                <ChartCard title="Upload Volume — Last 30 Days">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={data.charts.uploadVolume}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} stroke={COLORS.gray} />
                      <YAxis tick={{ fontSize: 10 }} stroke={COLORS.gray} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #E0E3E5' }} />
                      <Area type="monotone" dataKey="claims" stackId="1" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.6} name="Claims" />
                      <Area type="monotone" dataKey="invoices" stackId="1" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.6} name="Invoices" />
                      <Area type="monotone" dataKey="statements" stackId="1" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.6} name="Statements" />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* OCR Performance + Confidence */}
                <div className="grid grid-cols-2 gap-3">
                  <ChartCard title="OCR Confidence — Claims">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={[
                          { name: 'High', value: data.charts.confidence.claims.HIGH || 0 },
                          { name: 'Medium', value: data.charts.confidence.claims.MEDIUM || 0 },
                          { name: 'Low', value: data.charts.confidence.claims.LOW || 0 },
                        ]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                          <Cell fill={COLORS.green} />
                          <Cell fill={COLORS.amber} />
                          <Cell fill={COLORS.red} />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="OCR Confidence — Invoices">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={[
                          { name: 'High', value: data.charts.confidence.invoices.HIGH || 0 },
                          { name: 'Medium', value: data.charts.confidence.invoices.MEDIUM || 0 },
                          { name: 'Low', value: data.charts.confidence.invoices.LOW || 0 },
                        ]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                          <Cell fill={COLORS.green} />
                          <Cell fill={COLORS.amber} />
                          <Cell fill={COLORS.red} />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {/* OCR Log Stats */}
                {data.charts.ocr.total > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Total OCR Runs" value={data.charts.ocr.total} />
                    <StatCard label="Success" value={data.charts.ocr.success} sub={`${data.charts.ocr.total > 0 ? Math.round((data.charts.ocr.success / data.charts.ocr.total) * 100) : 0}%`} />
                    <StatCard label="Failed" value={data.charts.ocr.failed} sub={`${data.charts.ocr.total > 0 ? Math.round((data.charts.ocr.failed / data.charts.ocr.total) * 100) : 0}%`} />
                    <StatCard label="Avg Processing" value={`${data.charts.ocr.avgProcessingMs}ms`} />
                  </div>
                )}

                {/* Workflow Pipeline */}
                <ChartCard title="Workflow Pipeline">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={[
                      { name: 'Claims', ...data.charts.pipeline.claims },
                      { name: 'Invoices', ...data.charts.pipeline.invoices },
                    ]} layout="vertical" barSize={24}>
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke={COLORS.gray} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} stroke={COLORS.gray} />
                      <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #E0E3E5' }} />
                      <Bar dataKey="pendingReview" stackId="1" fill={COLORS.amber} name="Pending Review" />
                      <Bar dataKey="reviewed" stackId="1" fill={COLORS.primary} name="Reviewed" />
                      <Bar dataKey="approved" stackId="1" fill={COLORS.green} name="Approved" />
                      <Bar dataKey="paid" stackId="1" fill={COLORS.gray} name="Paid" />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Bank Recon Health */}
                <div className="grid grid-cols-2 gap-3">
                  <ChartCard title="Bank Reconciliation Health">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={[
                          { name: 'Matched', value: data.charts.recon.matched },
                          { name: 'Unmatched', value: data.charts.recon.unmatched },
                          { name: 'Excluded', value: data.charts.recon.excluded },
                        ]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                          <Cell fill={COLORS.green} />
                          <Cell fill={COLORS.red} />
                          <Cell fill={COLORS.gray} />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Total Transactions" value={data.charts.recon.total} />
                    <StatCard label="Match Rate" value={data.charts.recon.total > 0 ? `${Math.round((data.charts.recon.matched / data.charts.recon.total) * 100)}%` : '—'} />
                    <StatCard label="Unmatched" value={data.charts.recon.unmatched} />
                    <StatCard label="Excluded" value={data.charts.recon.excluded} />
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
                        <tr className="ds-table-header text-left">
                          <th className="px-5 py-2.5">Firm</th>
                          <th className="px-3 py-2.5 text-right w-[80px]">Users</th>
                          <th className="px-3 py-2.5 text-right w-[80px]">Employees</th>
                          <th className="px-3 py-2.5 text-right w-[80px]">Claims</th>
                          <th className="px-3 py-2.5 text-right w-[80px]">Invoices</th>
                          <th className="px-3 py-2.5 text-right w-[80px]">JVs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.firmStats.map((f, i) => (
                          <tr key={f.id} className={`hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]'}`}>
                            <td data-col="Firm" className="px-5 py-2.5 font-medium text-[var(--text-primary)]">{f.name}</td>
                            <td data-col="Users" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.users}</td>
                            <td data-col="Employees" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.employees}</td>
                            <td data-col="Claims" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.claims}</td>
                            <td data-col="Invoices" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.invoices}</td>
                            <td data-col="JVs" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{f.journalEntries}</td>
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
                        <span className={f.is_active ? 'badge-green' : 'badge-gray'}>{f.is_active ? 'Active' : 'Inactive'}</span>
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
