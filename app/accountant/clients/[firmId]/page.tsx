'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePageTitle } from '@/lib/use-page-title';
import { useTableSort } from '@/lib/use-table-sort';
import SetupChecklist from '@/components/onboarding/SetupChecklist';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirmDetail {
  id: string;
  name: string;
  registration_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  plan: string;
  tin: string | null;
  brn: string | null;
  msic_code: string | null;
  sst_registration_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  country: string | null;
  lhdn_client_id: string | null;
  lhdn_client_secret: string | null;
}

interface AdminRow {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FirmDetailPage() {
  usePageTitle('Client Details');
  const params = useParams();
  const firmId = params.firmId as string;

  // Data
  const [firm, setFirm]                   = useState<FirmDetail | null>(null);
  const [allFirms, setAllFirms]           = useState<{ id: string; name: string }[]>([]);
  const [firmLoading, setFirmLoading]     = useState(true);
  const [admins, setAdmins]               = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsKey, setAdminsKey]         = useState(0);

  // Accountants assigned to this firm
  interface AccountantRow { id: string; name: string; email: string; status: string; role: string; createdAt: string }
  const [accountants, setAccountants]         = useState<AccountantRow[]>([]);
  const [accountantsLoading, setAccountantsLoading] = useState(true);

  // Employees
  const [employees, setEmployees]   = useState<EmployeeRow[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empKey, setEmpKey]         = useState(0);

  // Pending employees
  const [pending, setPending]               = useState<PendingRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingKey, setPendingKey]         = useState(0);

  // Edit firm panel
  const [showEditPanel, setShowEditPanel]       = useState(false);
  const [editName, setEditName]                 = useState('');
  const [editRegNumber, setEditRegNumber]       = useState('');
  const [editEmail, setEditEmail]               = useState('');
  const [editPhone, setEditPhone]               = useState('');
  const [editPlan, setEditPlan]                 = useState('free');
  const [editSaving, setEditSaving]             = useState(false);
  const [firmRefreshKey, setFirmRefreshKey]     = useState(0);

  // LHDN fields
  const [editTin, setEditTin]                   = useState('');
  const [editBrn, setEditBrn]                   = useState('');
  const [editMsicCodes, setEditMsicCodes]       = useState<string[]>([]);
  const [editMsicInput, setEditMsicInput]       = useState('');
  const [editSst, setEditSst]                   = useState('');
  const [editAddr1, setEditAddr1]               = useState('');
  const [editAddr2, setEditAddr2]               = useState('');
  const [editCity, setEditCity]                  = useState('');
  const [editPostal, setEditPostal]             = useState('');
  const [editState, setEditState]               = useState('');
  const [editCountry, setEditCountry]           = useState('MYS');
  const [editLhdnId, setEditLhdnId]             = useState('');
  const [editLhdnSecret, setEditLhdnSecret]     = useState('');

  // Add Admin Modal
  const [showAdminModal, setShowAdminModal]       = useState(false);
  const [modalName, setModalName]       = useState('');
  const [modalEmail, setModalEmail]     = useState('');
  const [modalPhone, setModalPhone]     = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError]     = useState('');
  const [modalSaving, setModalSaving]   = useState(false);

  // Add Employee Modal
  const [showEmpModal, setShowEmpModal]   = useState(false);
  const [empName, setEmpName]             = useState('');
  const [empPhone, setEmpPhone]           = useState('');
  const [empEmail, setEmpEmail]           = useState('');
  const [empError, setEmpError]           = useState('');
  const [empSaving, setEmpSaving]         = useState(false);

  // Edit Employee Modal
  const [editEmp, setEditEmp]             = useState<EmployeeRow | null>(null);
  const [editEmpName, setEditEmpName]     = useState('');
  const [editEmpPhone, setEditEmpPhone]   = useState('');
  const [editEmpEmail, setEditEmpEmail]   = useState('');
  const [editEmpError, setEditEmpError]   = useState('');
  const [editEmpSaving, setEditEmpSaving] = useState(false);

  // Invite Accountant
  const [showInviteAcct, setShowInviteAcct]   = useState(false);
  const [inviteAcctEmail, setInviteAcctEmail] = useState('');
  const [inviteAcctError, setInviteAcctError] = useState('');
  const [inviteAcctSaving, setInviteAcctSaving] = useState(false);
  const [inviteAcctSuccess, setInviteAcctSuccess] = useState('');

  // Collapsible sections
  const [adminsOpen, setAdminsOpen]       = useState(false);
  const [empsOpen, setEmpsOpen]           = useState(false);
  const [accountantsOpen, setAccountantsOpen] = useState(false);

  // Table sorting
  const { sorted: sortedAdmins, toggleSort: toggleAdminSort, sortIndicator: adminSortIndicator } = useTableSort(admins, 'name', 'asc');
  const { sorted: sortedEmployees, toggleSort: toggleEmpSort, sortIndicator: empSortIndicator } = useTableSort(employees, 'name', 'asc');

  // ── Fetch firm details ──
  useEffect(() => {
    let cancelled = false;
    setFirmLoading(true);
    fetch('/api/firms/details')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const data = j.data ?? [];
          setAllFirms(data.map((f: FirmDetail) => ({ id: f.id, name: f.name })));
          const match = data.find((f: FirmDetail) => f.id === firmId);
          setFirm(match ?? null);
          setFirmLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setFirmLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, firmRefreshKey]);

  // ── Fetch accountants assigned to this firm ──
  useEffect(() => {
    let cancelled = false;
    setAccountantsLoading(true);
    fetch(`/api/accountant/firms/${firmId}/accountants`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setAccountants(j.data ?? []); setAccountantsLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setAccountantsLoading(false); });
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

  // ── Fetch employees ──
  useEffect(() => {
    let cancelled = false;
    setEmpLoading(true);
    fetch(`/api/employees?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setEmployees(j.data ?? []); setEmpLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setEmpLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, empKey]);

  // ── Fetch pending employees ──
  useEffect(() => {
    let cancelled = false;
    setPendingLoading(true);
    fetch(`/api/admin/employees/pending?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setPending(j.data ?? []); setPendingLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setPendingLoading(false); });
    return () => { cancelled = true; };
  }, [firmId, pendingKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refreshAdmins    = () => setAdminsKey((k) => k + 1);
  const refreshEmployees = () => setEmpKey((k) => k + 1);
  const refreshPending   = () => setPendingKey((k) => k + 1);
  const refreshAccountants = () => { setAccountantsLoading(true); fetch(`/api/accountant/firms/${firmId}/accountants`).then(r => r.json()).then(j => { setAccountants(j.data ?? []); setAccountantsLoading(false); }).catch(() => setAccountantsLoading(false)); };

  const inviteAccountant = async () => {
    if (!inviteAcctEmail.trim()) { setInviteAcctError('Email is required'); return; }
    setInviteAcctSaving(true);
    setInviteAcctError('');
    setInviteAcctSuccess('');
    try {
      const res = await fetch('/api/accountant/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteAcctEmail.trim(), firmIds: [firmId] }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteAcctError(json.error || 'Failed to invite'); return; }
      setInviteAcctSuccess(`Invite sent to ${inviteAcctEmail.trim()}`);
      setInviteAcctEmail('');
      refreshAccountants();
    } catch { setInviteAcctError('Failed to send invite'); }
    finally { setInviteAcctSaving(false); }
  };

  const openEditPanel = () => {
    if (!firm) return;
    setEditName(firm.name);
    setEditRegNumber(firm.registration_number ?? '');
    setEditEmail(firm.contact_email ?? '');
    setEditPhone(firm.contact_phone ?? '');
    setEditPlan(firm.plan);
    setEditTin(firm.tin ?? '');
    setEditBrn(firm.brn ?? '');
    setEditMsicCodes(firm.msic_code ? firm.msic_code.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    setEditMsicInput('');
    setEditSst(firm.sst_registration_number ?? '');
    setEditAddr1(firm.address_line1 ?? '');
    setEditAddr2(firm.address_line2 ?? '');
    setEditCity(firm.city ?? '');
    setEditPostal(firm.postal_code ?? '');
    setEditState(firm.state ?? '');
    setEditCountry(firm.country ?? 'MYS');
    setEditLhdnId(firm.lhdn_client_id ?? '');
    setEditLhdnSecret(firm.lhdn_client_secret ?? '');
    setShowEditPanel(true);
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/firms/${firmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          registrationNumber: editRegNumber.trim(),
          contactEmail: editEmail.trim(),
          contactPhone: editPhone.trim(),
          plan: editPlan,
          tin: editTin.trim(),
          brn: editBrn.trim(),
          msic_code: editMsicCodes.join(', '),
          sst_registration_number: editSst.trim(),
          address_line1: editAddr1.trim(),
          address_line2: editAddr2.trim(),
          city: editCity.trim(),
          postal_code: editPostal.trim(),
          state: editState.trim(),
          country: editCountry.trim(),
          lhdn_client_id: editLhdnId.trim(),
          lhdn_client_secret: editLhdnSecret.trim(),
        }),
      });
      if (res.ok) { setShowEditPanel(false); setFirmRefreshKey((k) => k + 1); window.dispatchEvent(new Event('setup-step-completed')); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  // ── Admin CRUD ──
  const openAdminModal = () => {
    setModalName(''); setModalEmail(''); setModalPhone(''); setModalPassword('');
    setModalError(''); setModalSaving(false); setShowAdminModal(true);
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
      setShowAdminModal(false);
      refreshAdmins();
      window.dispatchEvent(new Event('setup-step-completed'));
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  // ── Employee CRUD ──
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
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: empName.trim(),
          phone: empPhone.trim(),
          email: empEmail.trim() || undefined,
          firmId,
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

  const openEditEmpPanel = (emp: EmployeeRow) => {
    setEditEmp(emp);
    setEditEmpName(emp.name);
    setEditEmpPhone(emp.phone);
    setEditEmpEmail(emp.email ?? '');
    setEditEmpError('');
    setEditEmpSaving(false);
  };

  const submitEditEmp = async () => {
    if (!editEmp) return;
    if (!editEmpName.trim() || !editEmpPhone.trim()) {
      setEditEmpError('Name and phone are required.');
      return;
    }
    setEditEmpSaving(true);
    setEditEmpError('');
    try {
      const res = await fetch(`/api/employees/${editEmp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editEmpName.trim(),
          phone: editEmpPhone.trim(),
          email: editEmpEmail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEditEmpError(json.error || 'Failed to update employee');
        setEditEmpSaving(false);
        return;
      }
      setEditEmp(null);
      refreshEmployees();
    } catch {
      setEditEmpError('Network error. Please try again.');
      setEditEmpSaving(false);
    }
  };

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

  // ── Pending employee actions ──
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between bg-white border-b border-[#E0E3E5] pl-14 pr-6">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Client Details</h1>
        </header>

        <main className="flex-1 overflow-auto paper-texture">
          <div className="ledger-binding p-6 pl-14 flex flex-col gap-3 animate-in">

            {/* ── Back link ── */}
            <Link
              href="/accountant/clients"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 w-fit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
              Back to Clients
            </Link>

            {firmLoading ? (
              <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
            ) : !firm ? (
              <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Firm not found.</div>
            ) : (
              <>
                {/* ── SETUP CHECKLIST ── */}
                <SetupChecklist
                  firmId={firmId}
                  firms={allFirms}
                  onOpenEditFirm={openEditPanel}
                  onOpenAddAdmin={openAdminModal}
                />

                {/* ── FIRM INFO CARD ── */}
                <div className="card-button-pressed p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-title-md font-bold text-[var(--text-primary)]">{firm.name}</h2>
                    <button
                      data-setup="edit-firm"
                      onClick={openEditPanel}
                      className="btn-thick-white text-xs font-medium px-3 py-1.5 transition-all duration-300"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">Registration Number</p>
                      <p className="text-sm text-[var(--text-primary)]">{firm.registration_number ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">Contact Email</p>
                      <p className="text-sm text-[var(--text-primary)]">{firm.contact_email ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">Contact Phone</p>
                      <p className="text-sm text-[var(--text-primary)]">{firm.contact_phone ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">Plan</p>
                      {firm.plan === 'paid' ? (
                        <span className="badge-green">Paid</span>
                      ) : (
                        <span className="badge-gray">Free</span>
                      )}
                    </div>
                  </div>

                  {/* LHDN / E-Invoice Details */}
                  {(firm.tin || firm.brn || firm.msic_code || firm.sst_registration_number || firm.address_line1) && (
                    <div className="mt-3 pt-3 border-t border-[var(--outline-ghost)]">
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">LHDN / E-Invoice</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {firm.tin && (
                          <div>
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">TIN</p>
                            <p className="text-sm text-[var(--text-primary)]">{firm.tin}</p>
                          </div>
                        )}
                        {firm.brn && (
                          <div>
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">BRN</p>
                            <p className="text-sm text-[var(--text-primary)]">{firm.brn}</p>
                          </div>
                        )}
                        {firm.msic_code && (
                          <div>
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">MSIC Codes</p>
                            <div className="flex flex-wrap gap-1">
                              {firm.msic_code.split(',').map((c: string) => c.trim()).filter(Boolean).map((code: string) => (
                                <span key={code} className="inline-block bg-[var(--surface-sunken)] text-sm text-[var(--text-primary)] px-2 py-0.5 rounded">{code}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {firm.sst_registration_number && (
                          <div>
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">SST Registration</p>
                            <p className="text-sm text-[var(--text-primary)]">{firm.sst_registration_number}</p>
                          </div>
                        )}
                        {firm.address_line1 && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">Address</p>
                            <p className="text-sm text-[var(--text-primary)]">
                              {firm.address_line1}{firm.address_line2 ? `, ${firm.address_line2}` : ''}{firm.city ? `, ${firm.city}` : ''}{firm.postal_code ? ` ${firm.postal_code}` : ''}{firm.state ? `, ${firm.state}` : ''}
                            </p>
                          </div>
                        )}
                        {firm.lhdn_client_id && (
                          <div>
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">LHDN Credentials</p>
                            <span className="badge-green text-[10px]">Configured</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── QUICK LINKS ── */}
                <div className="card-button-pressed p-3 flex items-center gap-2.5">
                  <Link
                    href={`/accountant/claims?firmId=${firmId}`}
                    className="btn-thick-white text-sm px-4 py-2 font-medium"
                  >
                    View Claims
                  </Link>
                  <Link
                    href={`/accountant/receipts?firmId=${firmId}`}
                    className="btn-thick-white text-sm px-4 py-2 font-medium"
                  >
                    View Receipts
                  </Link>
                </div>

                {/* ── PENDING EMPLOYEES ── */}
                {!pendingLoading && pending.length > 0 && (
                  <div className="card-button-pressed overflow-hidden">
                    <div className="px-5 py-2.5 flex items-center gap-2">
                      <h2 className="text-body-md font-semibold text-amber-700">Pending Approval</h2>
                      <span className="badge-amber">{pending.length}</span>
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left">
                            <th className="px-5 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Name</th>
                            <th className="px-5 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Email</th>
                            <th className="px-5 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Phone</th>
                            <th className="px-5 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date Requested</th>
                            <th className="px-5 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pending.map((row, i) => (
                            <tr key={row.id} className={`group text-body-md hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                              <td data-col="Name" className="px-5 py-2.5 text-[var(--text-primary)] font-medium">{row.name}</td>
                              <td data-col="Email" className="px-5 py-2.5 text-[var(--text-secondary)]">{row.email}</td>
                              <td data-col="Phone" className="px-5 py-2.5 text-[var(--text-secondary)]">{row.phone || '—'}</td>
                              <td data-col="Date Requested" className="px-5 py-2.5 text-[var(--text-secondary)] tabular-nums">{formatDate(row.created_at)}</td>
                              <td className="px-5 py-2.5 flex items-center gap-3">
                                <button onClick={() => handleApprove(row.id)} className="btn-thick-green text-xs font-medium px-3 py-1.5">Approve</button>
                                <button onClick={() => handleReject(row.id)} className="btn-thick-red text-xs font-medium px-3 py-1.5">Reject</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── ADMINS SECTION ── */}
                <div className={adminsOpen ? 'card-button-pressed' : 'card-button'}>
                  <div className="flex items-center justify-between px-5 py-3" onClick={() => setAdminsOpen(!adminsOpen)}>
                    <div className="flex items-center gap-2.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${adminsOpen ? 'rotate-90' : ''}`}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <p className="text-title-sm font-semibold text-[var(--text-primary)]">Admins</p>
                      {!adminsLoading && <span className="badge-blue">{admins.length}</span>}
                    </div>
                    <button
                      data-setup="add-admin"
                      onClick={(e) => { e.stopPropagation(); openAdminModal(); }}
                      className="btn-thick-navy text-xs px-3 py-1.5 font-medium transition-all duration-300"
                    >
                      Add Admin
                    </button>
                  </div>
                  {adminsOpen && (
                    adminsLoading ? (
                      <div className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
                    ) : admins.length === 0 ? (
                      <div className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">No admins found.</div>
                    ) : (
                      <table className="w-full ds-table-chassis">
                        <thead>
                          <tr className="ds-table-header text-left">
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleAdminSort('name')}>Name{adminSortIndicator('name')}</th>
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleAdminSort('email')}>Email{adminSortIndicator('email')}</th>
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleAdminSort('status')}>Status{adminSortIndicator('status')}</th>
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleAdminSort('created_at')}>Created{adminSortIndicator('created_at')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedAdmins.map((admin, i) => (
                            <tr key={admin.id} className={`ds-table-row text-body-md ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                              <td data-col="Name" className="px-5 py-2.5 text-[var(--text-primary)] font-medium">{admin.name}</td>
                              <td data-col="Email" className="px-5 py-2.5 text-[var(--text-secondary)]">{admin.email}</td>
                              <td data-col="Status" className="px-5 py-2.5">
                                {admin.status === 'active' ? (
                                  <span className="badge-green">Active</span>
                                ) : (
                                  <span className="badge-gray">Inactive</span>
                                )}
                              </td>
                              <td data-col="Created" className="px-5 py-2.5 text-[var(--text-secondary)] tabular-nums">{formatDate(admin.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>

                {/* ── ACCOUNTANTS SECTION ── */}
                <div className={accountantsOpen ? 'card-button-pressed' : 'card-button'}>
                  <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setAccountantsOpen(!accountantsOpen)}>
                    <div className="flex items-center gap-2.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${accountantsOpen ? 'rotate-90' : ''}`}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <p className="text-title-sm font-semibold text-[var(--text-primary)]">Accountants</p>
                      {!accountantsLoading && <span className="badge-blue">{accountants.length}</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setShowInviteAcct(!showInviteAcct); setAccountantsOpen(true); setInviteAcctError(''); setInviteAcctSuccess(''); }} className="btn-thick-navy text-xs font-medium px-3 py-1.5">
                      Add Accountant
                    </button>
                  </div>
                  {accountantsOpen && showInviteAcct && (
                    <div className="px-5 py-3 border-b border-[var(--outline-ghost)] bg-[var(--surface-low)]">
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={inviteAcctEmail}
                          onChange={(e) => setInviteAcctEmail(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') inviteAccountant(); }}
                          className="input-recessed flex-1 text-sm"
                          placeholder="Accountant email address..."
                        />
                        <button onClick={inviteAccountant} disabled={inviteAcctSaving} className="btn-approve text-xs font-medium px-3 py-1.5 disabled:opacity-40">
                          {inviteAcctSaving ? 'Sending...' : 'Send Invite'}
                        </button>
                      </div>
                      {inviteAcctError && <p className="text-xs text-[var(--reject-red)] mt-1.5">{inviteAcctError}</p>}
                      {inviteAcctSuccess && <p className="text-xs text-[var(--match-green)] mt-1.5">{inviteAcctSuccess}</p>}
                    </div>
                  )}
                  {accountantsOpen && (
                    accountantsLoading ? (
                      <div className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
                    ) : accountants.length === 0 ? (
                      <div className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">No accountants assigned.</div>
                    ) : (
                      <table className="w-full ds-table-chassis">
                        <thead>
                          <tr className="ds-table-header text-left">
                            <th className="px-5 py-2">Name</th>
                            <th className="px-5 py-2">Email</th>
                            <th className="px-5 py-2">Role</th>
                            <th className="px-5 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountants.map((acc, i) => (
                            <tr key={acc.id} className={`ds-table-row text-body-md ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                              <td className="px-5 py-2.5 text-[var(--text-primary)] font-medium">{acc.name}</td>
                              <td className="px-5 py-2.5 text-[var(--text-secondary)]">{acc.email}</td>
                              <td className="px-5 py-2.5">
                                {acc.role === 'owner' ? <span className="badge-blue">Owner</span> : <span className="badge-gray">Member</span>}
                              </td>
                              <td className="px-5 py-2.5">
                                {acc.status === 'active' ? <span className="badge-green">Active</span> : <span className="badge-gray">{acc.status}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>

                {/* ── EMPLOYEES SECTION ── */}
                <div className={empsOpen ? 'card-button-pressed' : 'card-button'}>
                  <div className="flex items-center justify-between px-5 py-3" onClick={() => setEmpsOpen(!empsOpen)}>
                    <div className="flex items-center gap-3">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${empsOpen ? 'rotate-90' : ''}`}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <p className="text-title-sm font-semibold text-[var(--text-primary)]">Employees</p>
                      {!empLoading && <span className="badge-blue">{employees.length}</span>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEmpModal(); }}
                      className="btn-thick-navy text-xs px-3 py-1.5 font-medium"
                    >
                      Add Employee
                    </button>
                  </div>
                  {empsOpen && (
                    empLoading ? (
                      <div className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
                    ) : employees.length === 0 ? (
                      <div className="px-5 py-6 text-center text-sm text-[var(--text-secondary)]">No employees found.</div>
                    ) : (
                      <table className="w-full ds-table-chassis">
                        <thead>
                          <tr className="ds-table-header text-left">
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleEmpSort('name')}>Name{empSortIndicator('name')}</th>
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleEmpSort('phone')}>Phone{empSortIndicator('phone')}</th>
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleEmpSort('email')}>Email{empSortIndicator('email')}</th>
                            <th className="px-5 py-2 text-right cursor-pointer select-none" onClick={() => toggleEmpSort('claims_count')}>Claims{empSortIndicator('claims_count')}</th>
                            <th className="px-5 py-2 text-right cursor-pointer select-none" onClick={() => toggleEmpSort('outstanding')}>Outstanding{empSortIndicator('outstanding')}</th>
                            <th className="px-5 py-2 cursor-pointer select-none" onClick={() => toggleEmpSort('is_active')}>Status{empSortIndicator('is_active')}</th>
                            <th className="px-5 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedEmployees.map((emp, i) => (
                            <tr key={emp.id} className={`ds-table-row text-body-md ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                              <td data-col="Name" className="px-5 py-2.5 text-[var(--text-primary)] font-medium">{emp.name}</td>
                              <td data-col="Phone" className="px-5 py-2.5 text-[var(--text-secondary)]">{emp.phone}</td>
                              <td data-col="Email" className="px-5 py-2.5 text-[var(--text-secondary)]">{emp.email ?? '—'}</td>
                              <td data-col="Claims" className="px-5 py-2.5 text-[var(--text-primary)] font-semibold text-right tabular-nums">{emp.claims_count}</td>
                              <td data-col="Outstanding" className="px-5 py-2.5 text-right tabular-nums">
                                {Number(emp.outstanding) > 0 ? (
                                  <Link href={`/accountant/employees/${emp.id}/claims-account`} className="text-[var(--reject-red)] font-semibold hover:underline">
                                    RM {Number(emp.outstanding).toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-secondary)]">—</span>
                                )}
                              </td>
                              <td data-col="Status" className="px-5 py-2.5">
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
                              <td className="px-5 py-2.5 flex items-center gap-2">
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
              </>
            )}

          </div>
        </main>
      </div>

      {/* === EDIT CLIENT MODAL === */}
      {showEditPanel && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setShowEditPanel(false)}>
          <div className="bg-white shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[var(--primary)] px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-white uppercase tracking-wide">Edit Client</h2>
              <button onClick={() => setShowEditPanel(false)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Firm Name *</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-recessed w-full" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Registration Number *</label>
                  <input type="text" value={editRegNumber} onChange={(e) => setEditRegNumber(e.target.value)} className="input-recessed w-full" placeholder="Company registration number" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contact Email *</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-recessed w-full" placeholder="firm@example.com" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contact Phone</label>
                  <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Plan</label>
                  <select value={editPlan} onChange={(e) => setEditPlan(e.target.value)} className="input-recessed w-full">
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              {/* LHDN / E-Invoice Section */}
              <div className="pt-2">
                <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">LHDN / E-Invoice</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">TIN</label>
                      <input type="text" value={editTin} onChange={(e) => setEditTin(e.target.value)} className="input-recessed w-full" placeholder="Tax ID Number" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">BRN</label>
                      <input type="text" value={editBrn} onChange={(e) => setEditBrn(e.target.value)} className="input-recessed w-full" placeholder="Business Reg No" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">MSIC Codes</label>
                    <div className="input-recessed w-full flex flex-wrap gap-1 items-center min-h-[36px] px-2 py-1">
                      {editMsicCodes.map((code) => (
                        <span key={code} className="inline-flex items-center gap-1 bg-[var(--surface-sunken)] text-xs text-[var(--text-primary)] pl-2 pr-1 py-0.5 rounded">
                          {code}
                          <button type="button" onClick={() => setEditMsicCodes((prev) => prev.filter((c) => c !== code))} className="text-[var(--text-secondary)] hover:text-red-500 text-sm leading-none cursor-pointer">&times;</button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={editMsicInput}
                        onChange={(e) => setEditMsicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ',') && editMsicInput.trim()) {
                            e.preventDefault();
                            const code = editMsicInput.trim().replace(/,/g, '');
                            if (code && !editMsicCodes.includes(code)) setEditMsicCodes((prev) => [...prev, code]);
                            setEditMsicInput('');
                          }
                          if (e.key === 'Backspace' && !editMsicInput && editMsicCodes.length) {
                            setEditMsicCodes((prev) => prev.slice(0, -1));
                          }
                        }}
                        onBlur={() => {
                          const code = editMsicInput.trim().replace(/,/g, '');
                          if (code && !editMsicCodes.includes(code)) setEditMsicCodes((prev) => [...prev, code]);
                          setEditMsicInput('');
                        }}
                        className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-[var(--text-secondary)]"
                        placeholder={editMsicCodes.length ? '' : '5-digit code, press Enter to add'}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">SST Registration</label>
                    <input type="text" value={editSst} onChange={(e) => setEditSst(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="pt-2">
                <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Address</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Address Line 1</label>
                    <input type="text" value={editAddr1} onChange={(e) => setEditAddr1(e.target.value)} className="input-recessed w-full" placeholder="Street address" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Address Line 2</label>
                    <input type="text" value={editAddr2} onChange={(e) => setEditAddr2(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">City</label>
                      <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)} className="input-recessed w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Postal Code</label>
                      <input type="text" value={editPostal} onChange={(e) => setEditPostal(e.target.value)} className="input-recessed w-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">State</label>
                      <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)} className="input-recessed w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Country</label>
                      <input type="text" value={editCountry} onChange={(e) => setEditCountry(e.target.value)} className="input-recessed w-full" placeholder="MYS" />
                    </div>
                  </div>
                </div>
              </div>

              {/* LHDN Credentials Section */}
              <div className="pt-2">
                <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">LHDN API Credentials (Optional)</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3">Only needed if this firm uses their own LHDN credentials instead of the platform default.</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Client ID</label>
                    <input type="text" value={editLhdnId} onChange={(e) => setEditLhdnId(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Client Secret</label>
                    <input type="password" value={editLhdnSecret} onChange={(e) => setEditLhdnSecret(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-low)] p-4 flex-shrink-0 flex gap-3">
              <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setShowEditPanel(false)} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ADD ADMIN MODAL === */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="bg-[var(--primary)] px-6 py-4">
              <h3 className="text-base font-bold text-white uppercase tracking-wide">Add Admin</h3>
              <p className="text-sm text-white/70 mt-0.5">Create a new admin user for this firm.</p>
            </div>

            <div className="p-6">
              {modalError && (
                <div className="mb-4 bg-[var(--error-container)] p-3">
                  <p className="text-sm text-[var(--on-error-container)]">{modalError}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Full Name *</label>
                  <input type="text" value={modalName} onChange={(e) => setModalName(e.target.value)} className="input-recessed w-full" placeholder="Admin name" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email *</label>
                  <input type="email" value={modalEmail} onChange={(e) => setModalEmail(e.target.value)} className="input-recessed w-full" placeholder="admin@example.com" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone</label>
                  <input type="text" value={modalPhone} onChange={(e) => setModalPhone(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Temporary Password *</label>
                  <input type="password" value={modalPassword} onChange={(e) => setModalPassword(e.target.value)} className="input-recessed w-full" placeholder="Min 8 characters" />
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-low)] px-6 py-4 flex gap-3">
              <button onClick={submitAdmin} disabled={modalSaving} className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {modalSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button onClick={() => setShowAdminModal(false)} disabled={modalSaving} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40">
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
              <h3 className="text-base font-bold text-white uppercase tracking-wide">Add Employee</h3>
              <p className="text-sm text-white/70 mt-0.5">Create a new employee for this firm.</p>
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
              <h2 className="text-base font-bold text-white uppercase tracking-wide">Edit Employee</h2>
              <button onClick={() => setEditEmp(null)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-4">
              {editEmpError && (
                <div className="bg-[var(--error-container)] p-3">
                  <p className="text-sm text-[var(--on-error-container)]">{editEmpError}</p>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                <input type="text" value={editEmpName} onChange={(e) => setEditEmpName(e.target.value)} className="input-recessed w-full" placeholder="Employee name" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone *</label>
                <input type="text" value={editEmpPhone} onChange={(e) => setEditEmpPhone(e.target.value)} className="input-recessed w-full" placeholder="e.g. +60123456789" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email</label>
                <input type="email" value={editEmpEmail} onChange={(e) => setEditEmpEmail(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
              </div>
            </div>

            <div className="flex-shrink-0 p-4 bg-[var(--surface-low)] flex gap-3">
              <button onClick={submitEditEmp} disabled={editEmpSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed">
                {editEmpSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditEmp(null)} disabled={editEmpSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
