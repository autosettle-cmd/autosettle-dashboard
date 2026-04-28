'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePageTitle } from '@/lib/use-page-title';


// ─── Team types ──────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  firms: { id: string; name: string }[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirmRow {
  id: string;
  name: string;
  registration_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  plan: string;
  receipt_count: number;
  is_active: boolean;
  employee_count: number;
  claims_this_month: number;
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientsPage() {
  usePageTitle('Clients');
  // Data
  const [firms, setFirms]           = useState<FirmRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal
  const [showModal, setShowModal]               = useState(false);
  const [modalName, setModalName]               = useState('');
  const [modalRegNumber, setModalRegNumber]     = useState('');
  const [modalEmail, setModalEmail]             = useState('');
  const [modalPhone, setModalPhone]             = useState('');
  const [modalPlan, setModalPlan]               = useState('free');
  const [modalError, setModalError]             = useState('');
  const [modalSaving, setModalSaving]           = useState(false);

  // Edit panel
  const [editFirm, setEditFirm]                 = useState<FirmRow | null>(null);
  const [editName, setEditName]                 = useState('');
  const [editRegNumber, setEditRegNumber]       = useState('');
  const [editEmail, setEditEmail]               = useState('');
  const [editPhone, setEditPhone]               = useState('');
  const [editPlan, setEditPlan]                 = useState('free');
  const [editSaving, setEditSaving]             = useState(false);
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

  // Team management
  const [isOwner, setIsOwner]                     = useState(false);
  const [teamMembers, setTeamMembers]             = useState<TeamMember[]>([]);
  const [showInvite, setShowInvite]               = useState(false);
  const [inviteEmail, setInviteEmail]             = useState('');
  const [inviteFirmIds, setInviteFirmIds]         = useState<string[]>([]);
  const [inviteError, setInviteError]             = useState('');
  const [inviteSaving, setInviteSaving]           = useState(false);
  const [showTeam, setShowTeam]                   = useState(false);
  const [editMember, setEditMember]               = useState<TeamMember | null>(null);
  const [editMemberFirmIds, setEditMemberFirmIds] = useState<string[]>([]);

  // Setup status per firm: firmId → list of missing steps
  const [setupStatus, setSetupStatus] = useState<Record<string, string[]>>({});

  // Load firms + setup status
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/firms/details')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const data: FirmRow[] = j.data ?? [];
        setFirms(data);
        setLoading(false);

        // Fetch setup status for each firm in parallel
        Promise.all(data.map(f =>
          fetch(`/api/accountant/firms/${f.id}/setup-status`).then(r => r.json()).catch(() => null)
        )).then(results => {
          if (cancelled) return;
          const status: Record<string, string[]> = {};
          data.forEach((f, i) => {
            const d = results[i]?.data;
            if (!d) return;
            const missing: string[] = [];
            if (!d.firmDetails?.complete) missing.push('Firm Details');
            if (!d.chartOfAccounts?.complete) missing.push('Chart of Accounts');
            if (!d.glDefaults?.complete) missing.push('GL Defaults');
            if (!d.categories?.complete) missing.push('Category Mapping');
            if (!d.fiscalYear?.complete) missing.push('Fiscal Year');
            if (missing.length > 0) status[f.id] = missing;
          });
          setSetupStatus(status);
        });
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // Load team members (determines if user is owner)
  useEffect(() => {
    fetch('/api/accountant/team')
      .then((r) => { if (r.ok) { setIsOwner(true); return r.json(); } setIsOwner(false); return null; })
      .then((j) => { if (j?.data) setTeamMembers(j.data); })
      .catch(() => setIsOwner(false));
  }, [refreshKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const submitInvite = async () => {
    if (!inviteEmail.trim()) { setInviteError('Email is required'); return; }
    if (inviteFirmIds.length === 0) { setInviteError('Select at least one firm'); return; }
    setInviteSaving(true);
    setInviteError('');
    try {
      const res = await fetch('/api/accountant/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), firmIds: inviteFirmIds }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteError(json.error || 'Failed to send invite'); setInviteSaving(false); return; }
      setShowInvite(false);
      setInviteEmail('');
      setInviteFirmIds([]);
      refresh();
    } catch { setInviteError('Failed to send invite'); }
    finally { setInviteSaving(false); }
  };

  const updateMemberFirms = async (memberId: string, firmIds: string[]) => {
    try {
      const res = await fetch(`/api/accountant/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmIds }),
      });
      if (res.ok) { setEditMember(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  const removeMember = async (memberId: string) => {
    if (!confirm('Remove this team member? They will no longer be able to access any firms.')) return;
    try {
      const res = await fetch(`/api/accountant/team/${memberId}`, { method: 'DELETE' });
      if (res.ok) refresh();
    } catch (e) { console.error(e); }
  };

  const toggleInviteFirm = (firmId: string) => {
    setInviteFirmIds((prev) => prev.includes(firmId) ? prev.filter((id) => id !== firmId) : [...prev, firmId]);
  };

  const toggleEditFirm = (firmId: string) => {
    setEditMemberFirmIds((prev) => prev.includes(firmId) ? prev.filter((id) => id !== firmId) : [...prev, firmId]);
  };

  const openEdit = (firm: FirmRow) => {
    setEditFirm(firm);
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
  };

  const saveEdit = async () => {
    if (!editFirm) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/firms/${editFirm.id}`, {
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
      if (res.ok) { setEditFirm(null); refresh(); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const openAddModal = () => {
    setModalName('');
    setModalRegNumber('');
    setModalEmail('');
    setModalPhone('');
    setModalPlan('free');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitFirm = async () => {
    if (!modalName.trim()) {
      setModalError('Name is required.');
      return;
    }

    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch('/api/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modalName.trim(),
          registrationNumber: modalRegNumber.trim() || undefined,
          contactEmail: modalEmail.trim() || undefined,
          contactPhone: modalPhone.trim() || undefined,
          plan: modalPlan,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to create client');
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
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Clients</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">

          {/* ── Action bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {isOwner && (
              <>
                <button onClick={() => setShowTeam((v) => !v)} className="btn-thick-white text-sm px-4 py-2 font-medium">
                  {showTeam ? 'Hide Team' : `My Team${teamMembers.length > 0 ? ` (${teamMembers.length})` : ''}`}
                </button>
                <button onClick={() => { setShowInvite(true); setInviteEmail(''); setInviteFirmIds([]); setInviteError(''); }} className="btn-thick-white text-sm px-4 py-2 font-medium">
                  Invite Team Member
                </button>
              </>
            )}
            <button
              onClick={openAddModal}
              className="ml-auto btn-thick-navy text-sm px-4 py-2 font-medium"
            >
              Add Client
            </button>
          </div>

          {/* ── Team Members Section ─────────────────────── */}
          {isOwner && showTeam && (
            <div className="bg-white p-5 flex-shrink-0 border border-[var(--outline-ghost)]">
              <h2 className="text-xs font-label font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-3">Team Members</h2>
              {teamMembers.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No team members yet. Invite someone to get started.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Name</th>
                      <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Email</th>
                      <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                      <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Firms</th>
                      <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((m, i) => (
                      <tr key={m.id} className={i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}>
                        <td className="px-4 py-2.5 font-medium">{m.name}</td>
                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{m.email}</td>
                        <td className="px-4 py-2.5">
                          {m.status === 'active' ? <span className="badge-green">Active</span>
                            : m.status === 'pending_onboarding' ? <span className="badge-amber">Pending</span>
                            : <span className="badge-gray">{m.status}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {m.firms.map((f) => (
                              <span key={f.id} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-[var(--surface-low)] text-[var(--text-secondary)]">{f.name}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditMember(m); setEditMemberFirmIds(m.firms.map((f) => f.id)); }}
                              className="text-xs text-[var(--primary)] hover:underline font-medium"
                            >Edit Firms</button>
                            <button
                              onClick={() => removeMember(m.id)}
                              className="text-xs text-[var(--reject-red)] hover:underline font-medium"
                            >Remove</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Table ─────────────────────────────────────── */}
          <div className="bg-white overflow-hidden flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
            ) : firms.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">No clients found.</div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Firm Name</th>
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Reg. Number</th>
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Employees</th>
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Claims This Month</th>
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Plan</th>
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Receipts</th>
                      <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firms.map((firm, i) => (
                      <tr key={firm.id} className={`group hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`} onClick={() => window.location.href = `/accountant/clients/${firm.id}`}>
                        <td data-col="Firm Name" className="px-6 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/accountant/clients/${firm.id}`}
                              className="text-[var(--primary)] hover:underline font-semibold transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {firm.name}
                            </Link>
                            {setupStatus[firm.id] && (
                              <span className="relative group/tip">
                                <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-[var(--reject-red)] text-white" style={{ borderRadius: '2px' }}>!</span>
                                <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-[#191C1E] text-white text-[11px] px-3 py-2 whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-30 shadow-lg" style={{ borderRadius: '2px' }}>
                                  <span className="block font-bold text-[10px] uppercase tracking-wider text-white/50 mb-1">Setup incomplete</span>
                                  {setupStatus[firm.id].map(s => (
                                    <span key={s} className="block">• {s}</span>
                                  ))}
                                </span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-col="Reg. Number" className="px-6 py-3 text-[var(--text-secondary)]">{firm.registration_number ?? '—'}</td>
                        <td data-col="Employees" className="px-6 py-3 text-[var(--text-primary)] font-medium text-right tabular-nums">{firm.employee_count}</td>
                        <td data-col="Claims This Month" className="px-6 py-3 text-[var(--text-primary)] font-medium text-right tabular-nums">{firm.claims_this_month}</td>
                        <td data-col="Plan" className="px-6 py-3">
                          {firm.plan === 'paid' ? (
                            <span className="badge-green">Paid</span>
                          ) : (
                            <span className="badge-gray">Free</span>
                          )}
                        </td>
                        <td data-col="Receipts" className={`px-6 py-3 text-right tabular-nums ${firm.receipt_count >= 450 ? 'text-amber-600 font-medium' : 'text-[var(--text-secondary)]'}`}>
                          {firm.receipt_count} / 500
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(firm)}
                              className="btn-thick-white text-xs font-medium px-3 py-1.5"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(`/api/firms/${firm.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ is_active: !firm.is_active }),
                                  });
                                  if (res.ok) { refresh(); }
                                  else {
                                    const json = await res.json();
                                    alert(json.error || 'Failed');
                                  }
                                } catch (e2) {
                                  console.error(e2);
                                }
                              }}
                              className="btn-thick-white text-xs font-medium px-3 py-1.5"
                            >
                              {firm.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
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

      {/* === EDIT CLIENT MODAL === */}
      {editFirm && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setEditFirm(null)}>
          <div className="bg-white shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-[var(--primary)]">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Edit Client</h2>
              <button onClick={() => setEditFirm(null)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Firm Name *</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-recessed w-full" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Registration Number *</label>
                  <input type="text" value={editRegNumber} onChange={(e) => setEditRegNumber(e.target.value)} className="input-recessed w-full" placeholder="Company registration number" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Contact Email *</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-recessed w-full" placeholder="firm@example.com" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Contact Phone</label>
                  <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Plan</label>
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
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">TIN</label>
                      <input type="text" value={editTin} onChange={(e) => setEditTin(e.target.value)} className="input-recessed w-full" placeholder="Tax ID Number" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">BRN</label>
                      <input type="text" value={editBrn} onChange={(e) => setEditBrn(e.target.value)} className="input-recessed w-full" placeholder="Business Reg No" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">MSIC Codes</label>
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
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">SST Registration</label>
                    <input type="text" value={editSst} onChange={(e) => setEditSst(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="pt-2">
                <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Address</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Address Line 1</label>
                    <input type="text" value={editAddr1} onChange={(e) => setEditAddr1(e.target.value)} className="input-recessed w-full" placeholder="Street address" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Address Line 2</label>
                    <input type="text" value={editAddr2} onChange={(e) => setEditAddr2(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">City</label>
                      <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)} className="input-recessed w-full" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Postal Code</label>
                      <input type="text" value={editPostal} onChange={(e) => setEditPostal(e.target.value)} className="input-recessed w-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">State</label>
                      <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)} className="input-recessed w-full" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Country</label>
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
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Client ID</label>
                    <input type="text" value={editLhdnId} onChange={(e) => setEditLhdnId(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Client Secret</label>
                    <input type="password" value={editLhdnSecret} onChange={(e) => setEditLhdnSecret(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-[var(--surface-low)] p-3 space-y-2">
                <Field label="Employees" value={String(editFirm.employee_count)} />
                <Field label="Claims This Month" value={String(editFirm.claims_this_month)} />
                <Field label="Receipts" value={`${editFirm.receipt_count} / 500`} />
                <Field label="Status" value={editFirm.is_active ? 'Active' : 'Inactive'} />
              </div>
            </div>

            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)] flex gap-3">
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditFirm(null)} className="flex-1 py-2.5 text-sm font-semibold btn-thick-white">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ADD CLIENT MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Add Client</h3>
              <p className="text-xs text-white/70 mt-1">Create a new client firm.</p>
            </div>

            <div className="p-6 space-y-3">
              {modalError && (
                <div className="bg-[var(--error-container)] p-3">
                  <p className="text-sm text-[var(--on-error-container)]">{modalError}</p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Name *</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="input-recessed w-full"
                  placeholder="Firm name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Registration Number</label>
                <input
                  type="text"
                  value={modalRegNumber}
                  onChange={(e) => setModalRegNumber(e.target.value)}
                  className="input-recessed w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Contact Email</label>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className="input-recessed w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={modalPhone}
                  onChange={(e) => setModalPhone(e.target.value)}
                  className="input-recessed w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Plan</label>
                <select
                  value={modalPlan}
                  onChange={(e) => setModalPlan(e.target.value)}
                  className="input-recessed w-full"
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={submitFirm}
                disabled={modalSaving}
                className="flex-1 py-2.5 text-sm font-semibold btn-thick-navy disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Client'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 text-sm font-semibold btn-thick-white disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite Team Member Modal ──────────────── */}
      {showInvite && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setShowInvite(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowInvite(false)}>
            <div className="bg-white w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="h-12 flex items-center justify-between px-5 bg-[var(--primary)]">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invite Team Member</h2>
                <button onClick={() => setShowInvite(false)} className="btn-thick-red w-7 h-7 !p-0" title="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                {inviteError && (
                  <div className="bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-700">{inviteError}</p>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email Address *</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input-recessed w-full" placeholder="colleague@example.com" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Assign to Firms *</label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {firms.map((f) => (
                      <label key={f.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-low)] cursor-pointer transition-colors">
                        <input type="checkbox" checked={inviteFirmIds.includes(f.id)} onChange={() => toggleInviteFirm(f.id)} className="w-4 h-4" />
                        <span className="text-sm text-[var(--text-primary)]">{f.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowInvite(false)} className="btn-thick-white px-4 py-2 text-sm font-medium">Cancel</button>
                  <button onClick={submitInvite} disabled={inviteSaving} className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-40">
                    {inviteSaving ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Edit Member Firms Modal ──────────────── */}
      {editMember && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setEditMember(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setEditMember(null)}>
            <div className="bg-white w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="h-12 flex items-center justify-between px-5 bg-[var(--primary)]">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">Edit Firm Access — {editMember.name}</h2>
                <button onClick={() => setEditMember(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Assign to Firms</label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {firms.map((f) => (
                      <label key={f.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-low)] cursor-pointer transition-colors">
                        <input type="checkbox" checked={editMemberFirmIds.includes(f.id)} onChange={() => toggleEditFirm(f.id)} className="w-4 h-4" />
                        <span className="text-sm text-[var(--text-primary)]">{f.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setEditMember(null)} className="btn-thick-white px-4 py-2 text-sm font-medium">Cancel</button>
                  <button onClick={() => updateMemberFirms(editMember.id, editMemberFirmIds)} disabled={editMemberFirmIds.length === 0} className="btn-primary px-4 py-2 text-sm font-bold disabled:opacity-40">
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Small reusable sub-components ────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-body-md">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] font-medium tabular-nums">{value}</span>
    </div>
  );
}
