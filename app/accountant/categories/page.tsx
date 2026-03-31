'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/accountant/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/accountant/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/accountant/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Clients',    href: '/accountant/clients',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/accountant/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/accountant/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { label: 'Admins',     href: '/accountant/admins',     icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

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

  // Load firms (once)
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => { if (j.data) setFirms(j.data); })
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

  const defaultCats = categories.filter((c) => c.is_global);
  const customCats  = categories.filter((c) => !c.is_global);
  const hasFirmSelected = !!firmId;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB]">

      {/* === SIDEBAR === */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ backgroundColor: '#152237' }}>
        <div className="h-14 flex items-center gap-2 px-5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#A60201' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white font-bold text-base tracking-tight">Autosettle</span>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map(({ label, href, icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-all duration-150 ${active ? 'text-white bg-white/[0.1]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'}`}>
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-bold">{(session?.user?.name ?? '?')[0]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '---'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left">Sign out</button>
        </div>
      </aside>

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Categories</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className="input-field">
              <option value="">All Firms</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>

            {hasFirmSelected && (
              <button
                onClick={openAddModal}
                className="ml-auto text-sm px-4 py-2 rounded-md font-medium text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                Add Custom Category
              </button>
            )}
          </div>

          {!hasFirmSelected ? (
            /* ── No firm selected: flat list of all categories ── */
            <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              {loading ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
              ) : categories.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">No categories found.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-2.5">Category Name</th>
                        <th className="px-5 py-2.5">Type</th>
                        <th className="px-5 py-2.5">Firm</th>
                        <th className="px-5 py-2.5">Tax Code</th>
                        <th className="px-5 py-2.5 text-right">Claims</th>
                        <th className="px-5 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat, i) => (
                        <tr key={cat.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < categories.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <td className="px-5 py-3 text-gray-900 font-medium">{cat.name}</td>
                          <td className="px-5 py-3">
                            {cat.is_global
                              ? <span className="badge-blue">Default</span>
                              : <span className="badge-purple">Custom</span>
                            }
                          </td>
                          <td className="px-5 py-3 text-gray-600">{cat.firm_name ?? 'Global'}</td>
                          <td className="px-5 py-3 text-gray-600">{cat.tax_code ?? '---'}</td>
                          <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{cat.claims_count}</td>
                          <td className="px-5 py-3">
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
            <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : (
            <>
              {/* ── Default Categories ── */}
              <section>
                <h2 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Default Categories</h2>
                <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  {defaultCats.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">No default categories available.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          <th className="px-5 py-2.5">Category Name</th>
                          <th className="px-5 py-2.5">Type</th>
                          <th className="px-5 py-2.5">Tax Code</th>
                          <th className="px-5 py-2.5 text-right">Claims</th>
                          <th className="px-5 py-2.5">Status</th>
                          <th className="px-5 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultCats.map((cat, i) => (
                          <tr key={cat.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < defaultCats.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-5 py-3 text-gray-900 font-medium">{cat.name}</td>
                            <td className="px-5 py-3"><span className="badge-blue">Default</span></td>
                            <td className="px-5 py-3 text-gray-600">{cat.tax_code ?? '---'}</td>
                            <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{cat.claims_count}</td>
                            <td className="px-5 py-3">
                              {cat.is_active
                                ? <span className="badge-green">Active</span>
                                : <span className="badge-gray">Disabled</span>
                              }
                            </td>
                            <td className="px-5 py-3">
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
                <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  {customCats.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">No custom categories yet. Add one above.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          <th className="px-5 py-2.5">Category Name</th>
                          <th className="px-5 py-2.5">Type</th>
                          <th className="px-5 py-2.5">Tax Code</th>
                          <th className="px-5 py-2.5 text-right">Claims</th>
                          <th className="px-5 py-2.5">Status</th>
                          <th className="px-5 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customCats.map((cat, i) => (
                          <tr key={cat.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < customCats.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-5 py-3 text-gray-900 font-medium">{cat.name}</td>
                            <td className="px-5 py-3"><span className="badge-purple">Custom</span></td>
                            <td className="px-5 py-3 text-gray-600">{cat.tax_code ?? '---'}</td>
                            <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{cat.claims_count}</td>
                            <td className="px-5 py-3">
                              {cat.is_active
                                ? <span className="badge-green">Active</span>
                                : <span className="badge-gray">Inactive</span>
                              }
                            </td>
                            <td className="px-5 py-3">
                              <button
                                onClick={() => toggleActive(cat)}
                                className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                              >
                                {cat.is_active ? 'Deactivate' : 'Activate'}
                              </button>
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
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Custom Category</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new category for {firms.find((f) => f.id === firmId)?.name ?? 'the selected firm'}.</p>

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
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {modalSaving ? 'Creating...' : 'Create Category'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
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
