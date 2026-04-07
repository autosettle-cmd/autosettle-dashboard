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

  // Accounting settings
  const [tradePayablesId, setTradePayablesId] = useState('');
  const [staffClaimsId, setStaffClaimsId] = useState('');
  const [origTradePayables, setOrigTradePayables] = useState<{ id: string; label: string } | null>(null);
  const [origStaffClaims, setOrigStaffClaims] = useState<{ id: string; label: string } | null>(null);
  const [bankMappings, setBankMappings] = useState<{ bank_name: string; account_number: string; gl_account_id: string | null; gl_account_label: string | null }[]>([]);
  const [bankGlEdits, setBankGlEdits] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ label: string; changes: { from: string; to: string }[]; onConfirm: () => void } | null>(null);

  // Load accounting settings when firm changes
  useEffect(() => {
    if (!firmId) return;
    fetch(`/api/accounting-settings?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data;
        setOrigTradePayables(d.gl_defaults.trade_payables);
        setOrigStaffClaims(d.gl_defaults.staff_claims);
        setTradePayablesId(d.gl_defaults.trade_payables?.id ?? '');
        setStaffClaimsId(d.gl_defaults.staff_claims?.id ?? '');
        setBankMappings(d.bank_mappings ?? []);
        setBankGlEdits({});
      })
      .catch(console.error);
  }, [firmId, refreshKey]);

  const liabilityAccounts = accounts.filter((a) => a.account_type === 'Liability');
  const bankGlAccounts = accounts.filter((a) => a.account_type === 'Asset');

  const saveGlDefaults = () => {
    const tpChanged = origTradePayables && tradePayablesId !== origTradePayables.id;
    const scChanged = origStaffClaims && staffClaimsId !== origStaffClaims.id;
    if (tpChanged || scChanged) {
      const changes: { from: string; to: string }[] = [];
      if (tpChanged) {
        const newTp = accounts.find((a) => a.id === tradePayablesId);
        changes.push({ from: `Trade Payables: ${origTradePayables.label}`, to: `Trade Payables: ${newTp ? `${newTp.account_code} — ${newTp.name}` : 'Not configured'}` });
      }
      if (scChanged) {
        const newSc = accounts.find((a) => a.id === staffClaimsId);
        changes.push({ from: `Staff Claims: ${origStaffClaims.label}`, to: `Staff Claims: ${newSc ? `${newSc.account_code} — ${newSc.name}` : 'Not configured'}` });
      }
      setConfirmModal({ label: 'GL Defaults', changes, onConfirm: doSaveGlDefaults });
      return;
    }
    doSaveGlDefaults();
  };

  const doSaveGlDefaults = async () => {
    setConfirmModal(null);
    setSettingsSaving(true);
    setSettingsMsg('');
    try {
      const res = await fetch(`/api/firms/${firmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_trade_payables_gl_id: tradePayablesId || null, default_staff_claims_gl_id: staffClaimsId || null }),
      });
      if (res.ok) {
        const tp = accounts.find((a) => a.id === tradePayablesId);
        const sc = accounts.find((a) => a.id === staffClaimsId);
        setOrigTradePayables(tp ? { id: tp.id, label: `${tp.account_code} — ${tp.name}` } : null);
        setOrigStaffClaims(sc ? { id: sc.id, label: `${sc.account_code} — ${sc.name}` } : null);
        setSettingsMsg('GL defaults saved');
      }
    } catch (e) { console.error(e); }
    finally { setSettingsSaving(false); }
  };

  const saveBankMapping = (bankName: string, accountNumber: string) => {
    const key = `${bankName}|${accountNumber}`;
    const glId = bankGlEdits[key];
    if (!glId) return;
    const existing = bankMappings.find((m) => m.bank_name === bankName && m.account_number === accountNumber);
    if (existing?.gl_account_id && existing.gl_account_id !== glId) {
      const newGl = accounts.find((a) => a.id === glId);
      setConfirmModal({
        label: `${bankName} ${accountNumber}`,
        changes: [{ from: existing.gl_account_label ?? 'Unknown', to: newGl ? `${newGl.account_code} — ${newGl.name}` : 'Unknown' }],
        onConfirm: () => doSaveBankMapping(bankName, accountNumber),
      });
      return;
    }
    doSaveBankMapping(bankName, accountNumber);
  };

  const doSaveBankMapping = async (bankName: string, accountNumber: string) => {
    setConfirmModal(null);
    const key = `${bankName}|${accountNumber}`;
    const glId = bankGlEdits[key];
    if (!glId) return;
    setSettingsSaving(true);
    setSettingsMsg('');
    try {
      const res = await fetch('/api/accounting-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId, bank_name: bankName, account_number: accountNumber, gl_account_id: glId }),
      });
      if (res.ok) {
        const gl = accounts.find((a) => a.id === glId);
        setBankMappings((prev) => prev.map((m) => m.bank_name === bankName && m.account_number === accountNumber ? { ...m, gl_account_id: glId, gl_account_label: gl ? `${gl.account_code} — ${gl.name}` : null } : m));
        setBankGlEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
        setSettingsMsg(`Bank mapping saved for ${bankName}`);
      }
    } catch (e) { console.error(e); }
    finally { setSettingsSaving(false); }
  };

  // Tax codes
  interface TaxCodeRow { id: string; code: string; description: string; rate: string; tax_type: string; gl_account_id: string | null; glAccount: { account_code: string; name: string } | null; is_active: boolean; }
  const [taxCodes, setTaxCodes] = useState<TaxCodeRow[]>([]);

  // Load tax codes when firm changes
  useEffect(() => {
    if (!firmId) { setTaxCodes([]); return; }
    fetch(`/api/tax-codes?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => setTaxCodes(j.data ?? []))
      .catch(console.error);
  }, [firmId, refreshKey]);

  const taxGlAccounts = accounts.filter((a) => ['Asset', 'Liability'].includes(a.account_type));

  // Tax code modal
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxEditId, setTaxEditId] = useState<string | null>(null);
  const [taxModalCode, setTaxModalCode] = useState('');
  const [taxModalDesc, setTaxModalDesc] = useState('');
  const [taxModalRate, setTaxModalRate] = useState('');
  const [taxModalType, setTaxModalType] = useState('');
  const [taxModalGlId, setTaxModalGlId] = useState('');
  const [taxModalError, setTaxModalError] = useState('');
  const [taxModalSaving, setTaxModalSaving] = useState(false);

  const openAddTaxModal = () => {
    setTaxEditId(null); setTaxModalCode(''); setTaxModalDesc(''); setTaxModalRate('0'); setTaxModalType('SST'); setTaxModalGlId(''); setTaxModalError(''); setTaxModalSaving(false); setShowTaxModal(true);
  };

  const openEditTaxModal = (tc: TaxCodeRow) => {
    setTaxEditId(tc.id); setTaxModalCode(tc.code); setTaxModalDesc(tc.description); setTaxModalRate(String(tc.rate)); setTaxModalType(tc.tax_type); setTaxModalGlId(tc.gl_account_id ?? ''); setTaxModalError(''); setTaxModalSaving(false); setShowTaxModal(true);
  };

  const submitTaxModal = async () => {
    if (!taxModalCode.trim() || !taxModalDesc.trim() || !taxModalType.trim()) { setTaxModalError('Code, description, and tax type are required.'); return; }
    setTaxModalSaving(true); setTaxModalError('');
    try {
      const url = taxEditId ? `/api/tax-codes/${taxEditId}` : '/api/tax-codes';
      const method = taxEditId ? 'PATCH' : 'POST';
      const body = taxEditId
        ? { code: taxModalCode.trim(), description: taxModalDesc.trim(), rate: parseFloat(taxModalRate), tax_type: taxModalType.trim(), gl_account_id: taxModalGlId || null }
        : { firmId, code: taxModalCode.trim(), description: taxModalDesc.trim(), rate: parseFloat(taxModalRate), tax_type: taxModalType.trim(), gl_account_id: taxModalGlId || null };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { setTaxModalError(json.error || 'Failed to save'); setTaxModalSaving(false); return; }
      setShowTaxModal(false); refresh();
    } catch { setTaxModalError('Network error'); setTaxModalSaving(false); }
  };

  const toggleTaxActive = async (tc: TaxCodeRow) => {
    try { await fetch(`/api/tax-codes/${tc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !tc.is_active }) }); refresh(); } catch { alert('Network error'); }
  };

  // GL Account Modal
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
          // Start collapsed
          setExpandedSet(new Set());
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
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => openAddModal()} className="btn-primary text-sm px-4 py-2 rounded-lg font-semibold">
                  Add Account Code
                </button>
                <button onClick={openAddTaxModal} className="btn-dark text-sm px-4 py-2 rounded-lg font-semibold">
                  Add Tax Code
                </button>
              </div>
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
            <>
            {/* ═══ ACCOUNTING SETTINGS ═══ */}
            {settingsMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">{settingsMsg}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* GL Defaults */}
              <section className="bg-white rounded-lg p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#191C1E]">GL Defaults</h2>
                  <p className="text-xs text-[#8E9196] mt-0.5">Contra accounts for auto-generated journal entries.</p>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="input-label">Trade Payables (invoices)</label>
                    <select value={tradePayablesId} onChange={(e) => setTradePayablesId(e.target.value)} className="input-field w-full text-sm">
                      <option value="">Not configured</option>
                      {liabilityAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Staff Claims Payable (claims)</label>
                    <select value={staffClaimsId} onChange={(e) => setStaffClaimsId(e.target.value)} className="input-field w-full text-sm">
                      <option value="">Not configured</option>
                      {liabilityAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                    </select>
                  </div>
                  <button onClick={saveGlDefaults} disabled={settingsSaving} className="btn-primary px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40">
                    {settingsSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </section>

              {/* Bank Account GL Mappings */}
              <section className="bg-white rounded-lg p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#191C1E]">Bank Account GL</h2>
                  <p className="text-xs text-[#8E9196] mt-0.5">Maps bank accounts to GL for bank reconciliation journal entries.</p>
                </div>
                {bankMappings.length === 0 ? (
                  <p className="text-xs text-[#8E9196]">No bank statements uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {bankMappings.map((m) => {
                      const key = `${m.bank_name}|${m.account_number}`;
                      const editValue = bankGlEdits[key] ?? m.gl_account_id ?? '';
                      const hasChanged = bankGlEdits[key] !== undefined && bankGlEdits[key] !== (m.gl_account_id ?? '');
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#191C1E] min-w-[120px]">{m.bank_name}</span>
                          <span className="text-xs text-[#8E9196] font-mono min-w-[110px]">{m.account_number || '-'}</span>
                          <select
                            value={editValue}
                            onChange={(e) => setBankGlEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="input-field flex-1 text-sm"
                          >
                            <option value="">Not mapped</option>
                            {bankGlAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                          </select>
                          {hasChanged ? (
                            <button onClick={() => saveBankMapping(m.bank_name, m.account_number)} disabled={settingsSaving} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40">Save</button>
                          ) : m.gl_account_id ? (
                            <span className="badge-green text-xs">Mapped</span>
                          ) : (
                            <span className="badge-amber text-xs">Unmapped</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Accounts tree table */}
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

            {/* ═══ TAX CODES TABLE ═══ */}
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-[#191C1E]">Tax Codes</h2>
              </div>
              {taxCodes.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-[#8E9196]">No tax codes. Click &quot;Add Tax Code&quot; to create one.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="ds-table-header text-left">
                        <th className="px-5 py-2.5">Code</th>
                        <th className="px-3 py-2.5">Description</th>
                        <th className="px-3 py-2.5 text-right w-[80px]">Rate</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">GL Account</th>
                        <th className="px-3 py-2.5 w-[80px]">Status</th>
                        <th className="px-3 py-2.5 w-[140px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxCodes.map((tc) => (
                        <tr key={tc.id} className="text-body-sm hover:bg-[#F2F4F6] transition-colors border-b border-gray-50">
                          <td className="px-5 py-3 font-mono font-semibold text-[#191C1E]">{tc.code}</td>
                          <td className="px-3 py-3 text-[#434654] font-medium">{tc.description}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-[#191C1E] font-semibold">{Number(tc.rate).toFixed(2)}%</td>
                          <td className="px-3 py-3 text-[#8E9196]">{tc.tax_type}</td>
                          <td className="px-3 py-3 text-[#434654] text-xs">{tc.glAccount ? `${tc.glAccount.account_code} — ${tc.glAccount.name}` : '—'}</td>
                          <td className="px-3 py-3">{tc.is_active ? <span className="badge-green">Active</span> : <span className="badge-gray">Inactive</span>}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => openEditTaxModal(tc)} className="p-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors" title="Edit">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button onClick={() => toggleTaxActive(tc)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                                {tc.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-body-sm text-[#8E9196]">{taxCodes.length} tax codes</p>
              </div>
            </div>
            </>
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
      {/* === ADD/EDIT TAX CODE MODAL === */}
      {showTaxModal && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setShowTaxModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowTaxModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[540px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
                <span className="text-white font-semibold text-sm">{taxEditId ? 'Edit Tax Code' : 'Add Tax Code'}</span>
                <button onClick={() => setShowTaxModal(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {taxModalError && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-sm text-red-700">{taxModalError}</p></div>}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="input-label">Code *</label><input type="text" value={taxModalCode} onChange={(e) => setTaxModalCode(e.target.value)} className="input-field w-full" placeholder="e.g. SR-6" autoFocus /></div>
                  <div><label className="input-label">Rate (%)</label><input type="number" value={taxModalRate} onChange={(e) => setTaxModalRate(e.target.value)} className="input-field w-full" step="0.01" min="0" max="100" /></div>
                </div>
                <div><label className="input-label">Description *</label><input type="text" value={taxModalDesc} onChange={(e) => setTaxModalDesc(e.target.value)} className="input-field w-full" placeholder="e.g. Standard Rate SST 6%" /></div>
                <div>
                  <label className="input-label">Tax Type *</label>
                  <select value={taxModalType} onChange={(e) => setTaxModalType(e.target.value)} className="input-field w-full">
                    <option value="">Select type</option>
                    <option value="SST">SST</option>
                    <option value="Service Tax">Service Tax</option>
                    <option value="Zero-rated">Zero-rated</option>
                    <option value="Exempt">Exempt</option>
                    <option value="Out of Scope">Out of Scope</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">GL Account (Tax Payable/Receivable)</label>
                  <select value={taxModalGlId} onChange={(e) => setTaxModalGlId(e.target.value)} className="input-field w-full">
                    <option value="">None</option>
                    {taxGlAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-4 flex-shrink-0 flex gap-3 border-t border-gray-100">
                <button onClick={submitTaxModal} disabled={taxModalSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">{taxModalSaving ? 'Saving...' : taxEditId ? 'Save Changes' : 'Create Tax Code'}</button>
                <button onClick={() => setShowTaxModal(false)} disabled={taxModalSaving} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ CHANGE CONFIRMATION MODAL ═══ */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setConfirmModal(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#191C1E] mb-3">Change {confirmModal.label}</h3>
            <div className="space-y-3 text-sm text-[#434654]">
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                {confirmModal.changes.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[#8E9196] text-xs font-medium uppercase w-12">From</span>
                      <span className="font-medium">{c.from}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#8E9196] text-xs font-medium uppercase w-12">To</span>
                      <span className="font-medium">{c.to}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                Existing journal entries will not be affected. Please review your Journal Entries if any corrections are needed.
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={confirmModal.onConfirm} className="btn-reject flex-1 py-2.5 rounded-lg text-sm font-semibold">Confirm Change</button>
              <button onClick={() => setConfirmModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
