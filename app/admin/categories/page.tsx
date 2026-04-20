'use client';

import { useState, useEffect } from 'react';
import { usePageTitle } from '@/lib/use-page-title';
import SearchButton from '@/components/SearchButton';
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
  usePageTitle('Categories');
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
    <>
      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Categories</h1>
          <SearchButton />
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture animate-in">

          {/* ── Add button ── */}
          <div className="flex items-center justify-end">
            <button
              onClick={openAddModal}
              className="btn-thick-navy text-sm px-4 py-2 font-medium"
            >
              Add Custom Category
            </button>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : (
            <>
              {/* ── Default Categories ── */}
              <section>
                <h2 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Default Categories</h2>
                <div className="bg-white overflow-hidden">
                  {defaultCats.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">No default categories available.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Category Name</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Tax Code</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Claims</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultCats.map((cat, idx) => (
                          <tr key={cat.id} className={`group text-body-md hover:bg-[var(--surface-low)] transition-colors ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-medium">{cat.name}</td>
                            <td className="px-6 py-3"><span className="badge-blue">Default</span></td>
                            <td className="px-6 py-3 text-[var(--text-secondary)]">{cat.tax_code ?? '---'}</td>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{cat.claims_count}</td>
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
                                className="btn-thick-white text-xs font-medium px-3 py-1.5"
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
                <h2 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Custom Categories</h2>
                <div className="bg-white overflow-hidden">
                  {customCats.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">No custom categories yet. Add one above.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Category Name</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Tax Code</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Claims</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customCats.map((cat, idx) => (
                          <tr key={cat.id} className={`group text-body-md hover:bg-[var(--surface-low)] transition-colors ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-medium">
                              {editingId === cat.id ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-recessed w-full text-body-md" autoFocus />
                              ) : cat.name}
                            </td>
                            <td className="px-6 py-3"><span className="badge-purple">Custom</span></td>
                            <td className="px-6 py-3 text-[var(--text-secondary)]">
                              {editingId === cat.id ? (
                                <input type="text" value={editTaxCode} onChange={(e) => setEditTaxCode(e.target.value)} className="input-recessed w-full text-body-md" placeholder="Optional" />
                              ) : (cat.tax_code ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{cat.claims_count}</td>
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
                                      className="btn-thick-navy text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                                    >
                                      {editSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      disabled={editSaving}
                                      className="btn-thick-white text-xs font-medium px-3 py-1.5"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => toggleActive(cat)}
                                      className="btn-thick-white text-xs font-medium px-3 py-1.5"
                                    >
                                      {cat.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      onClick={() => startEdit(cat)}
                                      className="btn-thick-white p-1.5"
                                      title="Edit"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => confirmDelete(cat)}
                                      className="btn-thick-red p-1.5"
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
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60]" onClick={() => setShowModal(false)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-md flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Add Custom Category</h3>
                <button onClick={() => setShowModal(false)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Create a new category for your firm.</p>

                {modalError && (
                  <div className="bg-[var(--error-container)] p-3">
                    <p className="text-sm text-[var(--on-error-container)]">{modalError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Category name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Tax Code</label>
                  <input
                    type="text"
                    value={modalTaxCode}
                    onChange={(e) => setModalTaxCode(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex gap-3 p-5 bg-[var(--surface-low)]">
                <button
                  onClick={submitCategory}
                  disabled={modalSaving}
                  className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {modalSaving ? 'Creating...' : 'Create Category'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  disabled={modalSaving}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* === DELETE CONFIRMATION MODAL === */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60]" onClick={() => setDeleteId(null)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-sm flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Delete Category</h3>
                <button onClick={() => setDeleteId(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>
              <div className="p-5">
                <p className="text-sm text-[var(--text-secondary)] mb-5">Are you sure you want to delete this category? This action cannot be undone.</p>
              </div>
              <div className="flex gap-3 p-5 bg-[var(--surface-low)]">
                <button
                  onClick={executeDelete}
                  disabled={deleting}
                  className="btn-thick-red flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setDeleteId(null)}
                  disabled={deleting}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </>
  );
}
