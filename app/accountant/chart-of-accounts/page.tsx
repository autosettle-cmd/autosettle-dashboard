'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GLAccount {
  id: string;
  firm_id: string;
  account_code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_id: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  description: string | null;
}

interface Firm {
  id: string;
  name: string;
}

interface TreeNode extends GLAccount {
  children: TreeNode[];
  expanded: boolean;
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
    map.set(a.id, { ...a, children: [], expanded: true, depth: 0 });
  }

  const allNodes = Array.from(map.values());
  for (const node of allNodes) {
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
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

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [modalCode, setModalCode] = useState('');
  const [modalName, setModalName] = useState('');
  const [modalType, setModalType] = useState('Expense');
  const [modalBalance, setModalBalance] = useState('Debit');
  const [modalParent, setModalParent] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Load firms
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setFirms(j.data);
          if (j.data.length === 1) setFirmId(j.data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Load accounts
  useEffect(() => {
    if (!firmId) { setAccounts([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    fetch(`/api/gl-accounts?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const data = j.data ?? [];
          setAccounts(data);
          // Expand all by default
          setExpandedSet(new Set(data.map((a: GLAccount) => a.id)));
          setLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // ─── Tree ─────────────────────────────────────────────────────────────────

  const tree = buildTree(accounts);
  const flatRows = flattenTree(tree, expandedSet);

  const toggleExpand = (id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasChildren = (id: string) => accounts.some((a) => a.parent_id === id);

  // ─── Seed ─────────────────────────────────────────────────────────────────

  const seedDefault = async () => {
    if (!firmId) return;
    setSeeding(true);
    try {
      const res = await fetch('/api/gl-accounts/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Failed to seed');
      } else {
        refresh();
      }
    } catch {
      alert('Network error');
    } finally {
      setSeeding(false);
    }
  };

  // ─── Modal ────────────────────────────────────────────────────────────────

  const openAddModal = (parentId?: string) => {
    setEditId(null);
    setModalCode('');
    setModalName('');
    setModalType('Expense');
    setModalBalance('Debit');
    setModalParent(parentId ?? '');
    setModalDesc('');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const openEditModal = (account: GLAccount) => {
    setEditId(account.id);
    setModalCode(account.account_code);
    setModalName(account.name);
    setModalType(account.account_type);
    setModalBalance(account.normal_balance);
    setModalParent(account.parent_id ?? '');
    setModalDesc(account.description ?? '');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitModal = async () => {
    if (!modalCode.trim() || !modalName.trim()) {
      setModalError('Account code and name are required.');
      return;
    }
    setModalSaving(true);
    setModalError('');

    try {
      const url = editId ? `/api/gl-accounts/${editId}` : '/api/gl-accounts';
      const method = editId ? 'PATCH' : 'POST';
      const body = editId
        ? { account_code: modalCode.trim(), name: modalName.trim(), description: modalDesc.trim() || null, parent_id: modalParent || null }
        : { firmId, account_code: modalCode.trim(), name: modalName.trim(), account_type: modalType, normal_balance: modalBalance, parent_id: modalParent || null, description: modalDesc.trim() || null };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to save');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
    } catch {
      setModalError('Network error');
      setModalSaving(false);
    }
  };

  // ─── Toggle active ────────────────────────────────────────────────────────

  const toggleActive = async (account: GLAccount) => {
    try {
      await fetch(`/api/gl-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !account.is_active }),
      });
      refresh();
    } catch {
      alert('Network error');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const hasFirmSelected = !!firmId;
  const hasAccounts = accounts.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6F8]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Chart of Accounts</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className="input-field">
                <option value="">Select Firm</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}

            {hasFirmSelected && hasAccounts && (
              <button onClick={() => openAddModal()} className="ml-auto btn-primary text-sm px-4 py-2 rounded-lg font-semibold">
                Add Account
              </button>
            )}
          </div>

          {!hasFirmSelected ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Select a firm to view its Chart of Accounts.</div>
          ) : loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : !hasAccounts ? (
            /* Empty state — seed prompt */
            <div className="bg-white rounded-lg p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7V4a2 2 0 012-2h8.5L20 7.5V20a2 2 0 01-2 2H6a2 2 0 01-2-2v-3" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="2" y1="15" x2="12" y2="15" />
                  <polyline points="9 18 12 15 9 12" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#191C1E] mb-1">No Chart of Accounts</h3>
              <p className="text-sm text-[#8E9196] mb-6">This firm doesn&apos;t have a Chart of Accounts yet. Seed the default Malaysian SME template to get started.</p>
              <button onClick={seedDefault} disabled={seeding} className="btn-primary text-sm px-6 py-2.5 rounded-lg font-semibold disabled:opacity-40">
                {seeding ? 'Seeding...' : 'Seed Default Template'}
              </button>
            </div>
          ) : (
            /* Accounts tree table */
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-5 py-2.5 w-[280px]">Account Code</th>
                      <th className="px-3 py-2.5">Account Name</th>
                      <th className="px-3 py-2.5 w-[100px]">Type</th>
                      <th className="px-3 py-2.5 w-[80px]">Balance</th>
                      <th className="px-3 py-2.5 w-[80px]">Status</th>
                      <th className="px-3 py-2.5 w-[140px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row) => (
                      <tr key={row.id} className="text-body-sm hover:bg-[#F2F4F6] transition-colors border-b border-gray-50 cursor-pointer" onClick={() => hasChildren(row.id) && toggleExpand(row.id)}>
                        <td className="px-5 py-3">
                          <div className="flex items-center" style={{ paddingLeft: `${row.depth * 20}px` }}>
                            {hasChildren(row.id) ? (
                              <button
                                onClick={() => toggleExpand(row.id)}
                                className="w-5 h-5 flex items-center justify-center mr-1.5 text-[#8E9196] hover:text-[#191C1E] transition-colors"
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
                            <span className="font-mono text-[13px] font-semibold text-[#191C1E]">{row.account_code}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#434654] font-medium">{row.name}</td>
                        <td className="px-3 py-3">
                          <span className={TYPE_BADGES[row.account_type] ?? 'badge-gray'}>{row.account_type}</span>
                        </td>
                        <td className="px-3 py-3 text-[#8E9196] text-xs">{row.normal_balance}</td>
                        <td className="px-3 py-3">
                          {row.is_active
                            ? <span className="badge-green">Active</span>
                            : <span className="badge-gray">Inactive</span>
                          }
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openEditModal(row)}
                              className="p-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                              title="Edit"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => toggleActive(row)}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
                            >
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-body-sm text-[#8E9196]">{accounts.length} accounts</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* === ADD/EDIT ACCOUNT MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setShowModal(false)} />
      )}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <span className="text-white font-semibold text-sm">{editId ? 'Edit Account' : 'Add Account'}</span>
              <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {modalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Account Code *</label>
                  <input type="text" value={modalCode} onChange={(e) => setModalCode(e.target.value)} className="input-field w-full" placeholder="e.g. 615-001" autoFocus />
                </div>
                <div>
                  <label className="input-label">Account Name *</label>
                  <input type="text" value={modalName} onChange={(e) => setModalName(e.target.value)} className="input-field w-full" placeholder="e.g. Fuel Expenses" />
                </div>
              </div>

              {!editId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="input-label">Account Type</label>
                    <select value={modalType} onChange={(e) => {
                      setModalType(e.target.value);
                      // Auto-set normal balance based on type
                      if (['Asset', 'Expense'].includes(e.target.value)) setModalBalance('Debit');
                      else setModalBalance('Credit');
                    }} className="input-field w-full">
                      <option value="Asset">Asset</option>
                      <option value="Liability">Liability</option>
                      <option value="Equity">Equity</option>
                      <option value="Revenue">Revenue</option>
                      <option value="Expense">Expense</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Normal Balance</label>
                    <select value={modalBalance} onChange={(e) => setModalBalance(e.target.value)} className="input-field w-full">
                      <option value="Debit">Debit</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="input-label">Parent Account</label>
                <select value={modalParent} onChange={(e) => setModalParent(e.target.value)} className="input-field w-full">
                  <option value="">None (Top Level)</option>
                  {accounts
                    .filter((a) => a.id !== editId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="input-label">Description</label>
                <input type="text" value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className="input-field w-full" placeholder="Optional description" />
              </div>
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3 border-t border-gray-100">
              <button onClick={submitModal} disabled={modalSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
                {modalSaving ? 'Saving...' : editId ? 'Save Changes' : 'Create Account'}
              </button>
              <button onClick={() => setShowModal(false)} disabled={modalSaving} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
