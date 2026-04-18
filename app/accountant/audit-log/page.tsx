'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  firm_id: string;
  table_name: string;
  record_id: string;
  action: 'create' | 'update' | 'delete';
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  user_id: string | null;
  user_name: string | null;
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACTION_BADGES: Record<string, string> = {
  create: 'badge-green',
  update: 'badge-blue',
  delete: 'badge-red',
};

const TABLE_LABELS: Record<string, string> = {
  Claim: 'Claim',
  Invoice: 'Invoice',
  Payment: 'Payment',
  GLAccount: 'GL Account',
  FiscalYear: 'Fiscal Year',
  Period: 'Period',
};

const TABLE_OPTIONS = ['Claim', 'Invoice', 'Payment', 'GLAccount', 'FiscalYear', 'Period'];

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const date = [
    d.getFullYear(),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('.');
  const time = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AuditLogPage() {
  usePageTitle('Audit Log');
  const { firmId, firmsLoaded } = useFirm();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load audit logs
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmId) { setLogs([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const p = new URLSearchParams({ firmId, page: String(page) });
    if (tableFilter) p.set('table', tableFilter);
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);

    fetch(`/api/audit-log?${p}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          setLogs(j.data ?? []);
          setTotalPages(j.meta?.totalPages ?? 1);
          setTotal(j.meta?.total ?? 0);
          setLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, tableFilter, dateFrom, dateTo, page, firmsLoaded]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [firmId, tableFilter, dateFrom, dateTo]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Audit Log</h1>
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture ledger-binding animate-in">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="input-field">
              <option value="">All Tables</option>
              {TABLE_OPTIONS.map((t) => <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>)}
            </select>

            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
            <span className="text-[var(--text-secondary)] text-sm">—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
          </div>

          {!firmId ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Select a firm to view audit logs.</div>
          ) : loading ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="bg-white p-12 text-center">
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Audit Entries</h3>
              <p className="text-sm text-[var(--text-secondary)]">No audit events recorded yet for this firm.</p>
            </div>
          ) : (
            <div className="bg-white overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Timestamp</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">User</th>
                      <th className="px-3 py-2.5 w-[80px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Action</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Table</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Record</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => (
                      <>
                        <tr
                          key={log.id}
                          className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums text-xs">{formatTimestamp(log.timestamp)}</td>
                          <td className="px-3 py-3 text-[var(--text-primary)] font-medium">{log.user_name ?? '—'}</td>
                          <td className="px-3 py-3">
                            <span className={ACTION_BADGES[log.action] ?? 'badge-gray'}>{log.action}</span>
                          </td>
                          <td className="px-3 py-3 text-[var(--text-secondary)]">{TABLE_LABELS[log.table_name] ?? log.table_name}</td>
                          <td className="px-3 py-3 text-[var(--text-secondary)] font-mono text-xs">{log.record_id.slice(0, 8)}...</td>
                          <td className="px-3 py-3 text-[var(--text-secondary)] text-xs">
                            {log.changed_fields ? log.changed_fields.join(', ') : '—'}
                          </td>
                        </tr>

                        {/* Expanded diff row */}
                        {expandedId === log.id && (log.old_values || log.new_values) && (
                          <tr key={`${log.id}-diff`}>
                            <td colSpan={6} className="px-5 py-3 bg-[var(--surface-low)]">
                              <div className="space-y-1.5">
                                {(log.changed_fields ?? Object.keys(log.new_values ?? log.old_values ?? {})).map((field) => (
                                  <div key={field} className="flex items-center gap-3 text-xs">
                                    <span className="font-mono font-semibold text-[var(--text-secondary)] w-[140px] flex-shrink-0">{field}</span>
                                    {log.old_values && field in log.old_values && (
                                      <span className="text-[var(--reject-red)] line-through">{formatValue(log.old_values[field])}</span>
                                    )}
                                    {log.old_values && log.new_values && <span className="text-[var(--text-secondary)]">→</span>}
                                    {log.new_values && field in log.new_values && (
                                      <span className="text-[var(--match-green)] font-medium">{formatValue(log.new_values[field])}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 bg-[var(--surface-low)]">
                  <p className="text-body-sm text-[var(--text-secondary)] tabular-nums">{total} entries</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-body-sm text-[var(--text-secondary)] tabular-nums">{page} / {totalPages}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
