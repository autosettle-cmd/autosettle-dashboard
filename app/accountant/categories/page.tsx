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
  firm_name: string;
  firm_id: string;
  tax_code: string | null;
  claims_count: number;
  is_active: boolean;
}

interface Firm {
  id: string;
  name: string;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard'   },
  { label: 'Claims',     href: '/accountant/claims'      },
  { label: 'Receipts',   href: '/accountant/receipts'    },
  { label: 'Clients',    href: '/accountant/clients'     },
  { label: 'Employees',  href: '/accountant/employees'   },
  { label: 'Categories', href: '/accountant/categories'  },
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
  const [modalFirmId, setModalFirmId]   = useState('');
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
      const res = await fetch(`/api/categories/${cat.id}`, {
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
    setModalFirmId(firms.length === 1 ? firms[0].id : '');
    setModalTaxCode('');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitCategory = async () => {
    if (!modalName.trim() || !modalFirmId) {
      setModalError('Name and firm are required.');
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
          firmId: modalFirmId,
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#152237' }}>
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <span className="text-white font-bold text-xl tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center h-10 px-6 text-sm transition-colors ${
                  active ? 'text-white bg-white/10' : 'text-white/65 hover:text-white hover:bg-white/5'
                }`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r"
                    style={{ backgroundColor: '#A60201' }}
                  />
                )}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-white text-sm font-medium truncate">{session?.user?.name ?? '—'}</p>
          <p className="text-white/50 text-xs mt-0.5 capitalize">{session?.user?.role ?? 'accountant'}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs text-white/60 hover:text-white py-1.5 px-3 rounded border border-white/20 hover:border-white/40 transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center px-6" style={{ backgroundColor: '#152237' }}>
          <h1 className="text-white font-semibold text-lg">Categories</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 bg-white">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Select value={firmId} onChange={setFirmId}>
              <option value="">All Firms</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>

            <button
              onClick={openAddModal}
              className="ml-auto text-sm px-4 py-2 rounded-md font-medium text-white transition-opacity hover:opacity-85"
              style={{ backgroundColor: '#A60201' }}
            >
              Add Category
            </button>
          </div>

          {/* ── Table ─────────────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : categories.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No categories found.</div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                      <th className="px-5 py-3">Category Name</th>
                      <th className="px-5 py-3">Firm</th>
                      <th className="px-5 py-3">Tax Code</th>
                      <th className="px-5 py-3 text-right">Claims</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {categories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3 text-gray-900 font-medium">{cat.name}</td>
                        <td className="px-5 py-3 text-gray-600">{cat.firm_name}</td>
                        <td className="px-5 py-3 text-gray-600">{cat.tax_code ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium text-right">{cat.claims_count}</td>
                        <td className="px-5 py-3">
                          {cat.is_active ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                              Inactive
                            </span>
                          )}
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
              </div>
            )}
          </div>

        </main>
      </div>

      {/* ═══════════════════════ ADD CATEGORY MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Category</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new category record.</p>

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
                  className={`${inputCls} w-full`}
                  placeholder="Category name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Firm *</label>
                <select
                  value={modalFirmId}
                  onChange={(e) => setModalFirmId(e.target.value)}
                  className={`${inputCls} w-full`}
                >
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tax Code</label>
                <input
                  type="text"
                  value={modalTaxCode}
                  onChange={(e) => setModalTaxCode(e.target.value)}
                  className={`${inputCls} w-full`}
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

// ─── Small reusable sub-components ────────────────────────────────────────────

const inputCls = 'text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#152237]/20';

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {children}
    </select>
  );
}
