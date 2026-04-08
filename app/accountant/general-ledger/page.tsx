'use client';

import Sidebar from '@/components/Sidebar';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GLAccountRow {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_id: string | null;
  is_active: boolean;
  total_debit: number;
  total_credit: number;
  balance: number;
}

interface DrilldownLine {
  id: string;
  voucher_number: string;
  posting_date: string;
  source_type: string;
  entry_description: string | null;
  line_description: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
}

interface DrilldownData {
  account: { id: string; account_code: string; name: string; account_type: string; normal_balance: string };
  lines: DrilldownLine[];
  total_debit: number;
  total_credit: number;
  balance: number;
}

interface FirmOption { id: string; name: string; }
interface PeriodOption { id: string; label: string; }
interface FiscalYear { id: string; year_label: string; periods: { id: string; period_number: number }[]; }

// ─── Helpers ────────────────────────────────────────────────────────────────

const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const TYPE_BADGES: Record<string, string> = {
  Asset: 'badge-blue', Liability: 'badge-amber', Equity: 'badge-purple',
  Revenue: 'badge-green', Expense: 'badge-red',
};

const SOURCE_LABELS: Record<string, string> = {
  claim_approval: 'Claim', invoice_posting: 'Invoice',
  sales_invoice_posting: 'Sales Inv', bank_recon: 'Bank Recon', manual: 'Manual',
};

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">{children}</select>;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function GeneralLedgerPage() {
  usePageTitle('General Ledger');

  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmFilter, setFirmFilter] = useState('');
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periodFilter, setPeriodFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hideZero, setHideZero] = useState(true);

  const [accounts, setAccounts] = useState<GLAccountRow[]>([]);
  const [summary, setSummary] = useState<{ total_debit: number; total_credit: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const [drilldown, setDrilldown] = useState<DrilldownData | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Load firms
  useEffect(() => {
    fetch('/api/firms/details').then(r => r.json())
      .then(j => {
        const list = (j.data ?? []).map((f: FirmOption) => ({ id: f.id, name: f.name }));
        setFirms(list);
        if (list.length === 1) setFirmFilter(list[0].id);
      }).catch(console.error);
  }, []);

  // Load fiscal years when firm changes
  useEffect(() => {
    if (!firmFilter) { setFiscalYears([]); return; }
    fetch(`/api/fiscal-years?firmId=${firmFilter}`).then(r => r.json())
      .then(j => setFiscalYears(j.data ?? []))
      .catch(console.error);
  }, [firmFilter]);

  // Load general ledger data
  useEffect(() => {
    if (!firmFilter) { setAccounts([]); setSummary(null); return; }
    setLoading(true);
    const p = new URLSearchParams({ firmId: firmFilter });
    if (periodFilter) p.set('periodId', periodFilter);

    // Date range
    if (!periodFilter) {
      const now = new Date();
      if (dateRange === 'this_month') {
        p.set('dateFrom', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      } else if (dateRange === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        p.set('dateFrom', lm.toISOString().split('T')[0]);
        p.set('dateTo', lmEnd.toISOString().split('T')[0]);
      } else if (dateRange === 'custom') {
        if (customFrom) p.set('dateFrom', customFrom);
        if (customTo) p.set('dateTo', customTo);
      }
    }

    fetch(`/api/general-ledger?${p}`).then(r => r.json())
      .then(j => {
        setAccounts(j.data?.accounts ?? []);
        setSummary(j.data?.summary ?? null);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [firmFilter, periodFilter, dateRange, customFrom, customTo]);

  // Open drill-down
  const openDrilldown = async (accountId: string) => {
    setDrilldownLoading(true);
    const p = new URLSearchParams({ firmId: firmFilter });
    if (periodFilter) p.set('periodId', periodFilter);
    if (!periodFilter) {
      const now = new Date();
      if (dateRange === 'this_month') {
        p.set('dateFrom', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      } else if (dateRange === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        p.set('dateFrom', lm.toISOString().split('T')[0]);
        p.set('dateTo', lmEnd.toISOString().split('T')[0]);
      } else if (dateRange === 'custom') {
        if (customFrom) p.set('dateFrom', customFrom);
        if (customTo) p.set('dateTo', customTo);
      }
    }
    try {
      const res = await fetch(`/api/general-ledger/${accountId}?${p}`);
      const j = await res.json();
      setDrilldown(j.data ?? null);
    } catch (e) { console.error(e); }
    finally { setDrilldownLoading(false); }
  };

  // Group accounts by type, filtering zero-balance if needed
  const displayAccounts = hideZero
    ? accounts.filter(a => a.total_debit !== 0 || a.total_credit !== 0)
    : accounts;

  const grouped = TYPE_ORDER.map(type => ({
    type,
    accounts: displayAccounts.filter(a => a.account_type === type),
    totalDebit: displayAccounts.filter(a => a.account_type === type).reduce((s, a) => s + a.total_debit, 0),
    totalCredit: displayAccounts.filter(a => a.account_type === type).reduce((s, a) => s + a.total_credit, 0),
  })).filter(g => g.accounts.length > 0);

  // Period options
  const periodOptions: PeriodOption[] = fiscalYears.flatMap(fy =>
    fy.periods.map(p => ({ id: p.id, label: `${fy.year_label} P${p.period_number}` }))
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="accountant" />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <h1 className="text-[22px] font-bold text-[#191C1E] tracking-tight">General Ledger</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 px-6 pb-6 animate-in">

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <Select value={firmFilter} onChange={setFirmFilter}>
                <option value="">Select Firm</option>
                {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            )}

            {periodOptions.length > 0 && (
              <Select value={periodFilter} onChange={(v) => { setPeriodFilter(v); if (v) setDateRange(''); }}>
                <option value="">All Periods</option>
                {periodOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            )}

            {!periodFilter && (
              <>
                <Select value={dateRange} onChange={(v) => { setDateRange(v); if (v) setPeriodFilter(''); }}>
                  <option value="">All Time</option>
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
              </>
            )}

            <label className="flex items-center gap-1.5 text-sm text-[#434654] cursor-pointer select-none">
              <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="accent-blue-600" />
              Hide zero-balance
            </label>
          </div>

          {/* ── Summary strip ── */}
          {summary && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="bg-white rounded-lg px-4 py-2 border border-gray-100">
                <span className="text-label-sm text-[#8E9196] uppercase tracking-wide">Total Debit</span>
                <p className="text-sm font-bold text-[#191C1E] tabular-nums">{formatRM(summary.total_debit)}</p>
              </div>
              <div className="bg-white rounded-lg px-4 py-2 border border-gray-100">
                <span className="text-label-sm text-[#8E9196] uppercase tracking-wide">Total Credit</span>
                <p className="text-sm font-bold text-[#191C1E] tabular-nums">{formatRM(summary.total_credit)}</p>
              </div>
              {Math.abs(summary.total_debit - summary.total_credit) > 0.01 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <span className="text-label-sm text-red-600 font-semibold">Out of balance by {formatRM(Math.abs(summary.total_debit - summary.total_credit))}</span>
                </div>
              )}
              {Math.abs(summary.total_debit - summary.total_credit) <= 0.01 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <span className="text-label-sm text-green-700 font-semibold">Balanced</span>
                </div>
              )}
            </div>
          )}

          {/* ── Content ── */}
          <div className="flex-1 min-h-0 overflow-auto">
            {!firmFilter ? (
              <div className="text-center py-12 text-sm text-[#8E9196]">Select a firm to view the General Ledger.</div>
            ) : loading ? (
              <div className="text-center py-12 text-sm text-[#8E9196]">Loading...</div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-12 text-sm text-[#8E9196]">No accounts with activity found.</div>
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <section key={group.type}>
                    {/* Section header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-[#191C1E]">{group.type}</h2>
                        <span className={TYPE_BADGES[group.type]}>{group.accounts.length}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[#8E9196] tabular-nums">
                        <span>DR: <strong className="text-[#191C1E]">{formatRM(group.totalDebit)}</strong></span>
                        <span>CR: <strong className="text-[#191C1E]">{formatRM(group.totalCredit)}</strong></span>
                      </div>
                    </div>

                    {/* T-account cards grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.accounts.map((a) => (
                        <div
                          key={a.id}
                          onClick={() => openDrilldown(a.id)}
                          className="bg-white rounded-lg border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer overflow-hidden"
                        >
                          {/* Account header */}
                          <div className="px-3 py-2 border-b border-gray-50 flex items-center justify-between">
                            <div className="min-w-0">
                              <span className="font-mono text-xs text-[#8E9196]">{a.account_code}</span>
                              <p className="text-sm font-medium text-[#191C1E] truncate">{a.name}</p>
                            </div>
                          </div>

                          {/* T-account body */}
                          <div className="grid grid-cols-2 divide-x divide-gray-100">
                            <div className="px-3 py-2 text-center">
                              <p className="text-[10px] font-medium text-[#8E9196] uppercase tracking-wide">Debit</p>
                              <p className="text-sm font-semibold text-[#191C1E] tabular-nums mt-0.5">{formatRM(a.total_debit)}</p>
                            </div>
                            <div className="px-3 py-2 text-center">
                              <p className="text-[10px] font-medium text-[#8E9196] uppercase tracking-wide">Credit</p>
                              <p className="text-sm font-semibold text-[#191C1E] tabular-nums mt-0.5">{formatRM(a.total_credit)}</p>
                            </div>
                          </div>

                          {/* Balance footer */}
                          <div className={`px-3 py-1.5 text-center text-sm font-bold tabular-nums ${a.balance >= 0 ? 'bg-green-50/60 text-green-700' : 'bg-red-50/60 text-red-700'}`}>
                            {formatRM(Math.abs(a.balance))} {a.balance >= 0 ? (a.normal_balance === 'Debit' ? 'Dr' : 'Cr') : (a.normal_balance === 'Debit' ? 'Cr' : 'Dr')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ═══ DRILL-DOWN MODAL ═══ */}
      {(drilldown || drilldownLoading) && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => { setDrilldown(null); setDrilldownLoading(false); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { setDrilldown(null); setDrilldownLoading(false); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[860px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
                <h2 className="text-white font-semibold text-sm">
                  {drilldown ? `${drilldown.account.account_code} — ${drilldown.account.name}` : 'Loading...'}
                </h2>
                <button onClick={() => { setDrilldown(null); setDrilldownLoading(false); }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>

              {drilldownLoading && !drilldown ? (
                <div className="flex-1 flex items-center justify-center py-12 text-sm text-[#8E9196]">Loading...</div>
              ) : drilldown && (
                <>
                  {/* Mini T-account summary */}
                  <div className="px-5 pt-4 pb-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[10px] font-medium text-[#8E9196] uppercase tracking-wide">Total Debit</p>
                        <p className="text-base font-bold text-[#191C1E] tabular-nums mt-0.5">{formatRM(drilldown.total_debit)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[10px] font-medium text-[#8E9196] uppercase tracking-wide">Total Credit</p>
                        <p className="text-base font-bold text-[#191C1E] tabular-nums mt-0.5">{formatRM(drilldown.total_credit)}</p>
                      </div>
                      <div className={`rounded-lg p-3 text-center ${drilldown.balance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className="text-[10px] font-medium text-[#8E9196] uppercase tracking-wide">Balance</p>
                        <p className={`text-base font-bold tabular-nums mt-0.5 ${drilldown.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatRM(Math.abs(drilldown.balance))} {drilldown.balance >= 0 ? (drilldown.account.normal_balance === 'Debit' ? 'Dr' : 'Cr') : (drilldown.account.normal_balance === 'Debit' ? 'Cr' : 'Dr')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lines table */}
                  <div className="flex-1 overflow-y-auto px-5 pb-2">
                    {drilldown.lines.length === 0 ? (
                      <div className="text-center py-8 text-sm text-[#8E9196]">No journal lines for this account in the selected period.</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="ds-table-header text-left">
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Voucher #</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-3 py-2 text-right">Debit</th>
                            <th className="px-3 py-2 text-right">Credit</th>
                            <th className="px-3 py-2 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drilldown.lines.map((line) => (
                            <tr key={line.id} className="hover:bg-[#F2F4F6] transition-colors border-b border-gray-50">
                              <td className="px-3 py-2 text-[#434654] tabular-nums whitespace-nowrap">{formatDate(line.posting_date)}</td>
                              <td className="px-3 py-2 text-[#434654] font-mono text-xs">{line.voucher_number}</td>
                              <td className="px-3 py-2 text-[#434654] truncate max-w-[200px]">{line.line_description || line.entry_description || '-'}</td>
                              <td className="px-3 py-2 text-[#8E9196] text-xs">{SOURCE_LABELS[line.source_type] ?? line.source_type}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#191C1E]">{line.debit_amount > 0 ? formatRM(line.debit_amount) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#191C1E]">{line.credit_amount > 0 ? formatRM(line.credit_amount) : '-'}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-medium ${line.running_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {formatRM(Math.abs(line.running_balance))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 font-semibold">
                            <td colSpan={4} className="px-3 py-2 text-[#191C1E]">Total</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#191C1E]">{formatRM(drilldown.total_debit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#191C1E]">{formatRM(drilldown.total_credit)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-bold ${drilldown.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {formatRM(Math.abs(drilldown.balance))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-4 flex-shrink-0 border-t">
                    <button onClick={() => setDrilldown(null)} className="w-full py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
