'use client';

import { useState, useEffect, useRef } from 'react';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';
import SearchButton from '@/components/SearchButton';

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
  gl_account_id: string | null;
  gl_account_label: string | null;
}

interface GLAccountOption {
  id: string;
  account_code: string;
  name: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CategoriesPage() {
  usePageTitle('Categories');
  const { firms, firmId, firmsLoaded } = useFirm();

  // Data
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // GL accounts for dropdown (cached per firm — don't change mid-session)
  const [glAccounts, setGlAccounts] = useState<GLAccountOption[]>([]);
  const glCacheRef = useRef<Record<string, GLAccountOption[]>>({});

  // Modal
  const [showModal, setShowModal]       = useState(false);
  const [modalName, setModalName]       = useState('');
  const [modalTaxCode, setModalTaxCode] = useState('');
  const [modalGlAccountId, setModalGlAccountId] = useState('');
  const [modalError, setModalError]     = useState('');
  const [modalSaving, setModalSaving]   = useState(false);

  // Inline edit
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [editTaxCode, setEditTaxCode]   = useState('');
  const [editGlAccountId, setEditGlAccountId] = useState('');
  const [editSaving, setEditSaving]     = useState(false);

  // Delete
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Load categories
  useEffect(() => {
    if (!firmsLoaded) return;
    let cancelled = false;
    setLoading(true);

    const p = new URLSearchParams();
    if (firmId) p.set('firmId', firmId);

    fetch(`/api/categories?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setCategories(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, refreshKey, firmsLoaded]);

  // Load GL accounts when firm changes (cached per firm)
  useEffect(() => {
    if (!firmId) { setGlAccounts([]); return; }
    if (glCacheRef.current[firmId]) { setGlAccounts(glCacheRef.current[firmId]); return; }
    let cancelled = false;
    fetch(`/api/gl-accounts?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { const data = j.data ?? []; glCacheRef.current[firmId] = data; setGlAccounts(data); } })
      .catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [firmId]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleActive = async (cat: CategoryRow) => {
    try {
      const body: Record<string, unknown> = { is_active: !cat.is_active };
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
    setModalGlAccountId('');
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

      if (modalGlAccountId && json.data?.id) {
        await fetch(`/api/categories/${json.data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gl_account_id: modalGlAccountId, firmId }),
        });
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
    setEditGlAccountId(cat.gl_account_id ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditTaxCode('');
    setEditGlAccountId('');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const patchBody: Record<string, unknown> = {
        name: editName.trim(),
        tax_code: editTaxCode.trim() || null,
        gl_account_id: editGlAccountId || null,
      };
      if (firmId) patchBody.firmId = firmId;
      const res = await fetch(`/api/categories/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
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
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Categories</h1>
          <SearchButton />
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture ledger-binding animate-in">

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {hasFirmSelected && (
              <button
                onClick={openAddModal}
                className="ml-auto btn-thick-navy text-sm px-4 py-2 font-medium"
              >
                Add Custom Category
              </button>
            )}
          </div>

          {!hasFirmSelected ? (
            <div className="bg-white overflow-hidden">
              {loading ? (
                <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : categories.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">No categories found.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Category Name</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Firm</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Tax Code</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Claims</th>
                        <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat, i) => (
                        <tr key={cat.id} className={`group text-body-md hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                          <td className="px-6 py-3 text-[var(--text-primary)] font-medium">{cat.name}</td>
                          <td className="px-6 py-3">
                            {cat.is_global
                              ? <span className="badge-blue">Default</span>
                              : <span className="badge-purple">Custom</span>
                            }
                          </td>
                          <td className="px-6 py-3 text-[var(--text-secondary)]">{cat.firm_name ?? 'Global'}</td>
                          <td className="px-6 py-3 text-[var(--text-secondary)]">{cat.tax_code ?? '---'}</td>
                          <td className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{cat.claims_count}</td>
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
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : (
            <>
              {/* ── Default Categories ── */}
              <section>
                <h2 className="text-xs font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Default Categories</h2>
                <div className="bg-white overflow-hidden">
                  {defaultCats.length === 0 ? (
                    <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">No default categories available.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Category Name</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Tax Code</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">GL Account</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Claims</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultCats.map((cat, i) => (
                          <tr key={cat.id} className={`group text-body-md hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-medium">
                              {editingId === cat.id ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-recessed w-full text-body-md" autoFocus />
                              ) : cat.name}
                            </td>
                            <td className="px-6 py-3"><span className="badge-blue">Default</span></td>
                            <td className="px-6 py-3 text-[var(--text-secondary)]">
                              {editingId === cat.id ? (
                                <input type="text" value={editTaxCode} onChange={(e) => setEditTaxCode(e.target.value)} className="input-recessed w-full text-body-md" placeholder="Optional" />
                              ) : (cat.tax_code ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-[var(--text-secondary)]">
                              {editingId === cat.id ? (
                                <select value={editGlAccountId} onChange={(e) => setEditGlAccountId(e.target.value)} className="input-recessed w-full text-body-md">
                                  <option value="">No GL assigned</option>
                                  {glAccounts.map((gl) => (
                                    <option key={gl.id} value={gl.id}>{gl.account_code} — {gl.name}</option>
                                  ))}
                                </select>
                              ) : (cat.gl_account_label ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{cat.claims_count}</td>
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
                                    <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy text-xs font-medium px-3 py-1.5 disabled:opacity-40">
                                      {editSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button onClick={cancelEdit} disabled={editSaving} className="btn-thick-white text-xs font-medium px-3 py-1.5">
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => toggleActive(cat)} className="btn-thick-white text-xs font-medium px-3 py-1.5">
                                      {cat.is_active ? 'Disable' : 'Enable'}
                                    </button>
                                    <button onClick={() => startEdit(cat)} className="btn-thick-white p-1.5" title="Edit">
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
                <h2 className="text-xs font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Custom Categories</h2>
                <div className="bg-white overflow-hidden">
                  {customCats.length === 0 ? (
                    <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">No custom categories yet. Add one above.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Category Name</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Tax Code</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">GL Account</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Claims</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                          <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customCats.map((cat, i) => (
                          <tr key={cat.id} className={`group text-body-md hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
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
                            <td className="px-6 py-3 text-[var(--text-secondary)]">
                              {editingId === cat.id ? (
                                <select value={editGlAccountId} onChange={(e) => setEditGlAccountId(e.target.value)} className="input-recessed w-full text-body-md">
                                  <option value="">No GL assigned</option>
                                  {glAccounts.map((gl) => (
                                    <option key={gl.id} value={gl.id}>{gl.account_code} — {gl.name}</option>
                                  ))}
                                </select>
                              ) : (cat.gl_account_label ?? '---')}
                            </td>
                            <td className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{cat.claims_count}</td>
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

      {/* === ADD CUSTOM CATEGORY MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Add Custom Category</h3>
              <p className="text-xs text-white/70 mt-1">Create a new category for {firms.find((f) => f.id === firmId)?.name ?? 'the selected firm'}.</p>
            </div>

            <div className="p-6 space-y-3">
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
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">GL Account</label>
                <select
                  value={modalGlAccountId}
                  onChange={(e) => setModalGlAccountId(e.target.value)}
                  className="input-recessed w-full"
                >
                  <option value="">No GL assigned</option>
                  {glAccounts.map((gl) => (
                    <option key={gl.id} value={gl.id}>{gl.account_code} — {gl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={submitCategory}
                disabled={modalSaving}
                className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Category'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === DELETE CONFIRMATION MODAL === */}
      {deleteId && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-sm flex flex-col">
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Delete Category</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-[var(--text-secondary)]">Are you sure you want to delete this category? This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold btn-thick-red disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
