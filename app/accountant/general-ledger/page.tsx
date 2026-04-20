'use client';

import React, { useState, useEffect } from 'react';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';
import SearchButton from '@/components/SearchButton';

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
  status: string;
  reversal_of_id: string | null;
  entry_description: string | null;
  line_description: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
}

interface DrilldownData {
  account: { id: string; account_code: string; name: string; account_type: string; normal_balance: string };
  lines: DrilldownLine[];
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  balance: number;
}

interface PeriodOption { id: string; label: string; }
interface FiscalYear { id: string; year_label: string; periods: { id: string; period_number: number; start_date: string; end_date: string }[]; }

// ─── Helpers ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  claim_approval: 'Claim', invoice_posting: 'Invoice',
  sales_invoice_posting: 'Sales Inv', bank_recon: 'Bank Recon', manual: 'Manual',
  year_end_close: 'Year-End Close',
};

function formatRM(val: string | number) {
  const num = Number(val);
  const abs = Math.abs(num).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `(RM ${abs})` : `RM ${abs}`;
}

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">{children}</select>;
}

// Build hierarchical tree: parent accounts contain children
interface AccountNode {
  account: GLAccountRow;
  children: GLAccountRow[];
  totalDebit: number;
  totalCredit: number;
  totalBalance: number;
}

function buildTree(accounts: GLAccountRow[], hideZero: boolean): AccountNode[] {
  const parentMap = new Map<string, GLAccountRow>();
  const childrenMap = new Map<string, GLAccountRow[]>();

  // Separate parents and children
  for (const a of accounts) {
    if (!a.parent_id) {
      parentMap.set(a.id, a);
      if (!childrenMap.has(a.id)) childrenMap.set(a.id, []);
    }
  }
  for (const a of accounts) {
    if (a.parent_id && parentMap.has(a.parent_id)) {
      childrenMap.get(a.parent_id)!.push(a);
    } else if (a.parent_id && !parentMap.has(a.parent_id)) {
      // Orphan child - treat as top-level
      parentMap.set(a.id, a);
      if (!childrenMap.has(a.id)) childrenMap.set(a.id, []);
    }
  }

  const nodes: AccountNode[] = [];
  for (const [parentId, parent] of Array.from(parentMap.entries())) {
    const children = childrenMap.get(parentId) ?? [];
    const allAccounts = [parent, ...children];
    const totalDebit = allAccounts.reduce((s, a) => s + a.total_debit, 0);
    const totalCredit = allAccounts.reduce((s, a) => s + a.total_credit, 0);
    const totalBalance = allAccounts.reduce((s, a) => s + a.balance, 0);

    if (hideZero && totalDebit === 0 && totalCredit === 0) continue;

    const filteredChildren = hideZero
      ? children.filter(c => c.total_debit !== 0 || c.total_credit !== 0)
      : children;

    nodes.push({ account: parent, children: filteredChildren, totalDebit, totalCredit, totalBalance });
  }

  // Sort by account_code
  nodes.sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));
  return nodes;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function GeneralLedgerPage() {
  usePageTitle('General Ledger');

  const { firmId: firmFilter, firmsLoaded } = useFirm();
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
  const [hideReversals, setHideReversals] = useState(false);

  // Load fiscal years when firm changes
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmFilter) { setFiscalYears([]); return; }
    fetch(`/api/fiscal-years?firmId=${firmFilter}`).then(r => r.json())
      .then(j => setFiscalYears(j.data ?? []))
      .catch(console.error);
  }, [firmsLoaded, firmFilter]);

  // Load general ledger data
  useEffect(() => {
    if (!firmsLoaded) return;
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
  }, [firmsLoaded, firmFilter, periodFilter, dateRange, customFrom, customTo]);

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

  // Build hierarchical tree
  const tree = buildTree(accounts, hideZero);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Period options
  const periodOptions: PeriodOption[] = fiscalYears.flatMap(fy =>
    fy.periods.map(p => ({ id: p.id, label: `${fy.year_label} P${p.period_number}` }))
  );

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">General Ledger</h1>
          <SearchButton />
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
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
                    <span className="text-[var(--text-muted)] text-sm">--</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-field" />
                  </>
                )}
              </>
            )}

            <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
              <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="accent-[var(--primary)]" />
              Hide zero-balance
            </label>
          </div>

          {/* ── Summary strip ── */}
          {summary && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="bg-white card-popped px-4 py-2">
                <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Debit</span>
                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{formatRM(summary.total_debit)}</p>
              </div>
              <div className="bg-white card-popped px-4 py-2">
                <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Credit</span>
                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{formatRM(summary.total_credit)}</p>
              </div>
              {Math.abs(summary.total_debit - summary.total_credit) > 0.01 && (
                <div className="bg-[var(--error-container)] px-4 py-2" style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                  <span className="text-[10px] font-label font-bold uppercase tracking-widest text-[var(--on-error-container)]">Out of balance by {formatRM(Math.abs(summary.total_debit - summary.total_credit))}</span>
                </div>
              )}
              {Math.abs(summary.total_debit - summary.total_credit) <= 0.01 && (
                <div className="bg-[var(--secondary-container)] px-4 py-2" style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                  <span className="text-[10px] font-label font-bold uppercase tracking-widest text-[var(--on-secondary-container)]">Balanced</span>
                </div>
              )}
            </div>
          )}

          {/* ── Content ── */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {!firmFilter ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Select a firm to view the General Ledger.</div>
            ) : loading ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Loading...</div>
            ) : tree.length === 0 ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">No accounts with activity found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account</th>
                    <th className="px-3 py-2.5 text-right w-[140px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Debit</th>
                    <th className="px-3 py-2.5 text-right w-[140px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Credit</th>
                    <th className="px-3 py-2.5 text-right w-[160px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.map((node, ni) => {
                    const isCollapsed = collapsed.has(node.account.id);
                    const hasChildren = node.children.length > 0;
                    return (
                      <React.Fragment key={node.account.id}>
                        {/* ── Parent row ── */}
                        <tr
                          className={`${ni % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} cursor-pointer hover:bg-[var(--surface-header)] transition-colors`}
                          onClick={() => hasChildren ? toggleCollapse(node.account.id) : openDrilldown(node.account.id)}
                        >
                          <td data-col="Account" className="px-5 py-2.5 font-semibold text-[var(--text-primary)]">
                            <div className="flex items-center gap-2">
                              {hasChildren ? (
                                <span className="w-4 h-4 flex items-center justify-center text-[var(--text-muted)] text-xs flex-shrink-0">
                                  {isCollapsed ? '\u25B6' : '\u25BC'}
                                </span>
                              ) : (
                                <span className="w-4 flex-shrink-0" />
                              )}
                              {node.account.account_code} - {node.account.name}
                            </div>
                          </td>
                          <td data-col="Debit" className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                            {!hasChildren && node.account.total_debit > 0 ? formatRM(node.account.total_debit) : ''}
                          </td>
                          <td data-col="Credit" className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                            {!hasChildren && node.account.total_credit > 0 ? formatRM(node.account.total_credit) : ''}
                          </td>
                          <td data-col="Balance" className={`px-3 py-2.5 text-right tabular-nums font-semibold ${hasChildren ? '' : node.totalBalance < 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
                            {!hasChildren ? formatRM(node.totalBalance) : ''}
                          </td>
                        </tr>

                        {/* ── Child rows ── */}
                        {hasChildren && !isCollapsed && node.children.map((child, ci) => (
                          <tr
                            key={child.id}
                            className={`${ci % 2 === 0 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] cursor-pointer transition-colors`}
                            onClick={() => openDrilldown(child.id)}
                          >
                            <td data-col="Account" className="py-2.5 text-[var(--text-secondary)]">
                              <div className="flex items-center gap-2 pl-11">
                                <span className="w-3 h-3 flex items-center justify-center text-[var(--outline)] text-[10px] flex-shrink-0">{'\u25FB'}</span>
                                {child.account_code} - {child.name}
                              </div>
                            </td>
                            <td data-col="Debit" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                              {child.total_debit > 0 ? formatRM(child.total_debit) : ''}
                            </td>
                            <td data-col="Credit" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                              {child.total_credit > 0 ? formatRM(child.total_credit) : ''}
                            </td>
                            <td data-col="Balance" className={`px-3 py-2.5 text-right tabular-nums ${child.balance < 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
                              {formatRM(child.balance)}
                            </td>
                          </tr>
                        ))}

                        {/* ── Total row ── */}
                        {hasChildren && !isCollapsed && (
                          <tr className="bg-[var(--surface-base)]">
                            <td data-col="Account" className="px-5 py-2 text-[var(--text-secondary)] font-semibold text-xs">
                              <div className="pl-6">Total - {node.account.account_code} - {node.account.name}</div>
                            </td>
                            <td data-col="Debit" className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                              {node.totalDebit > 0 ? formatRM(node.totalDebit) : ''}
                            </td>
                            <td data-col="Credit" className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                              {node.totalCredit > 0 ? formatRM(node.totalCredit) : ''}
                            </td>
                            <td data-col="Balance" className={`px-3 py-2 text-right tabular-nums font-semibold text-xs ${node.totalBalance < 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
                              {formatRM(node.totalBalance)}
                            </td>
                          </tr>
                        )}

                        {/* ── Collapsed total row ── */}
                        {hasChildren && isCollapsed && (
                          <tr className="bg-[var(--surface-base)]">
                            <td data-col="Account" className="px-5 py-2 text-[var(--text-secondary)] font-semibold text-xs">
                              <div className="pl-6">Total - {node.account.account_code} - {node.account.name}</div>
                            </td>
                            <td data-col="Debit" className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                              {node.totalDebit > 0 ? formatRM(node.totalDebit) : ''}
                            </td>
                            <td data-col="Credit" className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                              {node.totalCredit > 0 ? formatRM(node.totalCredit) : ''}
                            </td>
                            <td data-col="Balance" className={`px-3 py-2 text-right tabular-nums font-semibold text-xs ${node.totalBalance < 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
                              {formatRM(node.totalBalance)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* ═══ DRILL-DOWN MODAL ═══ */}
      {(drilldown || drilldownLoading) && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => { setDrilldown(null); setDrilldownLoading(false); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { setDrilldown(null); setDrilldownLoading(false); }}>
            <div className="bg-white shadow-2xl w-full max-w-[860px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
                <h2 className="text-white font-semibold text-sm">
                  {drilldown ? `${drilldown.account.account_code} — ${drilldown.account.name}` : 'Loading...'}
                </h2>
                <button onClick={() => { setDrilldown(null); setDrilldownLoading(false); }} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              {drilldownLoading && !drilldown ? (
                <div className="flex-1 flex items-center justify-center py-12 text-sm text-[var(--text-muted)]">Loading...</div>
              ) : drilldown && (
                <>
                  {/* Toggle + Mini T-account summary */}
                  <div className="px-5 pt-3 flex justify-end">
                    <button
                      onClick={() => setHideReversals((v) => !v)}
                      className={`btn-thick-navy px-3 py-1 text-xs font-medium ${hideReversals ? '' : 'btn-thick-white'}`}
                    >
                      {hideReversals ? 'Show Reversals' : 'Hide Reversals'}
                    </button>
                  </div>
                  <div className="px-5 pt-2 pb-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[var(--surface-low)] p-3 text-center">
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Debit</p>
                        <p className="text-base font-bold text-[var(--text-primary)] tabular-nums mt-0.5">{formatRM(drilldown.total_debit)}</p>
                      </div>
                      <div className="bg-[var(--surface-low)] p-3 text-center">
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Credit</p>
                        <p className="text-base font-bold text-[var(--text-primary)] tabular-nums mt-0.5">{formatRM(drilldown.total_credit)}</p>
                      </div>
                      <div className={`p-3 text-center ${drilldown.balance >= 0 ? 'bg-[var(--secondary-container)]' : 'bg-[var(--error-container)]'}`}>
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Balance</p>
                        <p className={`text-base font-bold tabular-nums mt-0.5 ${drilldown.balance >= 0 ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                          {formatRM(Math.abs(drilldown.balance))} {drilldown.balance >= 0 ? (drilldown.account.normal_balance === 'Debit' ? 'Dr' : 'Cr') : (drilldown.account.normal_balance === 'Debit' ? 'Cr' : 'Dr')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lines table */}
                  <div className="flex-1 overflow-y-auto px-5 pb-2">
                    {(() => {
                      const visibleLines = hideReversals
                        ? drilldown.lines.filter((l) => l.status !== 'reversed' && !l.reversal_of_id)
                        : drilldown.lines;

                      // Recompute running balance for filtered lines (seeded from opening balance)
                      const isDebitNormal = drilldown.account.normal_balance === 'Debit';
                      let runBal = drilldown.opening_balance ?? 0;
                      const linesWithBalance = visibleLines.map((l) => {
                        runBal += isDebitNormal ? (l.debit_amount - l.credit_amount) : (l.credit_amount - l.debit_amount);
                        return { ...l, running_balance: runBal };
                      });
                      const filteredDebit = visibleLines.reduce((s, l) => s + l.debit_amount, 0);
                      const filteredCredit = visibleLines.reduce((s, l) => s + l.credit_amount, 0);
                      const filteredBalance = isDebitNormal ? filteredDebit - filteredCredit : filteredCredit - filteredDebit;

                      if (linesWithBalance.length === 0) {
                        return <div className="text-center py-8 text-sm text-[var(--text-muted)]">No journal lines for this account in the selected period.</div>;
                      }

                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left">
                              <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date</th>
                              <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Voucher #</th>
                              <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                              <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Source</th>
                              <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Debit</th>
                              <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Credit</th>
                              <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(drilldown.opening_balance ?? 0) !== 0 && (
                              <tr className="bg-[var(--surface-base)]">
                                <td className="px-3 py-2 text-[var(--text-muted)] italic" colSpan={1}></td>
                                <td className="px-3 py-2 text-[var(--text-muted)] italic" colSpan={1}></td>
                                <td className="px-3 py-2 text-[var(--text-secondary)] font-medium italic">Balance B/F</td>
                                <td className="px-3 py-2 text-[var(--text-muted)] italic text-xs">----</td>
                                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]"></td>
                                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]"></td>
                                <td className={`px-3 py-2 text-right tabular-nums font-medium ${(drilldown.opening_balance ?? 0) >= 0 ? 'text-[var(--match-green)]' : 'text-[var(--reject-red)]'}`}>
                                  {formatRM(Math.abs(drilldown.opening_balance))}
                                </td>
                              </tr>
                            )}
                            {linesWithBalance.map((line, li) => (
                              <tr key={line.id} className={`hover:bg-[var(--surface-header)] transition-colors ${li % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} ${line.reversal_of_id ? 'opacity-50' : ''}`}>
                                <td data-col="Date" className="px-3 py-2 text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{formatDate(line.posting_date)}</td>
                                <td data-col="Voucher #" className="px-3 py-2 text-[var(--text-secondary)] font-mono text-xs">{line.voucher_number}</td>
                                <td data-col="Description" className="px-3 py-2 text-[var(--text-secondary)] truncate max-w-[200px]">{line.line_description || line.entry_description || '-'}</td>
                                <td data-col="Source" className="px-3 py-2 text-[var(--text-muted)] text-xs">{SOURCE_LABELS[line.source_type] ?? line.source_type}</td>
                                <td data-col="Debit" className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{line.debit_amount > 0 ? formatRM(line.debit_amount) : '-'}</td>
                                <td data-col="Credit" className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{line.credit_amount > 0 ? formatRM(line.credit_amount) : '-'}</td>
                                <td data-col="Balance" className={`px-3 py-2 text-right tabular-nums font-medium ${line.running_balance >= 0 ? 'text-[var(--match-green)]' : 'text-[var(--reject-red)]'}`}>
                                  {formatRM(Math.abs(line.running_balance))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-[var(--surface-highest)] font-semibold">
                              <td colSpan={4} className="px-3 py-2 text-[var(--text-primary)]">Total</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{formatRM(filteredDebit)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{formatRM(filteredCredit)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-bold ${filteredBalance >= 0 ? 'text-[var(--match-green)]' : 'text-[var(--reject-red)]'}`}>
                                {formatRM(Math.abs(filteredBalance))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="p-4 flex-shrink-0 bg-[var(--surface-low)]">
                    <button onClick={() => setDrilldown(null)} className="btn-thick-white w-full py-2 text-sm font-semibold">
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
