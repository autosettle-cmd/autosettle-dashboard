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

const SECTION_ORDER: { type: string; label: string; colorClass: string }[] = [
  { type: 'Asset',     label: 'Assets',          colorClass: 'bg-blue-50 text-blue-800' },
  { type: 'Liability', label: 'Liabilities',     colorClass: 'bg-amber-50 text-amber-800' },
  { type: 'Equity',    label: 'Equity',          colorClass: 'bg-purple-50 text-purple-800' },
  { type: 'Revenue',   label: 'Revenue',         colorClass: 'bg-green-50 text-green-800' },
  { type: 'Expense',   label: 'Expenses',        colorClass: 'bg-red-50 text-red-800' },
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

  for (const [parentId, parent] of parentMap) {
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
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="accountant" />
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <h1 className="text-[22px] font-bold text-[#191C1E] tracking-tight">Trial Balance</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 px-6 pb-6 animate-in">

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
                    <span className="text-[#8E9196] text-sm">–</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-field" />
                  </>
                )}
              </>
            )}
          </div>

          {/* Summary strip */}
          {hasData && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="bg-white rounded-lg px-4 py-2 border border-gray-100">
                <span className="text-label-sm text-[#8E9196] uppercase tracking-wide">Total Debit</span>
                <p className="text-sm font-bold text-[#191C1E] tabular-nums">{formatRM(grandTotalDebit)}</p>
              </div>
              <div className="bg-white rounded-lg px-4 py-2 border border-gray-100">
                <span className="text-label-sm text-[#8E9196] uppercase tracking-wide">Total Credit</span>
                <p className="text-sm font-bold text-[#191C1E] tabular-nums">{formatRM(grandTotalCredit)}</p>
              </div>
              {isBalanced ? (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <span className="text-label-sm text-green-700 font-semibold">Balanced</span>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <span className="text-label-sm text-red-600 font-semibold">Out of balance by {formatRM(Math.abs(grandTotalDebit - grandTotalCredit))}</span>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-auto bg-white rounded-lg">
            {!firmFilter ? (
              <div className="text-center py-12 text-sm text-[#8E9196]">Select a firm to view Trial Balance.</div>
            ) : loading ? (
              <div className="text-center py-12 text-sm text-[#8E9196]">Loading...</div>
            ) : !hasData ? (
              <div className="text-center py-12 text-sm text-[#8E9196]">No accounts with activity found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="ds-table-header text-left">
                    <th className="px-5 py-2.5">Account</th>
                    <th className="px-3 py-2.5 text-right w-[160px]">Debit</th>
                    <th className="px-3 py-2.5 text-right w-[160px]">Credit</th>
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
                        <tr className="bg-[#F7F9FB]">
                          <td colSpan={3} className="px-5 py-3 font-bold text-[#191C1E] text-sm">{section.label}</td>
                        </tr>

                        {section.nodes.map((node) => {
                          const isCollapsed = collapsed.has(node.account.id);
                          const hasChildren = node.children.length > 0;
                          const parentTB = trialBalanceColumns(node.account);
                          return (
                            <React.Fragment key={node.account.id}>
                              {/* Parent row */}
                              <tr
                                className="border-b border-gray-100 hover:bg-[#F2F4F6] cursor-pointer transition-colors"
                                onClick={() => hasChildren ? toggleCollapse(node.account.id) : undefined}
                              >
                                <td className="px-5 py-2.5 font-semibold text-[#191C1E]">
                                  <div className="flex items-center gap-2">
                                    {hasChildren ? (
                                      <span className="w-4 h-4 flex items-center justify-center text-[#8E9196] text-xs flex-shrink-0">
                                        {isCollapsed ? '▶' : '▼'}
                                      </span>
                                    ) : (
                                      <span className="w-4 flex-shrink-0" />
                                    )}
                                    {node.account.account_code} - {node.account.name}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#191C1E]">
                                  {!hasChildren && parentTB.debit > 0 ? formatRM(parentTB.debit) : ''}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#191C1E]">
                                  {!hasChildren && parentTB.credit > 0 ? formatRM(parentTB.credit) : ''}
                                </td>
                              </tr>

                              {/* Child rows */}
                              {hasChildren && !isCollapsed && node.children.map((child) => {
                                const childTB = trialBalanceColumns(child);
                                return (
                                  <tr key={child.id} className="border-b border-gray-50 hover:bg-[#F2F4F6] transition-colors">
                                    <td className="py-2.5 text-[#434654]">
                                      <div className="flex items-center gap-2 pl-11">
                                        <span className="w-3 h-3 flex items-center justify-center text-[#C4C7CC] text-[10px] flex-shrink-0">◻</span>
                                        {child.account_code} - {child.name}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-[#191C1E]">
                                      {childTB.debit > 0 ? formatRM(childTB.debit) : ''}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-[#191C1E]">
                                      {childTB.credit > 0 ? formatRM(childTB.credit) : ''}
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* Total row */}
                              {hasChildren && (
                                <tr className="border-b border-gray-200 bg-[#F7F9FB]">
                                  <td className="px-5 py-2 text-[#434654] font-semibold text-xs">
                                    <div className="pl-6">Total - {node.account.account_code} - {node.account.name}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#191C1E] text-xs">
                                    {node.totalDebit > 0 ? formatRM(node.totalDebit) : ''}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#191C1E] text-xs">
                                    {node.totalCredit > 0 ? formatRM(node.totalCredit) : ''}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Section total */}
                        <tr className={`border-b-2 border-gray-300 ${section.colorClass}`}>
                          <td className="px-5 py-3 font-bold text-sm">Total {section.label}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-bold text-sm">
                            {section.sectionDebit > 0 ? formatRM(section.sectionDebit) : ''}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-bold text-sm">
                            {section.sectionCredit > 0 ? formatRM(section.sectionCredit) : ''}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Grand total */}
                  <tr><td colSpan={3} className="h-2" /></tr>
                  <tr className={`border-b-2 border-gray-400 ${isBalanced ? 'bg-green-100' : 'bg-red-100'}`}>
                    <td className={`px-5 py-4 font-bold text-base ${isBalanced ? 'text-green-900' : 'text-red-900'}`}>
                      Grand Total
                    </td>
                    <td className={`px-3 py-4 text-right tabular-nums font-bold text-base ${isBalanced ? 'text-green-900' : 'text-red-900'}`}>
                      {formatRM(grandTotalDebit)}
                    </td>
                    <td className={`px-3 py-4 text-right tabular-nums font-bold text-base ${isBalanced ? 'text-green-900' : 'text-red-900'}`}>
                      {formatRM(grandTotalCredit)}
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
