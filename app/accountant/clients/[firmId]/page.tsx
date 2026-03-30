'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirmDetail {
  id: string;
  name: string;
  registration_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  plan: string;
}

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
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/accountant/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Receipts',   href: '/accountant/receipts',   icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { label: 'Clients',    href: '/accountant/clients',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/accountant/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/accountant/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function FirmDetailPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const params = useParams();
  const handleLogout = useLogout();
  const firmId = params.firmId as string;

  // Data
  const [firm, setFirm]                   = useState<FirmDetail | null>(null);
  const [firmLoading, setFirmLoading]     = useState(true);
  const [admins, setAdmins]               = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsKey, setAdminsKey]         = useState(0);

  // Add Admin Modal
  const [showModal, setShowModal]       = useState(false);
  const [modalName, setModalName]       = useState('');
  const [modalEmail, setModalEmail]     = useState('');
  const [modalPhone, setModalPhone]     = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError]     = useState('');
  const [modalSaving, setModalSaving]   = useState(false);

  // ── Fetch firm details ──
  useEffect(() => {
    let cancelled = false;
    setFirmLoading(true);
    fetch('/api/firms/details')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const match = (j.data ?? []).find((f: FirmDetail) => f.id === firmId);
          setFirm(match ?? null);
          setFirmLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setFirmLoading(false); });
    return () => { cancelled = true; };
  }, [firmId]);

  // ── Fetch admins ──
  useEffect(() => {
    let cancelled = false;
    setAdminsLoading(true);
    fetch(`/api/accountant/admins?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setAdmins(j.data ?? []); setAdminsLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setAdminsLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, adminsKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refreshAdmins = () => setAdminsKey((k) => k + 1);

  const openModal = () => {
    setModalName(''); setModalEmail(''); setModalPhone(''); setModalPassword('');
    setModalError(''); setModalSaving(false); setShowModal(true);
  };

  const submitAdmin = async () => {
    if (!modalName.trim() || !modalEmail.trim() || !modalPassword.trim()) {
      setModalError('Name, email, and password are required.');
      return;
    }
    if (modalPassword.length < 8) {
      setModalError('Password must be at least 8 characters.');
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
          phone: modalPhone.trim() || undefined,
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
      refreshAdmins();
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB]">

      {/* ═══ SIDEBAR ═══ */}
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
            const active = pathname.startsWith(href);
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
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '—'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left">Sign out</button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Firm Details</h1>
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-6 animate-in">

          {/* ── Back link ── */}
          <Link
            href="/accountant/clients"
            className="text-[13px] text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 w-fit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
            Back to Clients
          </Link>

          {firmLoading ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : !firm ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">Firm not found.</div>
          ) : (
            <>
              {/* ════════════════════ FIRM INFO CARD ════════════════════ */}
              <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
                <h2 className="text-[15px] font-semibold text-gray-900 mb-4">{firm.name}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Registration Number</p>
                    <p className="text-[13px] text-gray-900">{firm.registration_number ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Contact Email</p>
                    <p className="text-[13px] text-gray-900">{firm.contact_email ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Contact Phone</p>
                    <p className="text-[13px] text-gray-900">{firm.contact_phone ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Plan</p>
                    {firm.plan === 'paid' ? (
                      <span className="badge-green">Paid</span>
                    ) : (
                      <span className="badge-gray">Free</span>
                    )}
                  </div>
                </div>
              </div>

              {/* ════════════════════ QUICK LINKS ════════════════════ */}
              <div className="flex items-center gap-3">
                <Link
                  href={`/accountant/claims?firmId=${firmId}`}
                  className="text-sm px-4 py-2 rounded-md font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View Claims
                </Link>
                <Link
                  href={`/accountant/receipts?firmId=${firmId}`}
                  className="text-sm px-4 py-2 rounded-md font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View Receipts
                </Link>
              </div>

              {/* ════════════════════ ADMINS SECTION ════════════════════ */}
              <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-gray-900">Admins</h2>
                  <button
                    onClick={openModal}
                    className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-opacity hover:opacity-85"
                    style={{ backgroundColor: '#A60201' }}
                  >
                    Add Admin
                  </button>
                </div>
                {adminsLoading ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
                ) : admins.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">No admins found for this firm.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          <th className="px-5 py-2.5">Name</th>
                          <th className="px-5 py-2.5">Email</th>
                          <th className="px-5 py-2.5">Status</th>
                          <th className="px-5 py-2.5">Date Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {admins.map((admin, i) => (
                          <tr key={admin.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < admins.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-5 py-3 text-gray-900 font-medium">{admin.name}</td>
                            <td className="px-5 py-3 text-gray-600">{admin.email}</td>
                            <td className="px-5 py-3">
                              {admin.status === 'active' ? (
                                <span className="badge-green">Active</span>
                              ) : (
                                <span className="badge-gray">Inactive</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-gray-600">{formatDate(admin.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

        </main>
      </div>

      {/* ═══ ADD ADMIN MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Admin</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new admin user for this firm.</p>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Full Name *</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Admin name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Email *</label>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone</label>
                <input
                  type="text"
                  value={modalPhone}
                  onChange={(e) => setModalPhone(e.target.value)}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Temporary Password *</label>
                <input
                  type="password"
                  value={modalPassword}
                  onChange={(e) => setModalPassword(e.target.value)}
                  className="input-field w-full"
                  placeholder="Min 8 characters"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitAdmin}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {modalSaving ? 'Creating...' : 'Create Admin'}
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
