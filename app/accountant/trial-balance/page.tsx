'use client';

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

interface PeriodOption { id: string; label: string; }
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
  totalDebit: number;
  totalCredit: number;
}

const SECTION_ORDER: { type: string; label: string }[] = [
  { type: 'Asset',     label: 'Assets' },
  { type: 'Liability', label: 'Liabilities' },
  { type: 'Equity',    label: 'Equity' },
  { type: 'Revenue',   label: 'Revenue' },
  { type: 'Expense',   label: 'Expenses' },
];

function buildSection(accounts: GLAccountRow[], type: string): { nodes: AccountNode[]; sectionDebit: number; sectionCredit: number } {
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
  let sectionDebit = 0;
  let sectionCredit = 0;

  for (const [parentId, parent] of Array.from(parentMap.entries())) {
    const children = childrenMap.get(parentId) ?? [];
    const allAccounts = [parent, ...children];

    if (allAccounts.every(a => a.total_debit === 0 && a.total_credit === 0)) continue;

    const filteredChildren = children.filter(c => c.total_debit !== 0 || c.total_credit !== 0);

    // For trial balance: debit-normal accounts show balance in Debit column, credit-normal in Credit column
    let nodeDebit = 0;
    let nodeCredit = 0;
    for (const a of [parent, ...filteredChildren]) {
      if (a.balance > 0) {
        if (a.normal_balance === 'Debit') nodeDebit += a.balance;
        else nodeCredit += a.balance;
      } else if (a.balance < 0) {
        // Contra balance: debit-normal with credit balance goes to credit column
        if (a.normal_balance === 'Debit') nodeCredit += Math.abs(a.balance);
        else nodeDebit += Math.abs(a.balance);
      }
    }

    nodes.push({ account: parent, children: filteredChildren, totalDebit: nodeDebit, totalCredit: nodeCredit });
    sectionDebit += nodeDebit;
    sectionCredit += nodeCredit;
  }

  nodes.sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));
  return { nodes, sectionDebit, sectionCredit };
}

function trialBalanceColumns(account: GLAccountRow): { debit: number; credit: number } {
  if (account.balance > 0) {
    return account.normal_balance === 'Debit'
      ? { debit: account.balance, credit: 0 }
      : { debit: 0, credit: account.balance };
  } else if (account.balance < 0) {
    return account.normal_balance === 'Debit'
      ? { debit: 0, credit: Math.abs(account.balance) }
      : { debit: Math.abs(account.balance), credit: 0 };
  }
  return { debit: 0, credit: 0 };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TrialBalancePage() {
  usePageTitle('Trial Balance');

  const { firmId: firmFilter, firmsLoaded } = useFirm();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periodFilter, setPeriodFilter] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [accounts, setAccounts] = useState<GLAccountRow[]>([]);
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

  // Load GL data
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmFilter) { setAccounts([]); return; }
    setLoading(true);
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
    fetch(`/api/general-ledger?${p}`).then(r => r.json())
      .then(j => { setAccounts(j.data?.accounts ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [firmsLoaded, firmFilter, periodFilter, dateRange, customFrom, customTo]);

  // Build all sections
  const sections = SECTION_ORDER.map(s => ({
    ...s,
    ...buildSection(accounts, s.type),
  }));

  const grandTotalDebit = sections.reduce((s, sec) => s + sec.sectionDebit, 0);
  const grandTotalCredit = sections.reduce((s, sec) => s + sec.sectionCredit, 0);
  const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) <= 0.01;
  const hasData = sections.some(s => s.nodes.length > 0);

  const periodOptions: PeriodOption[] = fiscalYears.flatMap(fy =>
    fy.periods.map(p => ({ id: p.id, label: `${fy.year_label} P${p.period_number}` }))
  );

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Trial Balance</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">

          {/* Filters */}
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
          </div>

          {/* Summary strip */}
          {hasData && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="bg-white card-popped px-4 py-2">
                <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Debit</span>
                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{formatRM(grandTotalDebit)}</p>
              </div>
              <div className="bg-white card-popped px-4 py-2">
                <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Credit</span>
                <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{formatRM(grandTotalCredit)}</p>
              </div>
              {isBalanced ? (
                <div className="bg-[var(--secondary-container)] px-4 py-2" style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                  <span className="text-[10px] font-label font-bold uppercase tracking-widest text-[var(--on-secondary-container)]">Balanced</span>
                </div>
              ) : (
                <div className="bg-[var(--error-container)] px-4 py-2" style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                  <span className="text-[10px] font-label font-bold uppercase tracking-widest text-[var(--on-error-container)]">Out of balance by {formatRM(Math.abs(grandTotalDebit - grandTotalCredit))}</span>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {!firmFilter ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Select a firm to view Trial Balance.</div>
            ) : loading ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Loading...</div>
            ) : !hasData ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">No accounts with activity found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account</th>
                    <th className="px-3 py-2.5 text-right w-[160px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Debit</th>
                    <th className="px-3 py-2.5 text-right w-[160px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section, si) => {
                    if (section.nodes.length === 0) return null;
                    return (
                      <React.Fragment key={section.type}>
                        {si > 0 && sections.slice(0, si).some(s => s.nodes.length > 0) && (
                          <tr><td colSpan={3} className="h-2" /></tr>
                        )}

                        {/* Section header */}
                        <tr className="bg-[var(--surface-base)]">
                          <td colSpan={3} className="px-5 py-3 font-bold text-[var(--text-primary)] text-sm">{section.label}</td>
                        </tr>

                        {section.nodes.map((node, nodeIdx) => {
                          const isCollapsed = collapsed.has(node.account.id);
                          const hasChildren = node.children.length > 0;
                          const parentTB = trialBalanceColumns(node.account);
                          return (
                            <React.Fragment key={node.account.id}>
                              {/* Parent row */}
                              <tr
                                className={`${nodeIdx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] cursor-pointer transition-colors`}
                                onClick={() => hasChildren ? toggleCollapse(node.account.id) : undefined}
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
                                  {!hasChildren && parentTB.debit > 0 ? formatRM(parentTB.debit) : ''}
                                </td>
                                <td data-col="Credit" className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                                  {!hasChildren && parentTB.credit > 0 ? formatRM(parentTB.credit) : ''}
                                </td>
                              </tr>

                              {/* Child rows */}
                              {hasChildren && !isCollapsed && node.children.map((child, ci) => {
                                const childTB = trialBalanceColumns(child);
                                return (
                                  <tr key={child.id} className={`${ci % 2 === 0 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] transition-colors`}>
                                    <td data-col="Account" className="py-2.5 text-[var(--text-secondary)]">
                                      <div className="flex items-center gap-2 pl-11">
                                        <span className="w-3 h-3 flex items-center justify-center text-[var(--outline)] text-[10px] flex-shrink-0">{'\u25FB'}</span>
                                        {child.account_code} - {child.name}
                                      </div>
                                    </td>
                                    <td data-col="Debit" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                                      {childTB.debit > 0 ? formatRM(childTB.debit) : ''}
                                    </td>
                                    <td data-col="Credit" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                                      {childTB.credit > 0 ? formatRM(childTB.credit) : ''}
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* Total row */}
                              {hasChildren && (
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
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Section total */}
                        <tr className="bg-[var(--surface-header)]">
                          <td data-col="Account" className="px-5 py-3 font-bold text-sm text-[var(--text-primary)]">Total {section.label}</td>
                          <td data-col="Debit" className="px-3 py-3 text-right tabular-nums font-bold text-sm text-[var(--text-primary)]">
                            {section.sectionDebit > 0 ? formatRM(section.sectionDebit) : ''}
                          </td>
                          <td data-col="Credit" className="px-3 py-3 text-right tabular-nums font-bold text-sm text-[var(--text-primary)]">
                            {section.sectionCredit > 0 ? formatRM(section.sectionCredit) : ''}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Grand total */}
                  <tr><td colSpan={3} className="h-2" /></tr>
                  <tr className={isBalanced ? 'bg-[var(--secondary-container)]' : 'bg-[var(--error-container)]'}>
                    <td data-col="Account" className={`px-5 py-4 font-bold text-base ${isBalanced ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      Grand Total
                    </td>
                    <td data-col="Debit" className={`px-3 py-4 text-right tabular-nums font-bold text-base ${isBalanced ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      {formatRM(grandTotalDebit)}
                    </td>
                    <td data-col="Credit" className={`px-3 py-4 text-right tabular-nums font-bold text-base ${isBalanced ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      {formatRM(grandTotalCredit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
