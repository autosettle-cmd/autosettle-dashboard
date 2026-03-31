'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  claims_count: number;
  is_active: boolean;
}

interface PendingRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  created_at: string;
}

interface AdminRow {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
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
  { label: 'Dashboard',  href: '/admin/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/admin/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/admin/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/admin/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/admin/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/admin/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminEmployeesPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // ── Pending Approval data ──
  const [pending, setPending]               = useState<PendingRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingKey, setPendingKey]         = useState(0);

  // ── Admins data ──
  const [admins, setAdmins]               = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsKey, setAdminsKey]         = useState(0);

  // ── Employees data ──
  const [employees, setEmployees]       = useState<EmployeeRow[]>([]);
  const [empLoading, setEmpLoading]     = useState(true);
  const [empKey, setEmpKey]             = useState(0);

  // Filters
  const [search, setSearch] = useState('');

  // ── Add Admin Modal ──
  const [showAdminModal, setShowAdminModal]   = useState(false);
  const [adminName, setAdminName]             = useState('');
  const [adminEmail, setAdminEmail]           = useState('');
  const [adminPhone, setAdminPhone]           = useState('');
  const [adminPassword, setAdminPassword]     = useState('');
  const [adminError, setAdminError]           = useState('');
  const [adminSaving, setAdminSaving]         = useState(false);

  // ── Add Employee Modal ──
  const [showEmpModal, setShowEmpModal]   = useState(false);
  const [empName, setEmpName]             = useState('');
  const [empPhone, setEmpPhone]           = useState('');
  const [empEmail, setEmpEmail]           = useState('');
  const [empError, setEmpError]           = useState('');
  const [empSaving, setEmpSaving]         = useState(false);

  // ── Fetch pending ──
  useEffect(() => {
    let cancelled = false;
    setPendingLoading(true);
    fetch('/api/admin/employees/pending')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setPending(j.data ?? []); setPendingLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setPendingLoading(false); });
    return () => { cancelled = true; };
  }, [pendingKey]);

  // ── Fetch admins ──
  useEffect(() => {
    let cancelled = false;
    setAdminsLoading(true);
    fetch('/api/admin/admins')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setAdmins(j.data ?? []); setAdminsLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setAdminsLoading(false); });
    return () => { cancelled = true; };
  }, [adminsKey]);

  // ── Fetch employees ──
  useEffect(() => {
    let cancelled = false;
    setEmpLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    fetch(`/api/admin/employees?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEmployees(j.data ?? []); setEmpLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setEmpLoading(false); });
    return () => { cancelled = true; };
  }, [search, empKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refreshPending   = () => setPendingKey((k) => k + 1);
  const refreshAdmins    = () => setAdminsKey((k) => k + 1);
  const refreshEmployees = () => setEmpKey((k) => k + 1);

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/employees/${id}/approve`, { method: 'PATCH' });
      if (res.ok) { refreshPending(); refreshEmployees(); }
    } catch (e) { console.error(e); }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/employees/${id}/reject`, { method: 'PATCH' });
      if (res.ok) refreshPending();
    } catch (e) { console.error(e); }
  };

  const toggleActive = async (emp: EmployeeRow) => {
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !emp.is_active }),
      });
      if (res.ok) refreshEmployees();
    } catch (e) { console.error(e); }
  };

  // ── Add Admin ──

  const openAdminModal = () => {
    setAdminName(''); setAdminEmail(''); setAdminPhone(''); setAdminPassword('');
    setAdminError(''); setAdminSaving(false); setShowAdminModal(true);
  };

  const submitAdmin = async () => {
    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setAdminError('Name, email, and password are required.');
      return;
    }
    if (adminPassword.length < 8) {
      setAdminError('Password must be at least 8 characters.');
      return;
    }
    setAdminSaving(true);
    setAdminError('');
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: adminName.trim(),
          email: adminEmail.trim(),
          phone: adminPhone.trim() || undefined,
          password: adminPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAdminError(json.error || 'Failed to create admin');
        setAdminSaving(false);
        return;
      }
      setShowAdminModal(false);
      refreshAdmins();
    } catch {
      setAdminError('Network error. Please try again.');
      setAdminSaving(false);
    }
  };

  // ── Add Employee ──

  const openEmpModal = () => {
    setEmpName(''); setEmpPhone(''); setEmpEmail('');
    setEmpError(''); setEmpSaving(false); setShowEmpModal(true);
  };

  const submitEmployee = async () => {
    if (!empName.trim() || !empPhone.trim()) {
      setEmpError('Name and phone are required.');
      return;
    }
    setEmpSaving(true);
    setEmpError('');
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: empName.trim(),
          phone: empPhone.trim(),
          email: empEmail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmpError(json.error || 'Failed to create employee');
        setEmpSaving(false);
        return;
      }
      setShowEmpModal(false);
      refreshEmployees();
    } catch {
      setEmpError('Network error. Please try again.');
      setEmpSaving(false);
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
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-white bg-white/[0.1]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-bold">
              {(session?.user?.name ?? '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '—'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Employees</h1>
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-6 animate-in">

          {/* ════════════════════ SECTION 1: PENDING APPROVAL ════════════════════ */}
          {!pendingLoading && pending.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-amber-700">Pending Approval</h2>
                <span className="badge-amber">{pending.length}</span>
              </div>
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-5 py-2.5">Email</th>
                      <th className="px-5 py-2.5">Phone</th>
                      <th className="px-5 py-2.5">Date Requested</th>
                      <th className="px-5 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row, i) => (
                      <tr key={row.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < pending.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <td className="px-5 py-3 text-gray-900 font-medium">{row.name}</td>
                        <td className="px-5 py-3 text-gray-600">{row.email}</td>
                        <td className="px-5 py-3 text-gray-600">{row.phone || '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{formatDate(row.created_at)}</td>
                        <td className="px-5 py-3 flex items-center gap-3">
                          <button
                            onClick={() => handleApprove(row.id)}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(row.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════ SECTION 2: ADMINS ════════════════════ */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-gray-900">Admins</h2>
              <button
                onClick={openAdminModal}
                className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                Add Admin
              </button>
            </div>
            {adminsLoading ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : admins.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No admins found.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-5 py-2.5">Email</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin, i) => (
                      <tr key={admin.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < admins.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <td className="px-5 py-3 text-gray-900 font-medium">{admin.name}</td>
                        <td className="px-5 py-3 text-gray-600">{admin.email}</td>
                        <td className="px-5 py-3">
                          {admin.is_active ? (
                            <span className="badge-green">Active</span>
                          ) : (
                            <span className="badge-gray">Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ════════════════════ SECTION 3: EMPLOYEES ════════════════════ */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[13px] font-semibold text-gray-900">Employees</h2>
                <input
                  type="text"
                  placeholder="Search name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field min-w-[210px]"
                />
              </div>
              <button
                onClick={openEmpModal}
                className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-opacity hover:opacity-85 flex-shrink-0"
                style={{ backgroundColor: '#A60201' }}
              >
                Add Employee
              </button>
            </div>
            {empLoading ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">No employees found.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-5 py-2.5">Phone</th>
                      <th className="px-5 py-2.5">Email</th>
                      <th className="px-5 py-2.5 text-right">Claims</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp, i) => (
                      <tr key={emp.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < employees.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <td className="px-5 py-3 text-gray-900 font-medium">{emp.name}</td>
                        <td className="px-5 py-3 text-gray-600">{emp.phone}</td>
                        <td className="px-5 py-3 text-gray-600">{emp.email ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{emp.claims_count}</td>
                        <td className="px-5 py-3">
                          {emp.is_active ? (
                            <span className="badge-green">Active</span>
                          ) : (
                            <span className="badge-gray">Inactive</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => toggleActive(emp)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                          >
                            {emp.is_active ? 'Deactivate' : 'Activate'}
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

      {/* ═══ ADD ADMIN MODAL ═══ */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Admin</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new admin user for your firm.</p>

            {adminError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{adminError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Full Name *</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Admin name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Email *</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone</label>
                <input
                  type="text"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Temporary Password *</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="input-field w-full"
                  placeholder="Min 8 characters"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitAdmin}
                disabled={adminSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {adminSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button
                onClick={() => setShowAdminModal(false)}
                disabled={adminSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD EMPLOYEE MODAL ═══ */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Employee</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new employee record.</p>

            {empError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{empError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Name *</label>
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Employee name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone *</label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="input-field w-full"
                  placeholder="e.g. +60123456789"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Email</label>
                <input
                  type="email"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitEmployee}
                disabled={empSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {empSaving ? 'Creating...' : 'Create Employee'}
              </button>
              <button
                onClick={() => setShowEmpModal(false)}
                disabled={empSaving}
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
