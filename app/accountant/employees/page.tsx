'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

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
  user_status: string | null;
}

interface PendingRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  firm_name: string;
  firm_id: string | null;
  created_at: string;
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function PeoplePage() {
  usePageTitle('Employees');
  const { firms, firmId, firmsLoaded } = useFirm();

  // ── Pending Approval data ──
  const [pending, setPending]               = useState<PendingRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingKey, setPendingKey]         = useState(0);

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

  // ── Fetch pending ──
  useEffect(() => {
    if (!firmsLoaded) return;
    let cancelled = false;
    setPendingLoading(true);
    const p = new URLSearchParams();
    if (firmId) p.set('firmId', firmId);
    fetch(`/api/admin/employees/pending?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setPending(j.data ?? []); setPendingLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setPendingLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, pendingKey, firmsLoaded]);

  // ── Fetch admins ──
  useEffect(() => {
    if (!firmsLoaded) return;
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
  }, [firmId, adminsKey, firmsLoaded]);

  // ── Fetch employees ──
  useEffect(() => {
    if (!firmsLoaded) return;
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
  }, [firmId, search, empKey, firmsLoaded]);

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
      if (res.ok) { refreshPending(); refreshEmployees(); }
    } catch (e) { console.error(e); }
  };

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

  // ── Table sorting ──
  const { sorted: sortedAdmins, toggleSort: toggleAdminSort, sortIndicator: adminSortIndicator } = useTableSort(filteredAdmins, 'name', 'asc');
  const { sorted: sortedEmployees, toggleSort: toggleEmpSort, sortIndicator: empSortIndicator } = useTableSort(employees, 'name', 'asc');

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      <Sidebar role="accountant" />

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">People</h1>
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-6 animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">

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
                className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--sidebar)' }}
              >
                Add Admin
              </button>
              <button
                onClick={openEmpModal}
                className="text-sm px-4 py-2 rounded-lg font-medium btn-primary"
              >
                Add Employee
              </button>
            </div>
          </div>

          {/* ── SECTION 0: PENDING APPROVAL ── */}
          {!pendingLoading && pending.length > 0 && (
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="px-6 py-3 flex items-center gap-2">
                <h2 className="text-body-md font-semibold text-amber-700">Pending Approval</h2>
                <span className="badge-amber">{pending.length}</span>
              </div>
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5">Name</th>
                      <th className="px-6 py-2.5">Email</th>
                      <th className="px-6 py-2.5">Phone</th>
                      <th className="px-6 py-2.5">Firm</th>
                      <th className="px-6 py-2.5">Date Requested</th>
                      <th className="px-6 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row) => (
                      <tr key={row.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                        <td className="px-6 py-3 text-[#191C1E] font-medium">{row.name}</td>
                        <td className="px-6 py-3 text-[#434654]">{row.email}</td>
                        <td className="px-6 py-3 text-[#434654]">{row.phone || '—'}</td>
                        <td className="px-6 py-3 text-[#434654]">{row.firm_name}</td>
                        <td className="px-6 py-3 text-[#434654]">{formatDate(row.created_at)}</td>
                        <td className="px-6 py-3 flex items-center gap-3">
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

          {/* ── SECTION 1: ADMINS ── */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-6 py-3 flex items-center gap-2">
              <h2 className="text-body-md font-semibold text-[#191C1E]">Admins</h2>
              {!adminsLoading && filteredAdmins.length > 0 && (
                <span className="text-label-sm text-[#8E9196] font-medium">{filteredAdmins.length}</span>
              )}
            </div>
            {!firmId ? (
              <div className="px-6 py-8 text-center text-sm text-[#8E9196]">Select a firm to view admins.</div>
            ) : adminsLoading ? (
              <div className="px-6 py-8 text-center text-sm text-[#8E9196]">Loading...</div>
            ) : filteredAdmins.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#8E9196]">No admins found.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleAdminSort('name')}>Name{adminSortIndicator('name')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleAdminSort('email')}>Email{adminSortIndicator('email')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleAdminSort('status')}>Status{adminSortIndicator('status')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleAdminSort('created_at')}>Created{adminSortIndicator('created_at')}</th>
                      <th className="px-6 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAdmins.map((admin) => (
                      <tr key={admin.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                        <td className="px-6 py-3 text-[#191C1E] font-medium">{admin.name}</td>
                        <td className="px-6 py-3 text-[#434654]">{admin.email}</td>
                        <td className="px-6 py-3">
                          {admin.status === 'active' ? (
                            <span className="badge-green">Active</span>
                          ) : (
                            <span className="badge-gray">Inactive</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-[#434654]">{formatDate(admin.created_at)}</td>
                        <td className="px-6 py-3 flex items-center gap-2">
                          <button
                            onClick={() => openEditAdminPanel(admin)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleAdminActive(admin)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
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

          {/* ── SECTION 2: EMPLOYEES ── */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-6 py-3 flex items-center gap-2">
              <h2 className="text-body-md font-semibold text-[#191C1E]">Employees</h2>
              {!empLoading && employees.length > 0 && (
                <span className="text-label-sm text-[#8E9196] font-medium">{employees.length}</span>
              )}
            </div>
            {empLoading ? (
              <div className="px-6 py-8 text-center text-sm text-[#8E9196]">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#8E9196]">No employees found.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleEmpSort('name')}>Name{empSortIndicator('name')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleEmpSort('phone')}>Phone{empSortIndicator('phone')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleEmpSort('email')}>Email{empSortIndicator('email')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleEmpSort('firm_name')}>Firm{empSortIndicator('firm_name')}</th>
                      <th className="px-6 py-2.5 text-right cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleEmpSort('claims_count')}>Claims{empSortIndicator('claims_count')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none hover:text-[#191C1E] transition-colors" onClick={() => toggleEmpSort('is_active')}>Status{empSortIndicator('is_active')}</th>
                      <th className="px-6 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEmployees.map((emp) => (
                      <tr key={emp.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                        <td className="px-6 py-3 text-[#191C1E] font-medium">{emp.name}</td>
                        <td className="px-6 py-3 text-[#434654]">{emp.phone}</td>
                        <td className="px-6 py-3 text-[#434654]">{emp.email ?? '—'}</td>
                        <td className="px-6 py-3 text-[#434654]">{emp.firm_name}</td>
                        <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{emp.claims_count}</td>
                        <td className="px-6 py-3">
                          {emp.user_status === 'pending_onboarding' ? (
                            <span className="badge-amber">Pending</span>
                          ) : emp.user_status === 'rejected' ? (
                            <span className="badge-red">Rejected</span>
                          ) : emp.is_active ? (
                            <span className="badge-green">Active</span>
                          ) : (
                            <span className="badge-gray">Inactive</span>
                          )}
                        </td>
                        <td className="px-6 py-3 flex items-center gap-2">
                          <button
                            onClick={() => openEditEmpPanel(emp)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleEmpActive(emp)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
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

      {/* === ADD ADMIN MODAL === */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-[#191C1E]">Add Admin</h3>
            <p className="text-sm text-[#434654] mt-1 mb-4">Create a new admin user for a firm.</p>

            {adminError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{adminError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Full Name *</label>
                <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} className="input-field w-full" placeholder="Admin name" autoFocus />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Email *</label>
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="input-field w-full" placeholder="admin@example.com" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Phone</label>
                <input type="text" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} className="input-field w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Temporary Password *</label>
                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="input-field w-full" placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Firm *</label>
                <select value={adminFirmId} onChange={(e) => setAdminFirmId(e.target.value)} className="input-field w-full">
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={submitAdmin} disabled={adminSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {adminSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button onClick={() => setShowAdminModal(false)} disabled={adminSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ADD EMPLOYEE MODAL === */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-[#191C1E]">Add Employee</h3>
            <p className="text-sm text-[#434654] mt-1 mb-4">Create a new employee record.</p>

            {empError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{empError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Name *</label>
                <input type="text" value={empName} onChange={(e) => setEmpName(e.target.value)} className="input-field w-full" placeholder="Employee name" autoFocus />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Phone *</label>
                <input type="text" value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} className="input-field w-full" placeholder="e.g. +60123456789" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Email</label>
                <input type="email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} className="input-field w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Firm *</label>
                <select value={empFirmId} onChange={(e) => setEmpFirmId(e.target.value)} className="input-field w-full">
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={submitEmployee} disabled={empSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {empSaving ? 'Creating...' : 'Create Employee'}
              </button>
              <button onClick={() => setShowEmpModal(false)} disabled={empSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === EDIT EMPLOYEE PANEL === */}
      {editEmp && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setEditEmp(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-16 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
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
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Name *</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field w-full" placeholder="Employee name" autoFocus />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Phone *</label>
                <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-field w-full" placeholder="e.g. +60123456789" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Email</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-field w-full" placeholder="Optional" />
              </div>
            </div>

            <div className="flex-shrink-0 p-4 flex gap-3">
              <button onClick={submitEditEmp} disabled={editSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditEmp(null)} disabled={editSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* === EDIT ADMIN PANEL === */}
      {editAdmin && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setEditAdmin(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-16 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
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
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Name *</label>
                <input type="text" value={editAdminName} onChange={(e) => setEditAdminName(e.target.value)} className="input-field w-full" placeholder="Admin name" autoFocus />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Email *</label>
                <input type="email" value={editAdminEmail} onChange={(e) => setEditAdminEmail(e.target.value)} className="input-field w-full" placeholder="admin@example.com" />
              </div>
            </div>

            <div className="flex-shrink-0 p-4 flex gap-3">
              <button onClick={submitEditAdmin} disabled={editAdminSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {editAdminSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditAdmin(null)} disabled={editAdminSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

