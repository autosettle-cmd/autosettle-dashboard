'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';
import SearchButton from '@/components/SearchButton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  firm_name: string;
  firm_id: string;
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
  return [
    d.getFullYear(),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('.');
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

    fetch(`/api/employees?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEmployees(j.data ?? []); setEmpLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setEmpLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, empKey, firmsLoaded]);

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
      openEditEmpPanel(match);
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

  // ── Collapsible sections ──
  const [adminsOpen, setAdminsOpen] = useState(true);
  const [empsOpen, setEmpsOpen] = useState(true);

  // ── Table sorting ──
  const { sorted: sortedAdmins, toggleSort: toggleAdminSort, sortIndicator: adminSortIndicator } = useTableSort(admins, 'name', 'asc');
  const { sorted: sortedEmployees, toggleSort: toggleEmpSort, sortIndicator: empSortIndicator } = useTableSort(employees, 'name', 'asc');

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">People</h1>
          <SearchButton />
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={openAdminModal}
                className="btn-thick-white text-sm px-4 py-2 font-medium"
              >
                Add Admin
              </button>
              <button
                onClick={openEmpModal}
                className="btn-thick-navy text-sm px-4 py-2 font-medium"
              >
                Add Employee
              </button>
            </div>
          </div>

          {/* ── SECTION 0: PENDING APPROVAL ── */}
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
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Firm</th>
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date Requested</th>
                      <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row, i) => (
                      <tr key={row.id} className={`group text-body-md hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{row.name}</td>
                        <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{row.email}</td>
                        <td data-col="Phone" className="px-6 py-3 text-[var(--text-secondary)]">{row.phone || '—'}</td>
                        <td data-col="Firm" className="px-6 py-3 text-[var(--text-secondary)]">{row.firm_name}</td>
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

          {/* ── SECTION 1: ADMINS ── */}
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
            </div>
            {adminsOpen && (
              !firmId ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">Select a firm to view admins.</div>
              ) : adminsLoading ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : admins.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">No admins found.</div>
              ) : (
                <table className="w-full ds-table-chassis">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('name')}>Name{adminSortIndicator('name')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('email')}>Email{adminSortIndicator('email')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('status')}>Status{adminSortIndicator('status')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleAdminSort('created_at')}>Created{adminSortIndicator('created_at')}</th>
                      <th className="px-6 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAdmins.map((admin, i) => (
                      <tr key={admin.id} className={`ds-table-row text-body-md ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{admin.name}</td>
                        <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{admin.email}</td>
                        <td data-col="Status" className="px-6 py-3">
                          {admin.status === 'active' ? (
                            <span className="badge-green">Active</span>
                          ) : (
                            <span className="badge-gray">Inactive</span>
                          )}
                        </td>
                        <td data-col="Created" className="px-6 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(admin.created_at)}</td>
                        <td className="px-6 py-3 flex items-center gap-2">
                          <button onClick={() => openEditAdminPanel(admin)} className="btn-thick-white text-xs font-medium px-3 py-1.5">Edit</button>
                          <button onClick={() => toggleAdminActive(admin)} className="btn-thick-white text-xs font-medium px-3 py-1.5">
                            {admin.status === 'active' ? 'Deact' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* ── SECTION 2: EMPLOYEES ── */}
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
            </div>
            {empsOpen && (
              empLoading ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : employees.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">No employees found.</div>
              ) : (
                <table className="w-full ds-table-chassis">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('name')}>Name{empSortIndicator('name')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('phone')}>Phone{empSortIndicator('phone')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('email')}>Email{empSortIndicator('email')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('firm_name')}>Firm{empSortIndicator('firm_name')}</th>
                      <th className="px-6 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleEmpSort('claims_count')}>Claims{empSortIndicator('claims_count')}</th>
                      <th className="px-6 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleEmpSort('outstanding')}>Outstanding{empSortIndicator('outstanding')}</th>
                      <th className="px-6 py-2.5 cursor-pointer select-none" onClick={() => toggleEmpSort('is_active')}>Status{empSortIndicator('is_active')}</th>
                      <th className="px-6 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEmployees.map((emp, i) => (
                      <tr key={emp.id} className={`ds-table-row text-body-md ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{emp.name}</td>
                        <td data-col="Phone" className="px-6 py-3 text-[var(--text-secondary)]">{emp.phone}</td>
                        <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{emp.email ?? '—'}</td>
                        <td data-col="Firm" className="px-6 py-3 text-[var(--text-secondary)]">{emp.firm_name}</td>
                        <td data-col="Claims" className="px-6 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{emp.claims_count}</td>
                        <td data-col="Outstanding" className="px-6 py-3 text-right tabular-nums">
                          {Number(emp.outstanding) > 0 ? (
                            <Link href={`/accountant/employees/${emp.id}/claims-account`} className="text-[var(--reject-red)] font-semibold hover:underline">
                              RM {Number(emp.outstanding).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-secondary)]">—</span>
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
                          <button onClick={() => openEditEmpPanel(emp)} className="btn-thick-white text-xs font-medium px-3 py-1.5">Edit</button>
                          <button onClick={() => toggleEmpActive(emp)} className="btn-thick-white text-xs font-medium px-3 py-1.5">
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

      {/* === ADD ADMIN MODAL === */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Add Admin</h3>
              <p className="text-xs text-white/70 mt-1">Create a new admin user for a firm.</p>
            </div>

            <div className="p-6 space-y-3">
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
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Firm *</label>
                <select value={adminFirmId} onChange={(e) => setAdminFirmId(e.target.value)} className="input-recessed w-full">
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button onClick={submitAdmin} disabled={adminSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed">
                {adminSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button onClick={() => setShowAdminModal(false)} disabled={adminSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ADD EMPLOYEE MODAL === */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Add Employee</h3>
              <p className="text-xs text-white/70 mt-1">Create a new employee record.</p>
            </div>

            <div className="p-6 space-y-3">
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
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Firm *</label>
                <select value={empFirmId} onChange={(e) => setEmpFirmId(e.target.value)} className="input-recessed w-full">
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button onClick={submitEmployee} disabled={empSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed">
                {empSaving ? 'Creating...' : 'Create Employee'}
              </button>
              <button onClick={() => setShowEmpModal(false)} disabled={empSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === EDIT EMPLOYEE MODAL === */}
      {editEmp && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setEditEmp(null)}>
          <div className="bg-white shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-[var(--primary)]">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Edit Employee</h2>
              <button onClick={() => setEditEmp(null)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-4">
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
              <button onClick={submitEditEmp} disabled={editSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditEmp(null)} disabled={editSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === EDIT ADMIN MODAL === */}
      {editAdmin && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setEditAdmin(null)}>
          <div className="bg-white shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-[var(--primary)]">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Edit Admin</h2>
              <button onClick={() => setEditAdmin(null)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-4">
              {editAdminError && (
                <div className="bg-[var(--error-container)] p-3">
                  <p className="text-sm text-[var(--on-error-container)]">{editAdminError}</p>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                <input type="text" value={editAdminName} onChange={(e) => setEditAdminName(e.target.value)} className="input-recessed w-full" placeholder="Admin name" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email *</label>
                <input type="email" value={editAdminEmail} onChange={(e) => setEditAdminEmail(e.target.value)} className="input-recessed w-full" placeholder="admin@example.com" />
              </div>
            </div>

            <div className="flex-shrink-0 p-4 bg-[var(--surface-low)] flex gap-3">
              <button onClick={submitEditAdmin} disabled={editAdminSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed">
                {editAdminSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditAdmin(null)} disabled={editAdminSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
