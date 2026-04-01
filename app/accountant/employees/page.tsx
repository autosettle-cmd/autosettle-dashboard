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
  firm_name: string;
  firm_id: string;
  claims_count: number;
  is_active: boolean;
}

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/accountant/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/accountant/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/accountant/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Clients',    href: '/accountant/clients',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'People',     href: '/accountant/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/accountant/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function PeoplePage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // ── Firms ──
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState('');

  // ── Admins data ──
  const [admins, setAdmins]               = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsKey, setAdminsKey]         = useState(0);

  // ── Employees data ──
  const [employees, setEmployees]   = useState<EmployeeRow[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empKey, setEmpKey]         = useState(0);

  // ── Search ──
  const [search, setSearch] = useState('');

  // ── Add Admin Modal ──
  const [showAdminModal, setShowAdminModal]   = useState(false);
  const [adminName, setAdminName]             = useState('');
  const [adminEmail, setAdminEmail]           = useState('');
  const [adminPhone, setAdminPhone]           = useState('');
  const [adminPassword, setAdminPassword]     = useState('');
  const [adminFirmId, setAdminFirmId]         = useState('');
  const [adminError, setAdminError]           = useState('');
  const [adminSaving, setAdminSaving]         = useState(false);

  // ── Add Employee Modal ──
  const [showEmpModal, setShowEmpModal]   = useState(false);
  const [empName, setEmpName]             = useState('');
  const [empPhone, setEmpPhone]           = useState('');
  const [empEmail, setEmpEmail]           = useState('');
  const [empFirmId, setEmpFirmId]         = useState('');
  const [empError, setEmpError]           = useState('');
  const [empSaving, setEmpSaving]         = useState(false);

  // ── Edit Employee Panel ──
  const [editEmp, setEditEmp]         = useState<EmployeeRow | null>(null);
  const [editName, setEditName]       = useState('');
  const [editPhone, setEditPhone]     = useState('');
  const [editEmail, setEditEmail]     = useState('');
  const [editError, setEditError]     = useState('');
  const [editSaving, setEditSaving]   = useState(false);

  // ── Edit Admin Panel ──
  const [editAdmin, setEditAdmin]         = useState<AdminRow | null>(null);
  const [editAdminName, setEditAdminName] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editAdminError, setEditAdminError] = useState('');
  const [editAdminSaving, setEditAdminSaving] = useState(false);

  // ── Load firms (once) ──
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => { if (j.data) setFirms(j.data); })
      .catch(console.error);
  }, []);

  // ── Fetch admins ──
  useEffect(() => {
    if (!firmId) {
      setAdmins([]);
      setAdminsLoading(false);
      return;
    }

    let cancelled = false;
    setAdminsLoading(true);
    fetch(`/api/accountant/admins?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setAdmins(j.data ?? []); setAdminsLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setAdminsLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, adminsKey]);

  // ── Fetch employees ──
  useEffect(() => {
    let cancelled = false;
    setEmpLoading(true);

    const p = new URLSearchParams();
    if (firmId) p.set('firmId', firmId);
    if (search) p.set('search', search);

    fetch(`/api/employees?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEmployees(j.data ?? []); setEmpLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setEmpLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, search, empKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refreshAdmins    = () => setAdminsKey((k) => k + 1);
  const refreshEmployees = () => setEmpKey((k) => k + 1);

  // ── Toggle admin active ──
  const toggleAdminActive = async (admin: AdminRow) => {
    try {
      const res = await fetch(`/api/accountant/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: admin.status !== 'active' }),
      });
      if (res.ok) refreshAdmins();
    } catch (e) { console.error(e); }
  };

  // ── Toggle employee active ──
  const toggleEmpActive = async (emp: EmployeeRow) => {
    try {
      const res = await fetch(`/api/employees/${emp.id}`, {
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
    setAdminFirmId(firmId || (firms.length === 1 ? firms[0].id : ''));
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
    if (!adminFirmId) {
      setAdminError('Please select a firm.');
      return;
    }
    setAdminSaving(true);
    setAdminError('');
    try {
      const res = await fetch('/api/accountant/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: adminName.trim(),
          email: adminEmail.trim(),
          phone: adminPhone.trim() || undefined,
          password: adminPassword,
          firmId: adminFirmId,
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
    setEmpFirmId(firmId || (firms.length === 1 ? firms[0].id : ''));
    setEmpError(''); setEmpSaving(false); setShowEmpModal(true);
  };

  const submitEmployee = async () => {
    if (!empName.trim() || !empPhone.trim() || !empFirmId) {
      setEmpError('Name, phone, and firm are required.');
      return;
    }
    setEmpSaving(true);
    setEmpError('');
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: empName.trim(),
          phone: empPhone.trim(),
          email: empEmail.trim() || undefined,
          firmId: empFirmId,
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

  // ── Edit Employee ──
  const openEditEmpPanel = (emp: EmployeeRow) => {
    setEditAdmin(null);
    setEditEmp(emp);
    setEditName(emp.name);
    setEditPhone(emp.phone);
    setEditEmail(emp.email ?? '');
    setEditError('');
    setEditSaving(false);
  };

  const submitEditEmp = async () => {
    if (!editEmp) return;
    if (!editName.trim() || !editPhone.trim()) {
      setEditError('Name and phone are required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/employees/${editEmp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEditError(json.error || 'Failed to update employee');
        setEditSaving(false);
        return;
      }
      setEditEmp(null);
      refreshEmployees();
    } catch {
      setEditError('Network error. Please try again.');
      setEditSaving(false);
    }
  };

  // ── Edit Admin ──
  const openEditAdminPanel = (admin: AdminRow) => {
    setEditEmp(null);
    setEditAdmin(admin);
    setEditAdminName(admin.name);
    setEditAdminEmail(admin.email);
    setEditAdminError('');
    setEditAdminSaving(false);
  };

  const submitEditAdmin = async () => {
    if (!editAdmin) return;
    if (!editAdminName.trim() || !editAdminEmail.trim()) {
      setEditAdminError('Name and email are required.');
      return;
    }
    setEditAdminSaving(true);
    setEditAdminError('');
    try {
      const res = await fetch(`/api/accountant/admins/${editAdmin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editAdminName.trim(),
          email: editAdminEmail.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEditAdminError(json.error || 'Failed to update admin');
        setEditAdminSaving(false);
        return;
      }
      setEditAdmin(null);
      refreshAdmins();
    } catch {
      setEditAdminError('Network error. Please try again.');
      setEditAdminSaving(false);
    }
  };

  // ── Filtered admins (by search) ──
  const filteredAdmins = search
    ? admins.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.email.toLowerCase().includes(search.toLowerCase())
      )
    : admins;

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
          <h1 className="text-gray-900 font-semibold text-[15px]">People</h1>
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-6 animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Select value={firmId} onChange={setFirmId}>
              <option value="">All Firms</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>

            <input
              type="text"
              placeholder="Search name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[240px]"
            />

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={openAdminModal}
                className="text-sm px-4 py-2 rounded-md font-medium text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#152237' }}
              >
                Add Admin
              </button>
              <button
                onClick={openEmpModal}
                className="text-sm px-4 py-2 rounded-md font-medium text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                Add Employee
              </button>
            </div>
          </div>

          {/* ════════════════════ SECTION 1: ADMINS ════════════════════ */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-gray-900">Admins</h2>
              {!adminsLoading && filteredAdmins.length > 0 && (
                <span className="text-[11px] text-gray-400 font-medium">{filteredAdmins.length}</span>
              )}
            </div>
            {!firmId ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Select a firm to view admins.</div>
            ) : adminsLoading ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
            ) : filteredAdmins.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No admins found.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-5 py-2.5">Email</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">Created</th>
                      <th className="px-5 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdmins.map((admin, i) => (
                      <tr key={admin.id} className={`text-[13px] hover:bg-gray-50/50 transition-colors ${i < filteredAdmins.length - 1 ? 'border-b border-gray-50' : ''}`}>
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
                        <td className="px-5 py-3 flex items-center gap-2">
                          <button
                            onClick={() => openEditAdminPanel(admin)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleAdminActive(admin)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
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

          {/* ════════════════════ SECTION 2: EMPLOYEES ════════════════════ */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-gray-900">Employees</h2>
              {!empLoading && employees.length > 0 && (
                <span className="text-[11px] text-gray-400 font-medium">{employees.length}</span>
              )}
            </div>
            {empLoading ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No employees found.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-5 py-2.5">Phone</th>
                      <th className="px-5 py-2.5">Email</th>
                      <th className="px-5 py-2.5">Firm</th>
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
                        <td className="px-5 py-3 text-gray-600">{emp.firm_name}</td>
                        <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{emp.claims_count}</td>
                        <td className="px-5 py-3">
                          {emp.is_active ? (
                            <span className="badge-green">Active</span>
                          ) : (
                            <span className="badge-gray">Inactive</span>
                          )}
                        </td>
                        <td className="px-5 py-3 flex items-center gap-2">
                          <button
                            onClick={() => openEditEmpPanel(emp)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleEmpActive(emp)}
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
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new admin user for a firm.</p>

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
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Firm *</label>
                <select
                  value={adminFirmId}
                  onChange={(e) => setAdminFirmId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
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
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Firm *</label>
                <select
                  value={empFirmId}
                  onChange={(e) => setEmpFirmId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
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

      {/* ═══ EDIT EMPLOYEE PANEL ═══ */}
      {editEmp && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setEditEmp(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Edit Employee</h2>
              <button onClick={() => setEditEmp(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Employee name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone *</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="input-field w-full"
                  placeholder="e.g. +60123456789"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-gray-100 p-4 flex gap-3">
              <button
                onClick={submitEditEmp}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditEmp(null)}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ EDIT ADMIN PANEL ═══ */}
      {editAdmin && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setEditAdmin(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Edit Admin</h2>
              <button onClick={() => setEditAdmin(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {editAdminError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{editAdminError}</p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Name *</label>
                <input
                  type="text"
                  value={editAdminName}
                  onChange={(e) => setEditAdminName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Admin name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Email *</label>
                <input
                  type="email"
                  value={editAdminEmail}
                  onChange={(e) => setEditAdminEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-gray-100 p-4 flex gap-3">
              <button
                onClick={submitEditAdmin}
                disabled={editAdminSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {editAdminSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditAdmin(null)}
                disabled={editAdminSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── Small reusable sub-components ────────────────────────────────────────────

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
      {children}
    </select>
  );
}
