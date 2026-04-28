'use client';

import { useState, useEffect } from 'react';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminRow {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminsPage() {
  usePageTitle('Admins');
  const { firms, firmId, firmsLoaded } = useFirm();

  // Data
  const [admins, setAdmins]         = useState<AdminRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal
  const [showModal, setShowModal]         = useState(false);
  const [modalName, setModalName]         = useState('');
  const [modalEmail, setModalEmail]       = useState('');
  const [modalPhone, setModalPhone]       = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError]       = useState('');
  const [modalSaving, setModalSaving]     = useState(false);

  // Load admins (when firmId changes)
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmId) {
      setAdmins([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/accountant/admins?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setAdmins(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, refreshKey, firmsLoaded]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleActive = async (admin: AdminRow) => {
    try {
      const res = await fetch(`/api/accountant/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: admin.status !== 'active' }),
      });
      if (res.ok) refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const openAddModal = () => {
    setModalName('');
    setModalEmail('');
    setModalPhone('');
    setModalPassword('');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitAdmin = async () => {
    if (!modalName.trim() || !modalEmail.trim() || !modalPhone.trim() || !modalPassword.trim()) {
      setModalError('All fields are required.');
      return;
    }
    if (modalPassword.length < 8) {
      setModalError('Password must be at least 8 characters.');
      return;
    }
    if (!firmId) {
      setModalError('Please select a firm first.');
      return;
    }

    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch('/api/accountant/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalName.trim(),
          email: modalEmail.trim(),
          phone: modalPhone.trim(),
          password: modalPassword,
          firmId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to create admin');
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
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between bg-white border-b border-[#E0E3E5] pl-14 pr-6">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Admins</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col paper-texture">
          <div className="ledger-binding p-8 pl-14 flex flex-col gap-4 flex-1 min-h-0 animate-in">

            {/* ── Filter bar ────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
              {firmId && (
                <button
                  onClick={openAddModal}
                  className="ml-auto btn-thick-navy text-sm px-4 py-2 font-medium"
                >
                  Add Admin
                </button>
              )}
            </div>

            {/* ── Table ─────────────────────────────────────── */}
            <div className="bg-white card-popped overflow-hidden flex-1 min-h-0 flex flex-col">
              {!firmId ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">Please select a firm to view admins.</div>
              ) : loading ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : admins.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">No admins found for this firm.</div>
              ) : (
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Name</th>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Email</th>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Status</th>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Created</th>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((admin, i) => (
                        <tr key={admin.id} className={`hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]'}`}>
                          <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{admin.name}</td>
                          <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{admin.email}</td>
                          <td data-col="Status" className="px-6 py-3">
                            {admin.status === 'active' ? (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium badge-green" style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium badge-gray" style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                                Inactive
                              </span>
                            )}
                          </td>
                          <td data-col="Created" className="px-6 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(admin.created_at)}</td>
                          <td className="px-6 py-3">
                            <button
                              onClick={() => toggleActive(admin)}
                              className="btn-thick-white text-xs font-medium px-3 py-1.5"
                            >
                              {admin.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>

      {/* ═══════════════════════ ADD ADMIN MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="bg-[var(--primary)] px-6 py-4">
              <h3 className="text-base font-bold text-white uppercase tracking-wide">Add Admin</h3>
              <p className="text-sm text-white/70 mt-0.5">Create a new admin for {firms.find((f) => f.id === firmId)?.name ?? 'the selected firm'}.</p>
            </div>

            <div className="p-6">
              {modalError && (
                <div className="mb-4 bg-[var(--error-container)] p-3">
                  <p className="text-sm text-[var(--on-error-container)]">{modalError}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Admin name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email *</label>
                  <input
                    type="email"
                    value={modalEmail}
                    onChange={(e) => setModalEmail(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone *</label>
                  <input
                    type="text"
                    value={modalPhone}
                    onChange={(e) => setModalPhone(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="e.g. +60123456789"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Password *</label>
                  <input
                    type="password"
                    value={modalPassword}
                    onChange={(e) => setModalPassword(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Min 8 characters"
                  />
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-low)] px-6 py-4 flex gap-3">
              <button
                onClick={submitAdmin}
                disabled={modalSaving}
                className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Admin'}
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
      )}

    </>
  );
}
