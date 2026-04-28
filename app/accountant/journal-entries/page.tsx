'use client';

import LoadMoreBanner from '@/components/LoadMoreBanner';
import { useState, useEffect, useRef } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

import { STATUS_CFG } from '@/lib/badge-config';

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

const SOURCE_CFG: Record<string, string> = {
  claim_approval:        'Claim',
  invoice_posting:       'Purchase Invoice',
  sales_invoice_posting: 'Sales Invoice',
  bank_recon:            'Bank Recon',
  manual:                'Manual',
  year_end_close:        'Year-End Close',
};

const PREFIX_LABELS: Record<string, string> = {
  PI: 'Purchase Invoice',
  SI: 'Sales Invoice',
  PV: 'Payment Voucher',
  OR: 'Official Receipt',
  CR: 'Claim Reimbursement',
  JV: 'Journal Voucher',
};

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PI: { label: 'PI', color: '#234B6E', bg: '#E3EDF6' },
  SI: { label: 'SI', color: '#0E6027', bg: '#DEF2E4' },
  PV: { label: 'PV', color: '#7C3A00', bg: '#FEF0DB' },
  OR: { label: 'OR', color: '#5C2D91', bg: '#EEDDF9' },
  CR: { label: 'CR', color: '#8B0000', bg: '#FDE8E8' },
  JV: { label: 'JV', color: '#555', bg: '#EDEDEE' },
};

function getTypeBadge(voucherNumber: string): { label: string; color: string; bg: string } {
  const prefix = voucherNumber.split('-')[0];
  return TYPE_BADGE[prefix] ?? TYPE_BADGE.JV;
}

function getEntryTypeLabel(voucherNumber: string, sourceType: string): string {
  const prefix = voucherNumber.split('-')[0];
  return PREFIX_LABELS[prefix] ?? SOURCE_CFG[sourceType] ?? sourceType;
}

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
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
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Firms
  const { firmId: firmFilter, firmsLoaded } = useFirm();

  // Filters
  const [dateRange,     setDateRange]     = useState('');
  const [customFrom,    setCustomFrom]    = useState('');
  const [customTo,      setCustomTo]      = useState('');
  const [sourceFilter,  _setSourceFilter]  = useState('');
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['PI', 'SI', 'PV', 'OR', 'CR', 'JV']));
  const toggleType = (t: string) => setActiveTypes(prev => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; });
  const [statusFilter,  setStatusFilter]  = useState('');
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
    if (takeLimit)     p.set('take',       String(takeLimit));

    fetch(`/api/journal-entries?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEntries(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmsLoaded, firmFilter, dateRange, customFrom, customTo, sourceFilter, statusFilter, refreshKey, takeLimit]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const { sorted, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(entries, 'posting_date', 'desc');
  const reversalFiltered = hideReversals ? sorted.filter((e) => !e.reversed_by_id && !e.reversal_of_id) : sorted;
  const allTypesActive = activeTypes.size === 6;
  const filtered = allTypesActive ? reversalFiltered : reversalFiltered.filter((e) => activeTypes.has(e.voucher_number.split('-')[0]));
  useEffect(() => { setPage(0); }, [sortField, sortDir, hideReversals]);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const reverseEntry = async (id: string) => {
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    setReversing(true);
    try {
      const res = await fetch(`/api/journal-entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse' }),
      });
      if (res.ok) {
        refresh();
        requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
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
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-white border-b border-[#E0E3E5]">
          <div className="h-16 flex items-center justify-between pl-14 pr-6">
            <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Journal Entries</h1>
            <div className="flex items-center gap-3">

              {(
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/journal-entries/cleanup-orphans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmId: firmFilter || undefined, dryRun: true }) });
                      if (!res.ok) { alert('Failed: ' + res.status); return; }
                      const json = await res.json();
                      const count = json.data?.orphans?.length ?? 0;
                      if (count === 0) { alert('No orphaned JVs found.'); return; }
                      const list = json.data.orphans.map((o: { voucher: string; reason: string }) => `${o.voucher}: ${o.reason}`).join('\n');
                      if (confirm(`Found ${count} orphaned JVs:\n\n${list}\n\nReverse them all?`)) {
                        const res2 = await fetch('/api/journal-entries/cleanup-orphans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmId: firmFilter || undefined, dryRun: false }) });
                        if (!res2.ok) { alert('Reversal failed: ' + res2.status); return; }
                        const json2 = await res2.json();
                        alert(json2.data?.message || 'Done');
                        const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
                        setRefreshKey(k => k + 1);
                        requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
                      }
                    } catch (err) { alert('Error: ' + (err instanceof Error ? err.message : 'Unknown')); }
                  }}
                  className="btn-thick-white text-xs px-4 py-2 font-medium"
                >
                  Cleanup Orphaned JVs
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 pt-8 px-8 pb-0 pl-14 paper-texture ledger-binding animate-in">
          {/* ── Filter bar ────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setDateRange('custom'); }} className="input-field" />
            <span className="text-[var(--text-secondary)] text-sm">–</span>
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setDateRange('custom'); }} className="input-field" />

            <div className="flex items-center gap-1.5">
              {(['PI', 'SI', 'PV', 'OR', 'CR', 'JV'] as const).map((t) => {
                const b = TYPE_BADGE[t];
                const on = activeTypes.has(t);
                return (
                  <button key={t} type="button" onClick={() => toggleType(t)}
                    className={`type-toggle-btn px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-100 btn-texture ${on ? 'type-toggle-on' : 'type-toggle-off'}`}
                    style={{ '--tt-bg': on ? b.bg : undefined, '--tt-color': on ? b.color : undefined } as React.CSSProperties}
                  >{t}</button>
                );
              })}
            </div>

            <Select value={statusFilter} onChange={setStatusFilter}>
              <option value="">All Status</option>
              <option value="posted">Posted</option>
              <option value="reversed">Reversed</option>
            </Select>

            <button
              onClick={() => setHideReversals((v) => !v)}
              className={`px-3 py-1.5 text-body-sm font-medium transition-colors ${hideReversals ? 'btn-thick-navy' : 'btn-thick-white'}`}
            >
              {hideReversals ? 'Show Reversals' : 'Hide Reversals'}
            </button>
          </div>

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={entries.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Table ────────────────────────────── */}
          <div ref={tableScrollRef} className="flex-1 min-h-0 overflow-auto bg-white">
            {loading ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-12">No journal entries found.</div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('posting_date')}>Date{sortIndicator('posting_date')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('voucher_number')}>Voucher #{sortIndicator('voucher_number')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('source_type')}>Source{sortIndicator('source_type')}</th>
                      {!firmFilter && <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Period</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right cursor-pointer select-none" onClick={() => toggleSort('total_debit')}>Debit (RM){sortIndicator('total_debit')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Credit (RM)</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((e, i) => {
                      const effectiveStatus = e.reversed_by_id ? 'reversed' : e.status;
                      const sCfg = STATUS_CFG[effectiveStatus];
                      return (
                        <tr
                          key={e.id}
                          onClick={() => setPreview(e)}
                          className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${e.reversed_by_id || e.reversal_of_id ? 'opacity-50' : ''} ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}
                        >
                          <td data-col="Date" className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(e.posting_date)}</td>
                          <td data-col="Voucher #" className="px-3 py-3 text-[var(--text-primary)] font-medium font-mono text-xs">
                            {(() => { const b = getTypeBadge(e.voucher_number); return <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 mr-1.5 align-middle font-sans" style={{ color: b.color, background: b.bg }}>{b.label}</span>; })()}
                            {e.voucher_number}
                          </td>
                          <td data-col="Description" className="px-3 py-3 text-[var(--text-secondary)] max-w-[250px] truncate">{e.description ?? '-'}</td>
                          <td data-col="Source" className="px-3 py-3 text-[var(--text-secondary)]">{getEntryTypeLabel(e.voucher_number, e.source_type)}</td>
                          {!firmFilter && <td data-col="Firm" className="px-3 py-3 text-[var(--text-secondary)]">{e.firm_name}</td>}
                          <td data-col="Period" className="px-3 py-3 text-[var(--text-secondary)] text-xs">{e.period_label}</td>
                          <td data-col="Debit (RM)" className="px-3 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{formatRM(e.total_debit)}</td>
                          <td data-col="Credit (RM)" className="px-3 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{formatRM(e.total_credit)}</td>
                          <td data-col="Status" className="px-3 py-3">{sCfg && <span className={sCfg.cls} data-tooltip={sCfg.tooltip}>{sCfg.label}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t-2 border-[var(--surface-highest)]">
                      <td className="px-5 py-3 text-xs font-label font-bold uppercase tracking-widest text-[var(--text-secondary)] bg-[var(--surface-header)]">
                        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                      </td>
                      <td className="bg-[var(--surface-header)]" />
                      <td className="bg-[var(--surface-header)]" />
                      <td className="bg-[var(--surface-header)]" />
                      {!firmFilter && <td className="bg-[var(--surface-header)]" />}
                      <td className="bg-[var(--surface-header)]" />
                      <td className="px-3 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums text-sm bg-[var(--surface-header)]">
                        {formatRM(filtered.reduce((sum, e) => sum + e.total_debit, 0))}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums text-sm bg-[var(--surface-header)]">
                        {formatRM(filtered.reduce((sum, e) => sum + e.total_credit, 0))}
                      </td>
                      <td className="bg-[var(--surface-header)]" />
                    </tr>
                  </tfoot>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 bg-[var(--surface-low)]">
                    <p className="text-body-sm text-[var(--text-secondary)]">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                      <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
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
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
            <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">{preview.voucher_number}</h2>
                <button onClick={() => setPreview(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Meta */}
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt>
                    <dd className="text-sm text-[var(--text-primary)] mt-0.5 tabular-nums">{formatDate(preview.posting_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Period</dt>
                    <dd className="text-sm text-[var(--text-primary)] mt-0.5">{preview.period_label}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Source</dt>
                    <dd className="text-sm text-[var(--text-primary)] mt-0.5">{getEntryTypeLabel(preview.voucher_number, preview.source_type)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Status</dt>
                    <dd className="mt-0.5">
                      {STATUS_CFG[preview.status] && <span className={STATUS_CFG[preview.status].cls} data-tooltip={STATUS_CFG[preview.status].tooltip}>{STATUS_CFG[preview.status].label}</span>}
                    </dd>
                  </div>
                  {preview.description && (
                    <div className="col-span-2">
                      <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description</dt>
                      <dd className="text-sm text-[var(--text-primary)] mt-0.5">{preview.description}</dd>
                    </div>
                  )}
                  {!firmFilter && (
                    <div>
                      <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Firm</dt>
                      <dd className="text-sm text-[var(--text-primary)] mt-0.5">{preview.firm_name}</dd>
                    </div>
                  )}
                </dl>

                {/* Reversal links */}
                {preview.reversal_of_id && (
                  <div className="bg-[var(--error-container)] px-3 py-2 text-sm text-[var(--on-error-container)]">
                    This is a reversal of another journal entry.
                  </div>
                )}
                {preview.reversed_by_id && (
                  <div className="bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    This entry has been reversed.
                  </div>
                )}

                {/* Lines table */}
                <div className="bg-[var(--surface-low)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Debit</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l, i) => (
                        <tr key={l.id} className={i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}>
                          <td className="px-4 py-2 text-sm">
                            <span className="font-mono text-xs text-[var(--text-secondary)]">{l.account_code}</span>
                            <span className="text-[var(--text-primary)] ml-1.5">{l.account_name}</span>
                          </td>
                          <td className="px-3 py-2 text-sm text-[var(--text-secondary)]">{l.description ?? '-'}</td>
                          <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-[var(--text-primary)]">
                            {l.debit_amount > 0 ? formatRM(l.debit_amount) : ''}
                          </td>
                          <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-[var(--text-primary)]">
                            {l.credit_amount > 0 ? formatRM(l.credit_amount) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--text-secondary)]/20 font-semibold">
                        <td colSpan={2} className="px-4 py-2 text-sm text-[var(--text-primary)]">Total</td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-[var(--text-primary)]">{formatRM(preview.total_debit)}</td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-[var(--text-primary)]">{formatRM(preview.total_credit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 flex-shrink-0 flex gap-3 bg-[var(--surface-low)]">
                {preview.status === 'posted' && (
                  <button
                    onClick={() => reverseEntry(preview.id)}
                    disabled={reversing}
                    className="btn-thick-red flex-1 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {reversing ? 'Reversing...' : 'Reverse Entry'}
                  </button>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </>
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
