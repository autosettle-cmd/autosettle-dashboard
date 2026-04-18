'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

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
  const [editMsic, setEditMsic]                 = useState('');
  const [editSst, setEditSst]                   = useState('');
  const [editAddr1, setEditAddr1]               = useState('');
  const [editAddr2, setEditAddr2]               = useState('');
  const [editCity, setEditCity]                  = useState('');
  const [editPostal, setEditPostal]             = useState('');
  const [editState, setEditState]               = useState('');
  const [editCountry, setEditCountry]           = useState('MYS');
  const [editLhdnId, setEditLhdnId]             = useState('');
  const [editLhdnSecret, setEditLhdnSecret]     = useState('');

  // Load firms
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/firms/details')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setFirms(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const openEdit = (firm: FirmRow) => {
    setEditFirm(firm);
    setEditName(firm.name);
    setEditRegNumber(firm.registration_number ?? '');
    setEditEmail(firm.contact_email ?? '');
    setEditPhone(firm.contact_phone ?? '');
    setEditPlan(firm.plan);
    setEditTin(firm.tin ?? '');
    setEditBrn(firm.brn ?? '');
    setEditMsic(firm.msic_code ?? '');
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
          msic_code: editMsic.trim(),
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
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">

      <Sidebar role="accountant" />

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Clients</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">

          {/* ── Action bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <button
              onClick={openAddModal}
              className="ml-auto btn-thick-navy text-sm px-4 py-2 font-medium"
            >
              Add Client
            </button>
          </div>

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
                      <tr key={firm.id} className={`group hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td className="px-6 py-3 font-medium">
                          <Link
                            href={`/accountant/clients/${firm.id}`}
                            className="text-[var(--text-primary)] hover:text-[var(--primary)] transition-colors"
                          >
                            {firm.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-[var(--text-secondary)]">{firm.registration_number ?? '—'}</td>
                        <td className="px-6 py-3 text-[var(--text-primary)] font-medium text-right tabular-nums">{firm.employee_count}</td>
                        <td className="px-6 py-3 text-[var(--text-primary)] font-medium text-right tabular-nums">{firm.claims_this_month}</td>
                        <td className="px-6 py-3">
                          {firm.plan === 'paid' ? (
                            <span className="badge-green">Paid</span>
                          ) : (
                            <span className="badge-gray">Free</span>
                          )}
                        </td>
                        <td className={`px-6 py-3 text-right tabular-nums ${firm.receipt_count >= 450 ? 'text-amber-600 font-medium' : 'text-[var(--text-secondary)]'}`}>
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
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/firms/${firm.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ is_active: !firm.is_active }),
                                  });
                                  if (res.ok) refresh();
                                } catch (e) {
                                  console.error(e);
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
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Registration Number</label>
                  <input type="text" value={editRegNumber} onChange={(e) => setEditRegNumber(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Contact Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">MSIC Code</label>
                      <input type="text" value={editMsic} onChange={(e) => setEditMsic(e.target.value)} className="input-recessed w-full" placeholder="5-digit code" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">SST Registration</label>
                      <input type="text" value={editSst} onChange={(e) => setEditSst(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                    </div>
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

    </div>
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
