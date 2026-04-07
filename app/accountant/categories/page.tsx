'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  name: string;
  firm_id: string | null;
  firm_name: string | null;
  tax_code: string | null;
  claims_count: number;
  is_active: boolean;
  is_global: boolean;
}

interface Firm {
  id: string;
  name: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CategoriesPage() {
  usePageTitle('Categories');
  // Data
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [firms, setFirms]           = useState<Firm[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [firmId, setFirmId] = useState('');

  // Modal
  const [showModal, setShowModal]       = useState(false);
  const [modalName, setModalName]       = useState('');
  const [modalTaxCode, setModalTaxCode] = useState('');
  const [modalError, setModalError]     = useState('');
  const [modalSaving, setModalSaving]   = useState(false);

  // Inline edit
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [editTaxCode, setEditTaxCode]   = useState('');
  const [editSaving, setEditSaving]     = useState(false);

  // Delete
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Load firms (once)
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

  // Load categories
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const p = new URLSearchParams();
    if (firmId) p.set('firmId', firmId);

    fetch(`/api/categories?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setCategories(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, refreshKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleActive = async (cat: CategoryRow) => {
    try {
      const body: Record<string, unknown> = { is_active: !cat.is_active };
      // For global categories, include firmId so the API creates/updates an override
      if (cat.is_global && firmId) {
        body.firmId = firmId;
      }

      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const openAddModal = () => {
    setModalName('');
    setModalTaxCode('');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitCategory = async () => {
    if (!modalName.trim()) {
      setModalError('Name is required.');
      return;
    }
    if (!firmId) {
      setModalError('Please select a firm first.');
      return;
    }

    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalName.trim(),
          firmId,
          taxCode: modalTaxCode.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to create category');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  const startEdit = (cat: CategoryRow) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditTaxCode(cat.tax_code ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditTaxCode('');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/categories/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), tax_code: editTaxCode.trim() || null }),
      });
      if (res.ok) {
        cancelEdit();
        refresh();
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to save');
      }
    } catch {
      alert('Network error');
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = (cat: CategoryRow) => {
    setDeleteId(cat.id);
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/categories/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteId(null);
        refresh();
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to delete');
      }
    } catch {
      alert('Network error');
    } finally {
      setDeleting(false);
    }
  };

  const defaultCats = categories.filter((c) => c.is_global);
  const customCats  = categories.filter((c) => !c.is_global);
  const hasFirmSelected = !!firmId;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      <Sidebar role="accountant" />

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Categories</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className="input-field">
                <option value="">All Firms</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}

            {hasFirmSelected && (
              <button
                onClick={openAddModal}
                className="ml-auto btn-primary text-sm px-4 py-2 rounded-lg font-medium"
              >
                Add Custom Category
              </button>
            )}
          </div>

          {!hasFirmSelected ? (
            /* ── No firm selected: flat list of all categories ── */
            <div className="bg-white rounded-lg overflow-hidden">
              {loading ? (
                <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
              ) : categories.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[#8E9196]">No categories found.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="ds-table-header text-left">
                        <th className="px-6 py-2.5">Category Name</th>
                        <th className="px-6 py-2.5">Type</th>
                        <th className="px-6 py-2.5">Firm</th>
                        <th className="px-6 py-2.5">Tax Code</th>
                        <th className="px-6 py-2.5 text-right">Claims</th>
                        <th className="px-6 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                          <td className="px-6 py-3 text-[#191C1E] font-medium">{cat.name}</td>
                          <td className="px-6 py-3">
                            {cat.is_global
                              ? <span className="badge-blue">Default</span>
                              : <span className="badge-purple">Custom</span>
                            }
                          </td>
                          <td className="px-6 py-3 text-[#434654]">{cat.firm_name ?? 'Global'}</td>
                          <td className="px-6 py-3 text-[#434654]">{cat.tax_code ?? '---'}</td>
                          <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{cat.claims_count}</td>
                          <td className="px-6 py-3">
                            {cat.is_active
                              ? <span className="badge-green">Active</span>
                              : <span className="badge-gray">Inactive</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : (
            <>
              {/* ── Default Categories ── */}
              <section>
                <h2 className="text-body-md font-semibold text-[#434654] uppercase tracking-wide mb-3">Default Categories</h2>
                <div className="bg-white rounded-lg overflow-hidden">
                  {defaultCats.length === 0 ? (
                    <div className="px-6 py-8 text-center text-sm text-[#8E9196]">No default categories available.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="ds-table-header text-left">
                          <th className="px-6 py-2.5">Category Name</th>
                          <th className="px-6 py-2.5">Type</th>
                          <th className="px-6 py-2.5">Tax Code</th>
                          <th className="px-6 py-2.5 text-right">Claims</th>
                          <th className="px-6 py-2.5">Status</th>
                          <th className="px-6 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultCats.map((cat) => (
                          <tr key={cat.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                            <td className="px-6 py-3 text-[#191C1E] font-medium">
                              {editingId === cat.id ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field w-full text-body-md" autoFocus />
                              ) : cat.name}
                            </td>
                            <td className="px-6 py-3"><span className="badge-blue">Default</span></td>
                            <td className="px-6 py-3 text-[#434654]">
                              {editingId === cat.id ? (
                                <input type="text" value={editTaxCode} onChange={(e) => setEditTaxCode(e.target.value)} className="input-field w-full text-body-md" placeholder="Optional" />
                              ) : (cat.tax_code ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{cat.claims_count}</td>
                            <td className="px-6 py-3">
                              {cat.is_active
                                ? <span className="badge-green">Active</span>
                                : <span className="badge-gray">Disabled</span>
                              }
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-1.5">
                                {editingId === cat.id ? (
                                  <>
                                    <button onClick={saveEdit} disabled={editSaving} className="text-xs font-medium px-3 py-1.5 rounded-lg btn-primary disabled:opacity-40">
                                      {editSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button onClick={cancelEdit} disabled={editSaving} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => toggleActive(cat)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors">
                                      {cat.is_active ? 'Disable' : 'Enable'}
                                    </button>
                                    <button onClick={() => startEdit(cat)} className="p-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#434654] transition-colors" title="Edit">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* ── Custom Categories ── */}
              <section>
                <h2 className="text-body-md font-semibold text-[#434654] uppercase tracking-wide mb-3">Custom Categories</h2>
                <div className="bg-white rounded-lg overflow-hidden">
                  {customCats.length === 0 ? (
                    <div className="px-6 py-8 text-center text-sm text-[#8E9196]">No custom categories yet. Add one above.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="ds-table-header text-left">
                          <th className="px-6 py-2.5">Category Name</th>
                          <th className="px-6 py-2.5">Type</th>
                          <th className="px-6 py-2.5">Tax Code</th>
                          <th className="px-6 py-2.5 text-right">Claims</th>
                          <th className="px-6 py-2.5">Status</th>
                          <th className="px-6 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customCats.map((cat) => (
                          <tr key={cat.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                            <td className="px-6 py-3 text-[#191C1E] font-medium">
                              {editingId === cat.id ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field w-full text-body-md" autoFocus />
                              ) : cat.name}
                            </td>
                            <td className="px-6 py-3"><span className="badge-purple">Custom</span></td>
                            <td className="px-6 py-3 text-[#434654]">
                              {editingId === cat.id ? (
                                <input type="text" value={editTaxCode} onChange={(e) => setEditTaxCode(e.target.value)} className="input-field w-full text-body-md" placeholder="Optional" />
                              ) : (cat.tax_code ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{cat.claims_count}</td>
                            <td className="px-6 py-3">
                              {cat.is_active
                                ? <span className="badge-green">Active</span>
                                : <span className="badge-gray">Inactive</span>
                              }
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-1.5">
                                {editingId === cat.id ? (
                                  <>
                                    <button
                                      onClick={saveEdit}
                                      disabled={editSaving}
                                      className="text-xs font-medium px-3 py-1.5 rounded-lg btn-primary disabled:opacity-40"
                                    >
                                      {editSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      disabled={editSaving}
                                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => toggleActive(cat)}
                                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
                                    >
                                      {cat.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      onClick={() => startEdit(cat)}
                                      className="p-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#434654] transition-colors"
                                      title="Edit"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => confirmDelete(cat)}
                                      className="p-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                      title="Delete"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </>
          )}

        </main>
      </div>

      {/* === ADD CUSTOM CATEGORY MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-[#191C1E]">Add Custom Category</h3>
            <p className="text-sm text-[#434654] mt-1 mb-4">Create a new category for {firms.find((f) => f.id === firmId)?.name ?? 'the selected firm'}.</p>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Name *</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Category name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Tax Code</label>
                <input
                  type="text"
                  value={modalTaxCode}
                  onChange={(e) => setModalTaxCode(e.target.value)}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitCategory}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Category'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === DELETE CONFIRMATION MODAL === */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#191C1E]">Delete Category</h3>
            <p className="text-sm text-[#434654] mt-1 mb-5">Are you sure you want to delete this category? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
