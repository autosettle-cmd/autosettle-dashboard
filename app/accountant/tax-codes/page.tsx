'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GLAccountRef {
  id: string;
  account_code: string;
  name: string;
}

interface TaxCodeRow {
  id: string;
  firm_id: string;
  code: string;
  description: string;
  rate: string;
  tax_type: string;
  gl_account_id: string | null;
  glAccount: GLAccountRef | null;
  is_active: boolean;
}

interface GLAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
}

interface Firm {
  id: string;
  name: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TaxCodesPage() {
  const [taxCodes, setTaxCodes] = useState<TaxCodeRow[]>([]);
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [modalCode, setModalCode] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [modalRate, setModalRate] = useState('');
  const [modalType, setModalType] = useState('');
  const [modalGlId, setModalGlId] = useState('');
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

  // Load tax codes + GL accounts
  useEffect(() => {
    if (!firmId) { setTaxCodes([]); setGlAccounts([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/tax-codes?firmId=${firmId}`).then((r) => r.json()),
      fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()),
    ])
      .then(([tcJson, glJson]) => {
        if (!cancelled) {
          setTaxCodes(tcJson.data ?? []);
          setGlAccounts(glJson.data ?? []);
          setLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // ─── Modal ────────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditId(null);
    setModalCode('');
    setModalDesc('');
    setModalRate('0');
    setModalType('SST');
    setModalGlId('');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const openEditModal = (tc: TaxCodeRow) => {
    setEditId(tc.id);
    setModalCode(tc.code);
    setModalDesc(tc.description);
    setModalRate(String(tc.rate));
    setModalType(tc.tax_type);
    setModalGlId(tc.gl_account_id ?? '');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitModal = async () => {
    if (!modalCode.trim() || !modalDesc.trim() || !modalType.trim()) {
      setModalError('Code, description, and tax type are required.');
      return;
    }
    setModalSaving(true);
    setModalError('');

    try {
      const url = editId ? `/api/tax-codes/${editId}` : '/api/tax-codes';
      const method = editId ? 'PATCH' : 'POST';
      const body = editId
        ? { code: modalCode.trim(), description: modalDesc.trim(), rate: parseFloat(modalRate), tax_type: modalType.trim(), gl_account_id: modalGlId || null }
        : { firmId, code: modalCode.trim(), description: modalDesc.trim(), rate: parseFloat(modalRate), tax_type: modalType.trim(), gl_account_id: modalGlId || null };

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

  const toggleActive = async (tc: TaxCodeRow) => {
    try {
      await fetch(`/api/tax-codes/${tc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tc.is_active }),
      });
      refresh();
    } catch {
      alert('Network error');
    }
  };

  // Filter GL accounts to liability/asset types (tax accounts)
  const taxGlAccounts = glAccounts.filter((a) => ['Asset', 'Liability'].includes(a.account_type));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6F8]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Tax Codes</h1>
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

            {firmId && (
              <button onClick={openAddModal} className="ml-auto btn-primary text-sm px-4 py-2 rounded-lg font-semibold">
                Add Tax Code
              </button>
            )}
          </div>

          {!firmId ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Select a firm to manage tax codes.</div>
          ) : loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : taxCodes.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <h3 className="text-base font-semibold text-[#191C1E] mb-1">No Tax Codes</h3>
              <p className="text-sm text-[#8E9196] mb-6">Seed the default Malaysian SST tax codes, or add them manually.</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/gl-accounts/seed', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ firmId }),
                      });
                      if (res.ok) refresh();
                      else { const j = await res.json(); alert(j.error || 'Failed'); }
                    } catch { alert('Network error'); }
                  }}
                  className="btn-primary text-sm px-6 py-2.5 rounded-lg font-semibold"
                >
                  Seed Default SST Codes
                </button>
                <button onClick={openAddModal} className="text-sm px-6 py-2.5 rounded-lg font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                  Add Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg overflow-hidden">
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
                        <td className="px-3 py-3 text-[#434654] text-xs">
                          {tc.glAccount ? `${tc.glAccount.account_code} — ${tc.glAccount.name}` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {tc.is_active
                            ? <span className="badge-green">Active</span>
                            : <span className="badge-gray">Inactive</span>
                          }
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEditModal(tc)} className="p-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors" title="Edit">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button onClick={() => toggleActive(tc)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                              {tc.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-body-sm text-[#8E9196]">{taxCodes.length} tax codes</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* === ADD/EDIT TAX CODE MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setShowModal(false)} />
      )}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[540px] max-h-[90vh] flex flex-col animate-in">
            <div className="h-14 flex items-center justify-between px-5 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <span className="text-white font-semibold text-sm">{editId ? 'Edit Tax Code' : 'Add Tax Code'}</span>
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
                  <label className="input-label">Code *</label>
                  <input type="text" value={modalCode} onChange={(e) => setModalCode(e.target.value)} className="input-field w-full" placeholder="e.g. SR-6" autoFocus />
                </div>
                <div>
                  <label className="input-label">Rate (%)</label>
                  <input type="number" value={modalRate} onChange={(e) => setModalRate(e.target.value)} className="input-field w-full" step="0.01" min="0" max="100" />
                </div>
              </div>

              <div>
                <label className="input-label">Description *</label>
                <input type="text" value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className="input-field w-full" placeholder="e.g. Standard Rate SST 6%" />
              </div>

              <div>
                <label className="input-label">Tax Type *</label>
                <select value={modalType} onChange={(e) => setModalType(e.target.value)} className="input-field w-full">
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
                <select value={modalGlId} onChange={(e) => setModalGlId(e.target.value)} className="input-field w-full">
                  <option value="">None</option>
                  {taxGlAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3 border-t border-gray-100">
              <button onClick={submitModal} disabled={modalSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
                {modalSaving ? 'Saving...' : editId ? 'Save Changes' : 'Create Tax Code'}
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
