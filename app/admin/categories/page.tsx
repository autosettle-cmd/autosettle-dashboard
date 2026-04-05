'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  name: string;
  tax_code: string | null;
  claims_count: number;
  is_active: boolean;
  is_global: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminCategoriesPage() {
  // Data
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Load categories (full list with override info)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/admin/categories/full')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setCategories(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleActive = async (cat: CategoryRow) => {
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !cat.is_active }),
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

    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalName.trim(),
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
      const res = await fetch(`/api/admin/categories/${editingId}`, {
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
      const res = await fetch(`/api/admin/categories/${deleteId}`, { method: 'DELETE' });
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex h-screen overflow-hidden bg-[#F5F6F8] ${jakarta.className}`}>

      {/* === SIDEBAR === */}
      <Sidebar role="admin" />

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Categories</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">

          {/* ── Add button ── */}
          <div className="flex items-center justify-end">
            <button
              onClick={openAddModal}
              className="btn-primary text-sm px-4 py-2 rounded-xl font-medium text-white transition-opacity hover:opacity-85"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Add Custom Category
            </button>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : (
            <>
              {/* ── Default Categories ── */}
              <section>
                <h2 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Default Categories</h2>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)' }}>
                  {defaultCats.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">No default categories available.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                          <th className="px-6 py-2.5">Category Name</th>
                          <th className="px-6 py-2.5">Type</th>
                          <th className="px-6 py-2.5">Tax Code</th>
                          <th className="px-6 py-2.5 text-right">Claims</th>
                          <th className="px-6 py-2.5">Status</th>
                          <th className="px-6 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultCats.map((cat, i) => (
                          <tr key={cat.id} className={`group text-[13px] hover:bg-gray-50/50 transition-colors ${i < defaultCats.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-6 py-3 text-gray-900 font-medium">{cat.name}</td>
                            <td className="px-6 py-3"><span className="badge-blue">Default</span></td>
                            <td className="px-6 py-3 text-gray-600">{cat.tax_code ?? '---'}</td>
                            <td className="px-6 py-3 text-gray-900 font-semibold text-right tabular-nums">{cat.claims_count}</td>
                            <td className="px-6 py-3">
                              {cat.is_active ? (
                                <span className="badge-green">Active</span>
                              ) : (
                                <span className="badge-gray">Disabled</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <button
                                onClick={() => toggleActive(cat)}
                                className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                              >
                                {cat.is_active ? 'Disable' : 'Enable'}
                              </button>
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
                <h2 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Custom Categories</h2>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)' }}>
                  {customCats.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">No custom categories yet. Add one above.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                          <th className="px-6 py-2.5">Category Name</th>
                          <th className="px-6 py-2.5">Type</th>
                          <th className="px-6 py-2.5">Tax Code</th>
                          <th className="px-6 py-2.5 text-right">Claims</th>
                          <th className="px-6 py-2.5">Status</th>
                          <th className="px-6 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customCats.map((cat, i) => (
                          <tr key={cat.id} className={`group text-[13px] hover:bg-gray-50/50 transition-colors ${i < customCats.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-6 py-3 text-gray-900 font-medium">
                              {editingId === cat.id ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field w-full text-[13px]" autoFocus />
                              ) : cat.name}
                            </td>
                            <td className="px-6 py-3"><span className="badge-purple">Custom</span></td>
                            <td className="px-6 py-3 text-gray-600">
                              {editingId === cat.id ? (
                                <input type="text" value={editTaxCode} onChange={(e) => setEditTaxCode(e.target.value)} className="input-field w-full text-[13px]" placeholder="Optional" />
                              ) : (cat.tax_code ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-gray-900 font-semibold text-right tabular-nums">{cat.claims_count}</td>
                            <td className="px-6 py-3">
                              {cat.is_active ? (
                                <span className="badge-green">Active</span>
                              ) : (
                                <span className="badge-gray">Inactive</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-1.5">
                                {editingId === cat.id ? (
                                  <>
                                    <button
                                      onClick={saveEdit}
                                      disabled={editSaving}
                                      className="btn-primary text-xs font-medium px-3 py-1.5 rounded-xl text-white transition-opacity hover:opacity-85 disabled:opacity-40"
                                      style={{ backgroundColor: 'var(--accent)' }}
                                    >
                                      {editSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      disabled={editSaving}
                                      className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => toggleActive(cat)}
                                      className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                                    >
                                      {cat.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      onClick={() => startEdit(cat)}
                                      className="p-1.5 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                                      title="Edit"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => confirmDelete(cat)}
                                      className="p-1.5 rounded-md border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
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

      {/* === ADD CATEGORY MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Add Custom Category</h3>
                <p className="text-sm text-gray-500 mt-1">Create a new category for your firm.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Name *</label>
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
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tax Code</label>
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
                className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {modalSaving ? 'Creating...' : 'Create Category'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900">Delete Category</h3>
            <p className="text-sm text-gray-500 mt-1 mb-5">Are you sure you want to delete this category? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
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
