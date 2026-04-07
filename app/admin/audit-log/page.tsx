'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'create' | 'update' | 'delete';
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
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
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminAuditLogPage() {
  usePageTitle('Audit Log');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const p = new URLSearchParams({ page: String(page) });
    if (tableFilter) p.set('table', tableFilter);
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);

    fetch(`/api/admin/audit-log?${p}`)
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
  }, [tableFilter, dateFrom, dateTo, page]);

  useEffect(() => { setPage(1); }, [tableFilter, dateFrom, dateTo]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6F8]">
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Audit Log</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="input-field">
              <option value="">All Tables</option>
              {TABLE_OPTIONS.map((t) => <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
            <span className="text-gray-400 text-sm">—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <h3 className="text-base font-semibold text-[#191C1E] mb-1">No Audit Entries</h3>
              <p className="text-sm text-[#8E9196]">No audit events recorded yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-5 py-2.5">Timestamp</th>
                      <th className="px-3 py-2.5">User</th>
                      <th className="px-3 py-2.5 w-[80px]">Action</th>
                      <th className="px-3 py-2.5">Table</th>
                      <th className="px-3 py-2.5">Record</th>
                      <th className="px-3 py-2.5">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="text-body-sm hover:bg-[#F2F4F6] transition-colors border-b border-gray-50 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          <td className="px-5 py-3 text-[#434654] tabular-nums text-xs">{formatTimestamp(log.timestamp)}</td>
                          <td className="px-3 py-3 text-[#191C1E] font-medium">{log.user_name ?? '—'}</td>
                          <td className="px-3 py-3">
                            <span className={ACTION_BADGES[log.action] ?? 'badge-gray'}>{log.action}</span>
                          </td>
                          <td className="px-3 py-3 text-[#434654]">{TABLE_LABELS[log.table_name] ?? log.table_name}</td>
                          <td className="px-3 py-3 text-[#8E9196] font-mono text-xs">{log.record_id.slice(0, 8)}...</td>
                          <td className="px-3 py-3 text-[#8E9196] text-xs">
                            {log.changed_fields ? log.changed_fields.join(', ') : '—'}
                          </td>
                        </tr>

                        {expandedId === log.id && (log.old_values || log.new_values) && (
                          <tr key={`${log.id}-diff`} className="border-b border-gray-50">
                            <td colSpan={6} className="px-5 py-3 bg-[#F9FAFB]">
                              <div className="space-y-1.5">
                                {(log.changed_fields ?? Object.keys(log.new_values ?? log.old_values ?? {})).map((field) => (
                                  <div key={field} className="flex items-center gap-3 text-xs">
                                    <span className="font-mono font-semibold text-[#434654] w-[140px] flex-shrink-0">{field}</span>
                                    {log.old_values && field in log.old_values && (
                                      <span className="text-red-500 line-through">{formatValue(log.old_values[field])}</span>
                                    )}
                                    {log.old_values && log.new_values && <span className="text-[#8E9196]">→</span>}
                                    {log.new_values && field in log.new_values && (
                                      <span className="text-green-600 font-medium">{formatValue(log.new_values[field])}</span>
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                  <p className="text-body-sm text-[#8E9196]">{total} entries</p>
                  <div className="flex gap-1.5">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30">Previous</button>
                    <span className="px-3 py-1.5 text-body-sm text-[#8E9196]">{page} / {totalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30">Next</button>
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
