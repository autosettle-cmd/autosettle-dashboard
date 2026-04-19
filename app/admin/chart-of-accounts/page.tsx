'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GLAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_id: string | null;
  is_active: boolean;
  is_system: boolean;
}

interface TreeNode extends GLAccount {
  children: TreeNode[];
  depth: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TYPE_BADGES: Record<string, string> = {
  Asset: 'badge-blue',
  Liability: 'badge-amber',
  Equity: 'badge-purple',
  Revenue: 'badge-green',
  Expense: 'badge-red',
};

function buildTree(accounts: GLAccount[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const a of accounts) {
    map.set(a.id, { ...a, children: [], depth: 0 });
  }

  const allNodes = Array.from(map.values());
  for (const node of allNodes) {
    if (node.parent_id && map.has(node.parent_id)) {
      node.depth = map.get(node.parent_id)!.depth + 1;
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenTree(nodes: TreeNode[], expandedSet: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[], depth: number) {
    for (const node of list) {
      result.push({ ...node, depth });
      if (node.children.length > 0 && expandedSet.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return result;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminChartOfAccountsPage() {
  usePageTitle('Chart of Accounts');
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/admin/gl-accounts')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const data = j.data ?? [];
          setAccounts(data);
          setExpandedSet(new Set(data.map((a: GLAccount) => a.id)));
          setLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const tree = buildTree(accounts);
  const flatRows = flattenTree(tree, expandedSet);
  const hasChildren = (id: string) => accounts.some((a) => a.parent_id === id);

  const toggleExpand = (id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seedDefault = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/gl-accounts/seed', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) alert(json.error || 'Failed to seed');
      else refresh();
    } catch {
      alert('Network error');
    } finally {
      setSeeding(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const importSqlAccounting = async () => {
    if (!confirm('Replace ALL current GL accounts with SQL Accounting COA?\n\nThis will delete existing accounts and import 97 accounts from the PDF. Cannot be undone if journal entries exist.')) return;
    setImporting(true);
    try {
      const res = await fetch('/api/admin/gl-accounts/import-sql-accounting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'REPLACE_COA' }),
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || 'Import failed');
      else { alert(json.data.message); refresh(); }
    } catch {
      alert('Network error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Chart of Accounts</h1>
          <button
            onClick={importSqlAccounting}
            disabled={importing}
            className="btn-thick-white text-xs px-4 py-2 font-medium disabled:opacity-40"
          >
            {importing ? 'Importing...' : 'Import SQL Accounting COA'}
          </button>
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture animate-in">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : accounts.length === 0 ? (
            <div className="bg-white p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7V4a2 2 0 012-2h8.5L20 7.5V20a2 2 0 01-2 2H6a2 2 0 01-2-2v-3" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="2" y1="15" x2="12" y2="15" />
                  <polyline points="9 18 12 15 9 12" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Chart of Accounts</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-6">Your firm doesn&apos;t have a Chart of Accounts yet. Seed the default Malaysian SME template to get started.</p>
              <button onClick={seedDefault} disabled={seeding} className="btn-thick-navy text-sm px-6 py-2.5 font-semibold disabled:opacity-40">
                {seeding ? 'Seeding...' : 'Seed Default Template'}
              </button>
            </div>
          ) : (
            <div className="bg-white overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="px-5 py-2.5 w-[280px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account Code</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Account Name</th>
                      <th className="px-3 py-2.5 w-[100px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                      <th className="px-3 py-2.5 w-[80px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                      <th className="px-3 py-2.5 w-[80px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row, idx) => (
                      <tr key={row.id} className={`text-body-sm hover:bg-[var(--surface-low)] transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`} onClick={() => hasChildren(row.id) && toggleExpand(row.id)}>
                        <td data-col="Account Code" className="px-5 py-3">
                          <div className="flex items-center" style={{ paddingLeft: `${row.depth * 20}px` }}>
                            {hasChildren(row.id) ? (
                              <button
                                onClick={() => toggleExpand(row.id)}
                                className="w-5 h-5 flex items-center justify-center mr-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  className={`transition-transform ${expandedSet.has(row.id) ? 'rotate-90' : ''}`}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            ) : (
                              <span className="w-5 mr-1.5" />
                            )}
                            <span className="font-mono text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{row.account_code}</span>
                          </div>
                        </td>
                        <td data-col="Account Name" className="px-3 py-3 text-[var(--text-secondary)] font-medium">{row.name}</td>
                        <td data-col="Type" className="px-3 py-3">
                          <span className={TYPE_BADGES[row.account_type] ?? 'badge-gray'}>{row.account_type}</span>
                        </td>
                        <td data-col="Balance" className="px-3 py-3 text-[var(--text-secondary)] text-xs">{row.normal_balance}</td>
                        <td data-col="Status" className="px-3 py-3">
                          {row.is_active
                            ? <span className="badge-green">Active</span>
                            : <span className="badge-gray">Inactive</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3">
                <p className="text-body-sm text-[var(--text-secondary)] tabular-nums">{accounts.length} accounts</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
