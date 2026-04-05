'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminRow {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

interface Firm {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminsPage() {
  // Data
  const [admins, setAdmins]         = useState<AdminRow[]>([]);
  const [firms, setFirms]           = useState<Firm[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [firmId, setFirmId] = useState('');

  // Modal
  const [showModal, setShowModal]         = useState(false);
  const [modalName, setModalName]         = useState('');
  const [modalEmail, setModalEmail]       = useState('');
  const [modalPhone, setModalPhone]       = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError]       = useState('');
  const [modalSaving, setModalSaving]     = useState(false);

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

  // Load admins (when firmId changes)
  useEffect(() => {
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
  }, [firmId, refreshKey]);

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
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-gray-900 font-bold text-title-lg tracking-tight">Admins</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <Select value={firmId} onChange={setFirmId}>
                <option value="">Select a Firm</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            )}

            {firmId && (
              <button
                onClick={openAddModal}
                className="ml-auto btn-primary text-sm px-4 py-2 rounded-lg font-medium"
              >
                Add Admin
              </button>
            )}
          </div>

          {/* ── Table ─────────────────────────────────────── */}
          <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0 flex flex-col">
            {!firmId ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">Please select a firm to view admins.</div>
            ) : loading ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : admins.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">No admins found for this firm.</div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3">Email</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Created</th>
                      <th className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="group hover:bg-[#F2F4F6] transition-colors">
                        <td className="px-6 py-3 text-gray-900 font-medium">{admin.name}</td>
                        <td className="px-6 py-3 text-gray-600">{admin.email}</td>
                        <td className="px-6 py-3">
                          {admin.status === 'active' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium badge-green">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium badge-gray">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-600">{formatDate(admin.created_at)}</td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => toggleActive(admin)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
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

        </main>
      </div>

      {/* ═══════════════════════ ADD ADMIN MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Admin</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new admin for {firms.find((f) => f.id === firmId)?.name ?? 'the selected firm'}.</p>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Name *</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="Admin name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Email *</label>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone *</label>
                <input
                  type="text"
                  value={modalPhone}
                  onChange={(e) => setModalPhone(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="e.g. +60123456789"
                />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Password *</label>
                <input
                  type="password"
                  value={modalPassword}
                  onChange={(e) => setModalPassword(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="Min 8 characters"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitAdmin}
                disabled={modalSaving}
                className="flex-1 btn-primary py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
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

const inputCls = 'input-field';

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {children}
    </select>
  );
}
