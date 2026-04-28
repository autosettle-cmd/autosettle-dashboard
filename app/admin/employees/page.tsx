'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  claims_count: number;
  approved_claims_count: number;
  total_claims: string;
  total_payments: string;
  outstanding: string;
  is_active: boolean;
  user_status: string | null;
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminEmployeesPage() {
  usePageTitle('Employees');
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

  // ── Collapsible sections ──
  const [adminsOpen, setAdminsOpen] = useState(true);
  const [empsOpen, setEmpsOpen] = useState(true);

  // ── Table sorting ──
  const { sorted: sortedAdmins, toggleSort: toggleAdminSort, sortIndicator: adminSortIndicator } = useTableSort(admins, 'name', 'asc');
  const { sorted: sortedEmployees, toggleSort: toggleEmpSort, sortIndicator: empSortIndicator } = useTableSort(employees, 'name', 'asc');

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

  // ── Edit Employee Panel ──
  const [editEmp, setEditEmp]             = useState<EmployeeRow | null>(null);
  const [editName, setEditName]           = useState('');
  const [editPhone, setEditPhone]         = useState('');
  const [editEmail, setEditEmail]         = useState('');
  const [editError, setEditError]         = useState('');
  const [editSaving, setEditSaving]       = useState(false);

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
    fetch(`/api/admin/employees`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEmployees(j.data ?? []); setEmpLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setEmpLoading(false); });
    return () => { cancelled = true; };
  }, [empKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refreshPending   = () => setPendingKey((k) => k + 1);
  const refreshAdmins    = () => setAdminsKey((k) => k + 1);
  const refreshEmployees = () => setEmpKey((k) => k + 1);

  // Auto-open preview from ?preview=id (global search navigation)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previewId = params.get('preview');
    if (!previewId || empLoading) return;
    const match = employees.find((e) => e.id === previewId);
    if (match) {
      openEditPanel(match);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [empLoading, employees]);

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

  // ── Edit Employee ──

  const openEditPanel = (emp: EmployeeRow) => {
    setEditEmp(emp);
    setEditName(emp.name);
    setEditPhone(emp.phone);
    setEditEmail(emp.email ?? '');
    setEditError('');
    setEditSaving(false);
  };

  const submitEdit = async () => {
    if (!editEmp) return;
    if (!editName.trim() || !editPhone.trim()) {
      setEditError('Name and phone are required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/employees/${editEmp.id}`, {
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
    <>
      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Employees</h1>
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-8 pl-14 paper-texture animate-in">

          {/* ════════════════════ SECTION 1: PENDING APPROVAL ════════════════════ */}
          {!pendingLoading && pending.length > 0 && (
            <div className="bg-white overflow-hidden">
              <div className="px-6 py-3 flex items-center gap-2">
                <h2 className="text-body-md font-semibold text-amber-700">Pending Approval</h2>
                <span className="badge-amber">{pending.length}</span>
              </div>
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Name</th>
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Email</th>
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Phone</th>
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date Requested</th>
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row, idx) => (
                      <tr key={row.id} className={`group text-body-md hover:bg-[var(--surface-low)] transition-colors ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{row.name}</td>
                        <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{row.email}</td>
                        <td data-col="Phone" className="px-6 py-3 text-[var(--text-secondary)]">{row.phone || '\u2014'}</td>
                        <td data-col="Date Requested" className="px-6 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(row.created_at)}</td>
                        <td className="px-6 py-3 flex items-center gap-3">
                          <button
                            onClick={() => handleApprove(row.id)}
                            className="btn-thick-green text-xs font-medium px-3 py-1.5"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(row.id)}
                            className="btn-thick-red text-xs font-medium px-3 py-1.5"
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
          <div className={adminsOpen ? 'card-button-pressed' : 'card-button'}>
            <div className="flex items-center justify-between px-6 py-4" onClick={() => setAdminsOpen(!adminsOpen)}>
              <div className="flex items-center gap-3">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${adminsOpen ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <p className="text-title-sm font-semibold text-[var(--text-primary)]">Admins</p>
                {!adminsLoading && <span className="badge-blue">{admins.length}</span>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); openAdminModal(); }} className="btn-thick-navy text-xs px-3 py-1.5 font-medium">Add Admin</button>
            </div>
            {adminsOpen && (
              adminsLoading ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : admins.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">No admins found.</div>
              ) : (
                <table className="w-full ds-table-chassis">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('name')}>Name{adminSortIndicator('name')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('email')}>Email{adminSortIndicator('email')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('is_active')}>Status{adminSortIndicator('is_active')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAdmins.map((admin, idx) => (
                      <tr key={admin.id} className={`ds-table-row text-body-md ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{admin.name}</td>
                        <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{admin.email}</td>
                        <td data-col="Status" className="px-6 py-3">
                          {admin.is_active ? <span className="badge-green">Active</span> : <span className="badge-gray">Inactive</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* ════════════════════ SECTION 3: EMPLOYEES ════════════════════ */}
          <div className={empsOpen ? 'card-button-pressed' : 'card-button'}>
            <div className="flex items-center justify-between px-6 py-4" onClick={() => setEmpsOpen(!empsOpen)}>
              <div className="flex items-center gap-3">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${empsOpen ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <p className="text-title-sm font-semibold text-[var(--text-primary)]">Employees</p>
                {!empLoading && <span className="badge-blue">{employees.length}</span>}
              </div>
              <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                <button onClick={openEmpModal} className="btn-thick-navy text-xs px-3 py-1.5 font-medium flex-shrink-0">Add Employee</button>
              </div>
            </div>
            {empsOpen && (
              empLoading ? (
                <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : employees.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">No employees found.</div>
              ) : (
                <table className="w-full ds-table-chassis">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('name')}>Name{empSortIndicator('name')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('phone')}>Phone{empSortIndicator('phone')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('email')}>Email{empSortIndicator('email')}</th>
                      <th className="px-6 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleEmpSort('claims_count')}>Claims{empSortIndicator('claims_count')}</th>
                      <th className="px-6 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleEmpSort('outstanding')}>Outstanding{empSortIndicator('outstanding')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('is_active')}>Status{empSortIndicator('is_active')}</th>
                      <th className="px-6 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEmployees.map((emp, idx) => (
                      <tr key={emp.id} className={`ds-table-row text-body-md ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{emp.name}</td>
                        <td data-col="Phone" className="px-6 py-3 text-[var(--text-secondary)]">{emp.phone}</td>
                        <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{emp.email ?? '\u2014'}</td>
                        <td data-col="Claims" className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{emp.claims_count}</td>
                        <td data-col="Outstanding" className="px-6 py-3 text-right tabular-nums">
                          {Number(emp.outstanding) > 0 ? (
                            <Link href={`/admin/employees/${emp.id}/claims-account`} className="text-[var(--reject-red)] font-semibold hover:underline">
                              RM {Number(emp.outstanding).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-secondary)]">{'\u2014'}</span>
                          )}
                        </td>
                        <td data-col="Status" className="px-6 py-3">
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
                          <button onClick={() => openEditPanel(emp)} className="btn-thick-white text-xs font-medium px-3 py-1.5">Edit</button>
                          <button onClick={() => toggleActive(emp)} className="btn-thick-white text-xs font-medium px-3 py-1.5">
                            {emp.is_active ? 'Deact' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

        </main>
      </div>

      {/* ═══ ADD ADMIN MODAL ═══ */}
      {showAdminModal && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60]" onClick={() => setShowAdminModal(false)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-md flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Add Admin</h3>
                <button onClick={() => setShowAdminModal(false)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Create a new admin user for your firm.</p>

                {adminError && (
                  <div className="bg-[var(--error-container)] p-3">
                    <p className="text-sm text-[var(--on-error-container)]">{adminError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Full Name *</label>
                  <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} className="input-recessed w-full" placeholder="Admin name" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email *</label>
                  <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="input-recessed w-full" placeholder="admin@example.com" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone</label>
                  <input type="text" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Temporary Password *</label>
                  <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="input-recessed w-full" placeholder="Min 8 characters" />
                </div>
              </div>

              <div className="flex gap-3 p-5 bg-[var(--surface-low)]">
                <button
                  onClick={submitAdmin}
                  disabled={adminSaving}
                  className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {adminSaving ? 'Creating...' : 'Create Admin'}
                </button>
                <button
                  onClick={() => setShowAdminModal(false)}
                  disabled={adminSaving}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ EDIT EMPLOYEE MODAL ═══ */}
      {editEmp && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50" onClick={() => setEditEmp(null)} />
          <div className="fixed inset-0 z-[51] flex items-center justify-center p-4" onClick={() => setEditEmp(null)}>
            <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-md max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h2 className="text-white font-bold text-sm uppercase tracking-wider">Edit Employee</h2>
                <button onClick={() => setEditEmp(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              <div className="flex-1 overflow-auto p-5 space-y-4">
                {editError && (
                  <div className="bg-[var(--error-container)] p-3">
                    <p className="text-sm text-[var(--on-error-container)]">{editError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-recessed w-full" placeholder="Employee name" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone *</label>
                  <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-recessed w-full" placeholder="e.g. +60123456789" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
              </div>

              <div className="flex-shrink-0 p-4 bg-[var(--surface-low)] flex gap-3">
                <button
                  onClick={submitEdit}
                  disabled={editSaving}
                  className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditEmp(null)}
                  disabled={editSaving}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ ADD EMPLOYEE MODAL ═══ */}
      {showEmpModal && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60]" onClick={() => setShowEmpModal(false)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-md flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Add Employee</h3>
                <button onClick={() => setShowEmpModal(false)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Create a new employee record.</p>

                {empError && (
                  <div className="bg-[var(--error-container)] p-3">
                    <p className="text-sm text-[var(--on-error-container)]">{empError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                  <input type="text" value={empName} onChange={(e) => setEmpName(e.target.value)} className="input-recessed w-full" placeholder="Employee name" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone *</label>
                  <input type="text" value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} className="input-recessed w-full" placeholder="e.g. +60123456789" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email</label>
                  <input type="email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
              </div>

              <div className="flex gap-3 p-5 bg-[var(--surface-low)]">
                <button
                  onClick={submitEmployee}
                  disabled={empSaving}
                  className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {empSaving ? 'Creating...' : 'Create Employee'}
                </button>
                <button
                  onClick={() => setShowEmpModal(false)}
                  disabled={empSaving}
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
