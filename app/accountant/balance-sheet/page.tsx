'use client';

import Sidebar from '@/components/Sidebar';
import React, { useState, useEffect } from 'react';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

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

interface PeriodOption { id: string; label: string; endDate: string; }
interface FiscalYear { id: string; year_label: string; periods: { id: string; period_number: number; start_date: string; end_date: string }[]; }

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRM(val: string | number) {
  const num = Number(val);
  const abs = Math.abs(num).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `(RM ${abs})` : `RM ${abs}`;
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">{children}</select>;
}

interface AccountNode {
  account: GLAccountRow;
  children: GLAccountRow[];
  totalAmount: number;
}

function buildSection(accounts: GLAccountRow[], type: string): { nodes: AccountNode[]; sectionTotal: number } {
  const typeAccounts = accounts.filter(a => a.account_type === type);
  const parentMap = new Map<string, GLAccountRow>();
  const childrenMap = new Map<string, GLAccountRow[]>();

  for (const a of typeAccounts) {
    if (!a.parent_id) {
      parentMap.set(a.id, a);
      if (!childrenMap.has(a.id)) childrenMap.set(a.id, []);
    }
  }
  for (const a of typeAccounts) {
    if (a.parent_id && parentMap.has(a.parent_id)) {
      childrenMap.get(a.parent_id)!.push(a);
    } else if (a.parent_id && !parentMap.has(a.parent_id)) {
      parentMap.set(a.id, a);
      if (!childrenMap.has(a.id)) childrenMap.set(a.id, []);
    }
  }

  const nodes: AccountNode[] = [];
  let sectionTotal = 0;

  Array.from(parentMap.entries()).forEach(([parentId, parent]) => {
    const children = childrenMap.get(parentId) ?? [];
    const allAccounts = [parent, ...children];
    const totalAmount = allAccounts.reduce((s, a) => s + a.balance, 0);

    if (allAccounts.every(a => a.total_debit === 0 && a.total_credit === 0)) return;

    const filteredChildren = children.filter(c => c.total_debit !== 0 || c.total_credit !== 0);
    nodes.push({ account: parent, children: filteredChildren, totalAmount });
    sectionTotal += totalAmount;
  });

  nodes.sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));
  return { nodes, sectionTotal };
}

function calcNetIncome(accounts: GLAccountRow[]): number {
  const totalRevenue = accounts.filter(a => a.account_type === 'Revenue').reduce((s, a) => s + a.balance, 0);
  const totalExpense = accounts.filter(a => a.account_type === 'Expense').reduce((s, a) => s + a.balance, 0);
  return totalRevenue - totalExpense;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  usePageTitle('Balance Sheet');

  const { firmId: firmFilter, firmsLoaded } = useFirm();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periodFilter, setPeriodFilter] = useState('');
  const [asOfDate, setAsOfDate] = useState('');

  const [accounts, setAccounts] = useState<GLAccountRow[]>([]);
  const [periodAccounts, setPeriodAccounts] = useState<GLAccountRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Load fiscal years
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmFilter) { setFiscalYears([]); return; }
    fetch(`/api/fiscal-years?firmId=${firmFilter}`).then(r => r.json())
      .then(j => setFiscalYears(j.data ?? []))
      .catch(console.error);
  }, [firmsLoaded, firmFilter]);

  // Period options with end dates
  const periodOptions: PeriodOption[] = fiscalYears.flatMap(fy =>
    fy.periods.map(p => ({
      id: p.id,
      label: `${fy.year_label} P${p.period_number}`,
      endDate: p.end_date.split('T')[0],
    }))
  );

  // Load GL data
  // Balance Sheet = always cumulative. When a period is selected:
  //   1. Cumulative fetch (dateTo = period end) -> for BS account balances
  //   2. Period-only fetch (periodId) -> for current period Revenue/Expense
  // Dynamic retained earnings = cumulative net income - current period net income
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmFilter) { setAccounts([]); setPeriodAccounts(null); return; }
    setLoading(true);

    const selectedPeriod = periodOptions.find(p => p.id === periodFilter);

    // Cumulative fetch -- always from beginning of time
    const cumParams = new URLSearchParams({ firmId: firmFilter });
    if (selectedPeriod) {
      cumParams.set('dateTo', selectedPeriod.endDate);
    } else if (asOfDate) {
      cumParams.set('dateTo', asOfDate);
    }

    const cumFetch = fetch(`/api/general-ledger?${cumParams}`).then(r => r.json());

    // Period-only fetch -- only when a period is selected
    let periodFetch: Promise<{ data?: { accounts?: GLAccountRow[] } }> | null = null;
    if (periodFilter) {
      const periodParams = new URLSearchParams({ firmId: firmFilter, periodId: periodFilter });
      periodFetch = fetch(`/api/general-ledger?${periodParams}`).then(r => r.json());
    }

    Promise.all([cumFetch, periodFetch])
      .then(([cumResult, periodResult]) => {
        setAccounts(cumResult.data?.accounts ?? []);
        setPeriodAccounts(periodResult?.data?.accounts ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmsLoaded, firmFilter, periodFilter, asOfDate]);

  // Build sections from cumulative data (for BS accounts)
  const assets = buildSection(accounts, 'Asset');
  const liabilities = buildSection(accounts, 'Liability');
  const equity = buildSection(accounts, 'Equity');

  // Calculate net income
  const cumulativeNetIncome = calcNetIncome(accounts);

  // When a period is selected, split into dynamic retained earnings + current period earnings
  let dynamicRetainedEarnings = 0;
  let currentPeriodNetIncome = cumulativeNetIncome;

  if (periodAccounts) {
    const periodNetIncome = calcNetIncome(periodAccounts);
    dynamicRetainedEarnings = cumulativeNetIncome - periodNetIncome;
    currentPeriodNetIncome = periodNetIncome;
  }

  // Totals
  const totalAssets = assets.sectionTotal;
  const totalEquityWithNetIncome = equity.sectionTotal + dynamicRetainedEarnings + currentPeriodNetIncome;
  const totalLiabilitiesEquity = liabilities.sectionTotal + totalEquityWithNetIncome;
  const difference = totalAssets - totalLiabilitiesEquity;
  const isBalanced = Math.abs(difference) < 0.01;
  const hasData = assets.nodes.length > 0 || liabilities.nodes.length > 0 || equity.nodes.length > 0
    || Math.abs(cumulativeNetIncome) > 0.01;

  const renderSection = (title: string, nodes: AccountNode[], sectionTotal: number) => (
    <>
      <tr className="bg-[var(--surface-base)]">
        <td colSpan={2} className="px-5 py-3 font-bold text-[var(--text-primary)] text-sm">{title}</td>
      </tr>

      {nodes.map((node, nodeIdx) => {
        const isCollapsed = collapsed.has(node.account.id);
        const hasChildren = node.children.length > 0;
        return (
          <React.Fragment key={node.account.id}>
            <tr
              className={`${nodeIdx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] cursor-pointer transition-colors`}
              onClick={() => hasChildren ? toggleCollapse(node.account.id) : undefined}
            >
              <td className="px-5 py-2.5 font-semibold text-[var(--text-primary)]">
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
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                {!hasChildren ? formatRM(node.account.balance) : ''}
              </td>
            </tr>

            {hasChildren && !isCollapsed && node.children.map((child, ci) => (
              <tr key={child.id} className={`${ci % 2 === 0 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] transition-colors`}>
                <td className="py-2.5 text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2 pl-11">
                    <span className="w-3 h-3 flex items-center justify-center text-[var(--outline)] text-[10px] flex-shrink-0">{'\u25FB'}</span>
                    {child.account_code} - {child.name}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                  {formatRM(child.balance)}
                </td>
              </tr>
            ))}

            {hasChildren && (
              <tr className="bg-[var(--surface-base)]">
                <td className="px-5 py-2 text-[var(--text-secondary)] font-semibold text-xs">
                  <div className="pl-6">Total - {node.account.account_code} - {node.account.name}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                  {formatRM(node.totalAmount)}
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}

      <tr className="bg-[var(--surface-header)]">
        <td className="px-5 py-3 font-bold text-sm text-[var(--text-primary)]">Total {title}</td>
        <td className="px-3 py-3 text-right tabular-nums font-bold text-sm text-[var(--text-primary)]">
          {formatRM(sectionTotal)}
        </td>
      </tr>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="accountant" />
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Balance Sheet</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {periodOptions.length > 0 && (
              <Select value={periodFilter} onChange={(v) => { setPeriodFilter(v); if (v) setAsOfDate(''); }}>
                <option value="">All Periods</option>
                {periodOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            )}
            {!periodFilter && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">As of:</span>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => { setAsOfDate(e.target.value); setPeriodFilter(''); }}
                  className="input-field"
                />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {!firmFilter ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Select a firm to view the Balance Sheet.</div>
            ) : loading ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Loading...</div>
            ) : !hasData ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">No accounts with activity found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-header)] text-left">
                    <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account</th>
                    <th className="px-3 py-2.5 text-right w-[180px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {renderSection('Assets', assets.nodes, assets.sectionTotal)}

                  <tr><td colSpan={2} className="h-2" /></tr>

                  {renderSection('Liabilities', liabilities.nodes, liabilities.sectionTotal)}

                  <tr><td colSpan={2} className="h-2" /></tr>

                  {/* ── Equity section (custom rendering for dynamic retained earnings) ── */}
                  <tr className="bg-[var(--surface-base)]">
                    <td colSpan={2} className="px-5 py-3 font-bold text-[var(--text-primary)] text-sm">Equity</td>
                  </tr>

                  {equity.nodes.map((node, nodeIdx) => {
                    const isCollapsedNode = collapsed.has(node.account.id);
                    const hasChildNodes = node.children.length > 0;
                    return (
                      <React.Fragment key={node.account.id}>
                        <tr
                          className={`${nodeIdx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] cursor-pointer transition-colors`}
                          onClick={() => hasChildNodes ? toggleCollapse(node.account.id) : undefined}
                        >
                          <td className="px-5 py-2.5 font-semibold text-[var(--text-primary)]">
                            <div className="flex items-center gap-2">
                              {hasChildNodes ? (
                                <span className="w-4 h-4 flex items-center justify-center text-[var(--text-muted)] text-xs flex-shrink-0">
                                  {isCollapsedNode ? '\u25B6' : '\u25BC'}
                                </span>
                              ) : (
                                <span className="w-4 flex-shrink-0" />
                              )}
                              {node.account.account_code} - {node.account.name}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                            {!hasChildNodes ? formatRM(node.account.balance) : ''}
                          </td>
                        </tr>
                        {hasChildNodes && !isCollapsedNode && node.children.map((child, ci) => (
                          <tr key={child.id} className={`${ci % 2 === 0 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] transition-colors`}>
                            <td className="py-2.5 text-[var(--text-secondary)]">
                              <div className="flex items-center gap-2 pl-11">
                                <span className="w-3 h-3 flex items-center justify-center text-[var(--outline)] text-[10px] flex-shrink-0">{'\u25FB'}</span>
                                {child.account_code} - {child.name}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                              {formatRM(child.balance)}
                            </td>
                          </tr>
                        ))}
                        {hasChildNodes && (
                          <tr className="bg-[var(--surface-base)]">
                            <td className="px-5 py-2 text-[var(--text-secondary)] font-semibold text-xs">
                              <div className="pl-6">Total - {node.account.account_code} - {node.account.name}</div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                              {formatRM(node.totalAmount)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Dynamic Retained Earnings (prior period P&L not yet closed) */}
                  {Math.abs(dynamicRetainedEarnings) > 0.01 && (
                    <tr className="bg-white">
                      <td className="px-5 py-2.5 font-semibold text-[var(--text-primary)] italic">
                        <div className="flex items-center gap-2">
                          <span className="w-4 flex-shrink-0" />
                          Retained Earnings (Prior Periods)
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold italic ${dynamicRetainedEarnings < 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
                        {formatRM(dynamicRetainedEarnings)}
                      </td>
                    </tr>
                  )}

                  {/* Current Period Net Income */}
                  <tr className="bg-[var(--surface-low)]">
                    <td className="px-5 py-2.5 font-semibold text-[var(--text-primary)] italic">
                      <div className="flex items-center gap-2">
                        <span className="w-4 flex-shrink-0" />
                        {currentPeriodNetIncome >= 0
                          ? (periodFilter ? 'Current Period Earnings' : 'Net Income (Current Year)')
                          : (periodFilter ? 'Current Period Loss' : 'Net Loss (Current Year)')
                        }
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold italic ${currentPeriodNetIncome < 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
                      {formatRM(currentPeriodNetIncome)}
                    </td>
                  </tr>

                  {/* Equity total */}
                  <tr className="bg-[var(--surface-header)]">
                    <td className="px-5 py-3 font-bold text-sm text-[var(--text-primary)]">Total Equity</td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-sm text-[var(--text-primary)]">
                      {formatRM(totalEquityWithNetIncome)}
                    </td>
                  </tr>

                  <tr><td colSpan={2} className="h-2" /></tr>

                  {/* Liabilities + Equity total */}
                  <tr className="bg-[var(--surface-header)]">
                    <td className="px-5 py-3 font-bold text-sm text-[var(--text-primary)]">Total Liabilities + Equity</td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-sm text-[var(--text-primary)]">
                      {formatRM(totalLiabilitiesEquity)}
                    </td>
                  </tr>

                  {/* Balance check */}
                  <tr className={isBalanced ? 'bg-[var(--secondary-container)]' : 'bg-[var(--error-container)]'}>
                    <td className={`px-5 py-3 font-bold text-sm ${isBalanced ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      {isBalanced ? 'Balanced' : 'Out of balance by'}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-bold text-sm ${isBalanced ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      {isBalanced ? '\u2713' : formatRM(Math.abs(difference))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
