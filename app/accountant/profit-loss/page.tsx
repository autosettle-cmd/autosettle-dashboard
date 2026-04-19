'use client';

import Sidebar from '@/components/Sidebar';
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

  for (const [parentId, parent] of Array.from(parentMap.entries())) {
    const children = childrenMap.get(parentId) ?? [];
    const allAccounts = [parent, ...children];
    const totalAmount = allAccounts.reduce((s, a) => s + a.balance, 0);

    if (allAccounts.every(a => a.total_debit === 0 && a.total_credit === 0)) continue;

    const filteredChildren = children.filter(c => c.total_debit !== 0 || c.total_credit !== 0);
    nodes.push({ account: parent, children: filteredChildren, totalAmount });
    sectionTotal += totalAmount;
  }

  nodes.sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));
  return { nodes, sectionTotal };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  usePageTitle('Profit & Loss');

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

  const revenue = buildSection(accounts, 'Revenue');
  const expense = buildSection(accounts, 'Expense');
  // Revenue is credit-normal (positive), Expense is debit-normal (positive)
  // Net Profit = Revenue - Expense (positive = profit, negative = loss)
  const netProfit = revenue.sectionTotal - expense.sectionTotal;
  const hasData = revenue.nodes.length > 0 || expense.nodes.length > 0;

  const periodOptions: PeriodOption[] = fiscalYears.flatMap(fy =>
    fy.periods.map(p => ({ id: p.id, label: `${fy.year_label} P${p.period_number}` }))
  );

  const renderSection = (title: string, nodes: AccountNode[], sectionTotal: number) => (
    <>
      {/* Section header */}
      <tr className="bg-[var(--surface-base)]">
        <td colSpan={2} className="px-5 py-3 font-bold text-[var(--text-primary)] text-sm">{title}</td>
      </tr>

      {nodes.map((node, nodeIdx) => {
        const isCollapsed = collapsed.has(node.account.id);
        const hasChildren = node.children.length > 0;
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
              <td data-col="Amount" className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                {!hasChildren ? formatRM(node.account.balance) : ''}
              </td>
            </tr>

            {/* Child rows */}
            {hasChildren && !isCollapsed && node.children.map((child, ci) => (
              <tr key={child.id} className={`${ci % 2 === 0 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] transition-colors`}>
                <td data-col="Account" className="py-2.5 text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2 pl-11">
                    <span className="w-3 h-3 flex items-center justify-center text-[var(--outline)] text-[10px] flex-shrink-0">{'\u25FB'}</span>
                    {child.account_code} - {child.name}
                  </div>
                </td>
                <td data-col="Amount" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                  {formatRM(child.balance)}
                </td>
              </tr>
            ))}

            {/* Total row */}
            {hasChildren && (
              <tr className="bg-[var(--surface-base)]">
                <td data-col="Account" className="px-5 py-2 text-[var(--text-secondary)] font-semibold text-xs">
                  <div className="pl-6">Total - {node.account.account_code} - {node.account.name}</div>
                </td>
                <td data-col="Amount" className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">
                  {formatRM(node.totalAmount)}
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}

      {/* Section total */}
      <tr className="bg-[var(--surface-header)]">
        <td data-col="Account" className="px-5 py-3 font-bold text-sm text-[var(--text-primary)]">Total {title}</td>
        <td data-col="Amount" className="px-3 py-3 text-right tabular-nums font-bold text-sm text-[var(--text-primary)]">
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
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Profit & Loss</h1>
          <SearchButton />
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

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {!firmFilter ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Select a firm to view Profit & Loss.</div>
            ) : loading ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">Loading...</div>
            ) : !hasData ? (
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">No revenue or expense accounts with activity found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account</th>
                    <th className="px-3 py-2.5 text-right w-[180px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {renderSection('Revenue', revenue.nodes, revenue.sectionTotal)}

                  {/* Spacer */}
                  <tr><td colSpan={2} className="h-2" /></tr>

                  {renderSection('Expenses', expense.nodes, expense.sectionTotal)}

                  {/* Spacer */}
                  <tr><td colSpan={2} className="h-2" /></tr>

                  {/* Net Profit / Loss */}
                  <tr className={`${netProfit >= 0 ? 'bg-[var(--secondary-container)]' : 'bg-[var(--error-container)]'}`}>
                    <td data-col="Account" className={`px-5 py-4 font-bold text-base ${netProfit >= 0 ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      {netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                    </td>
                    <td data-col="Amount" className={`px-3 py-4 text-right tabular-nums font-bold text-base ${netProfit >= 0 ? 'text-[var(--on-secondary-container)]' : 'text-[var(--on-error-container)]'}`}>
                      {formatRM(netProfit)}
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
