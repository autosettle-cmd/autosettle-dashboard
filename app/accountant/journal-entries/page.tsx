'use client';

import Sidebar from '@/components/Sidebar';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import { useState, useEffect } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

// ─── Types ──────────────────────────────────────────────────────────────────

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
}

interface JournalEntryRow {
  id: string;
  firm_id: string;
  firm_name: string;
  voucher_number: string;
  posting_date: string;
  period_label: string;
  description: string | null;
  source_type: string;
  source_id: string | null;
  status: 'posted' | 'reversed';
  reversed_by_id: string | null;
  reversal_of_id: string | null;
  created_at: string;
  total_debit: number;
  total_credit: number;
  lines: JournalLine[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  posted:   { label: 'Posted',   cls: 'badge-green' },
  reversed: { label: 'Reversed', cls: 'badge-red'   },
};

const SOURCE_CFG: Record<string, string> = {
  claim_approval:  'Claim',
  invoice_posting: 'Invoice',
  bank_recon:      'Bank Recon',
  manual:          'Manual',
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

function getDateRange(range: string, customFrom: string, customTo: string) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0];
  switch (range) {
    case 'this_week': {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { from: iso(monday), to: iso(now) };
    }
    case 'this_month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case 'last_month':
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to:   iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { from: customFrom, to: customTo };
    default:
      return { from: '', to: '' };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function JournalEntriesPage() {
  usePageTitle('Journal Entries');
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

  // Preview
  const [preview, setPreview] = useState<JournalEntryRow | null>(null);
  const [reversing, setReversing] = useState(false);

  // Firms
  const { firmId: firmFilter, firmsLoaded } = useFirm();

  // Filters
  const [dateRange,     setDateRange]     = useState('this_month');
  const [customFrom,    setCustomFrom]    = useState('');
  const [customTo,      setCustomTo]      = useState('');
  const [sourceFilter,  setSourceFilter]  = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search,        setSearch]        = useState('');
  const [hideReversals, setHideReversals] = useState(false);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!firmsLoaded) return;
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (firmFilter)    p.set('firmId',     firmFilter);
    if (from)          p.set('dateFrom',   from);
    if (to)            p.set('dateTo',     to);
    if (sourceFilter)  p.set('sourceType', sourceFilter);
    if (statusFilter)  p.set('status',     statusFilter);
    if (search)        p.set('search',     search);
    if (takeLimit)     p.set('take',       String(takeLimit));

    fetch(`/api/journal-entries?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEntries(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmsLoaded, firmFilter, dateRange, customFrom, customTo, sourceFilter, statusFilter, search, refreshKey, takeLimit]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const { sorted, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(entries, 'posting_date', 'desc');
  const filtered = hideReversals ? sorted.filter((e) => e.status !== 'reversed' && !e.reversal_of_id) : sorted;
  useEffect(() => { setPage(0); }, [sortField, sortDir, hideReversals]);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const reverseEntry = async (id: string) => {
    setReversing(true);
    try {
      const res = await fetch(`/api/journal-entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse' }),
      });
      if (res.ok) {
        refresh();
        setPreview(null);
      } else {
        const j = await res.json();
        alert(j.error || 'Failed to reverse');
      }
    } catch (e) { console.error(e); }
    finally { setReversing(false); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-white">
          <div className="h-16 flex items-center justify-between px-6">
            <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Journal Entries</h1>
            <p className="text-[#8E9196] text-xs">
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">
          {/* ── Filter bar ────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Select value={dateRange} onChange={setDateRange}>
              <option value="">All Time</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom</option>
            </Select>

            {dateRange === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input-field" />
                <span className="text-[#8E9196] text-sm">–</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-field" />
              </>
            )}

            <Select value={sourceFilter} onChange={setSourceFilter}>
              <option value="">All Sources</option>
              <option value="claim_approval">Claims</option>
              <option value="invoice_posting">Invoices</option>
              <option value="bank_recon">Bank Recon</option>
              <option value="manual">Manual</option>
            </Select>

            <Select value={statusFilter} onChange={setStatusFilter}>
              <option value="">All Status</option>
              <option value="posted">Posted</option>
              <option value="reversed">Reversed</option>
            </Select>

            <input
              type="text"
              placeholder="Search voucher # or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[210px]"
            />

            <button
              onClick={() => setHideReversals((v) => !v)}
              className={`px-3 py-1.5 text-body-sm font-medium rounded-lg border transition-colors ${hideReversals ? 'bg-[#191C1E] text-white border-[#191C1E]' : 'bg-white text-[#434654] border-gray-200 hover:bg-gray-50'}`}
            >
              {hideReversals ? 'Show Reversals' : 'Hide Reversals'}
            </button>
          </div>

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={entries.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Table ────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto bg-white rounded-lg">
            {loading ? (
              <div className="text-center text-sm text-[#8E9196] py-12">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center text-sm text-[#8E9196] py-12">No journal entries found.</div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('posting_date')}>Date{sortIndicator('posting_date')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('voucher_number')}>Voucher #{sortIndicator('voucher_number')}</th>
                      <th className="px-3 py-2.5">Description</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('source_type')}>Source{sortIndicator('source_type')}</th>
                      {!firmFilter && <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-3 py-2.5">Period</th>
                      <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('total_debit')}>Debit (RM){sortIndicator('total_debit')}</th>
                      <th className="px-3 py-2.5 text-right">Credit (RM)</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((e) => {
                      const sCfg = STATUS_CFG[e.status];
                      return (
                        <tr
                          key={e.id}
                          onClick={() => setPreview(e)}
                          className={`text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50 ${e.status === 'reversed' ? 'opacity-50' : ''}`}
                        >
                          <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(e.posting_date)}</td>
                          <td className="px-3 py-3 text-[#191C1E] font-medium font-mono text-xs">{e.voucher_number}</td>
                          <td className="px-3 py-3 text-[#434654] max-w-[250px] truncate">{e.description ?? '-'}</td>
                          <td className="px-3 py-3 text-[#434654]">{SOURCE_CFG[e.source_type] ?? e.source_type}</td>
                          {!firmFilter && <td className="px-3 py-3 text-[#434654]">{e.firm_name}</td>}
                          <td className="px-3 py-3 text-[#8E9196] text-xs">{e.period_label}</td>
                          <td className="px-3 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(e.total_debit)}</td>
                          <td className="px-3 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(e.total_credit)}</td>
                          <td className="px-3 py-3">{sCfg && <span className={sCfg.cls}>{sCfg.label}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                    <p className="text-body-sm text-[#8E9196]">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                      <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ═══ JOURNAL ENTRY DETAIL MODAL ═══ */}
      {preview && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
                <h2 className="text-white font-semibold text-sm">{preview.voucher_number}</h2>
                <button onClick={() => setPreview(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Meta */}
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Date</dt>
                    <dd className="text-sm text-[#191C1E] mt-0.5">{formatDate(preview.posting_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Period</dt>
                    <dd className="text-sm text-[#191C1E] mt-0.5">{preview.period_label}</dd>
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Source</dt>
                    <dd className="text-sm text-[#191C1E] mt-0.5">{SOURCE_CFG[preview.source_type] ?? preview.source_type}</dd>
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Status</dt>
                    <dd className="mt-0.5">
                      {STATUS_CFG[preview.status] && <span className={STATUS_CFG[preview.status].cls}>{STATUS_CFG[preview.status].label}</span>}
                    </dd>
                  </div>
                  {preview.description && (
                    <div className="col-span-2">
                      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Description</dt>
                      <dd className="text-sm text-[#191C1E] mt-0.5">{preview.description}</dd>
                    </div>
                  )}
                  {!firmFilter && (
                    <div>
                      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Firm</dt>
                      <dd className="text-sm text-[#191C1E] mt-0.5">{preview.firm_name}</dd>
                    </div>
                  )}
                </dl>

                {/* Reversal links */}
                {preview.reversal_of_id && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                    This is a reversal of another journal entry.
                  </div>
                )}
                {preview.reversed_by_id && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                    This entry has been reversed.
                  </div>
                )}

                {/* Lines table */}
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">
                        <th className="px-4 py-2">Account</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l) => (
                        <tr key={l.id} className="border-t border-gray-200">
                          <td className="px-4 py-2 text-sm">
                            <span className="font-mono text-xs text-[#434654]">{l.account_code}</span>
                            <span className="text-[#191C1E] ml-1.5">{l.account_name}</span>
                          </td>
                          <td className="px-3 py-2 text-sm text-[#434654]">{l.description ?? '-'}</td>
                          <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-[#191C1E]">
                            {l.debit_amount > 0 ? formatRM(l.debit_amount) : ''}
                          </td>
                          <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-[#191C1E]">
                            {l.credit_amount > 0 ? formatRM(l.credit_amount) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 font-semibold">
                        <td colSpan={2} className="px-4 py-2 text-sm text-[#191C1E]">Total</td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-[#191C1E]">{formatRM(preview.total_debit)}</td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-[#191C1E]">{formatRM(preview.total_credit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 flex-shrink-0 flex gap-3">
                {preview.status === 'posted' && (
                  <button
                    onClick={() => reverseEntry(preview.id)}
                    disabled={reversing}
                    className="btn-reject flex-1 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {reversing ? 'Reversing...' : 'Reverse Entry'}
                  </button>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
      {children}
    </select>
  );
}
