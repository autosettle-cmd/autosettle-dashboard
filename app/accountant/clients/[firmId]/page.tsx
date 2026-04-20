'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePageTitle } from '@/lib/use-page-title';

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
  const [firmLoading, setFirmLoading]     = useState(true);
  const [admins, setAdmins]               = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsKey, setAdminsKey]         = useState(0);

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
  }, [firmId, firmRefreshKey]);

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

  const openEditPanel = () => {
    if (!firm) return;
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
      if (res.ok) { setShowEditPanel(false); setFirmRefreshKey((k) => k + 1); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

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
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between bg-white border-b border-[#E0E3E5] pl-14 pr-6">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Firm Details</h1>
        </header>

        <main className="flex-1 overflow-auto paper-texture">
          <div className="ledger-binding p-8 pl-14 flex flex-col gap-4 animate-in">

            {/* ── Back link ── */}
            <Link
              href="/accountant/clients"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 w-fit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
              Back to Clients
            </Link>

            {firmLoading ? (
              <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
            ) : !firm ? (
              <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Firm not found.</div>
            ) : (
              <>
                {/* ── FIRM INFO CARD ── */}
                <div className="bg-white card-popped p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{firm.name}</h2>
                    <button
                      onClick={openEditPanel}
                      className="btn-thick-white text-xs font-medium px-3 py-1.5"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    <div className="mt-4 pt-4">
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">LHDN / E-Invoice</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                            <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">MSIC Code</p>
                            <p className="text-sm text-[var(--text-primary)]">{firm.msic_code}</p>
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
                <div className="flex items-center gap-3">
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

                {/* ── ADMINS SECTION ── */}
                <div className="bg-white card-popped overflow-hidden">
                  <div className="px-6 py-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Admins</h2>
                    <button
                      onClick={openModal}
                      className="btn-thick-navy text-xs px-3 py-1.5 font-medium"
                    >
                      Add Admin
                    </button>
                  </div>
                  {adminsLoading ? (
                    <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
                  ) : admins.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-[var(--text-secondary)]">No admins found for this firm.</div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Name</th>
                            <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Email</th>
                            <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Status</th>
                            <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Date Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {admins.map((admin, i) => (
                            <tr key={admin.id} className={`text-sm hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]'}`}>
                              <td data-col="Name" className="px-6 py-3 text-[var(--text-primary)] font-medium">{admin.name}</td>
                              <td data-col="Email" className="px-6 py-3 text-[var(--text-secondary)]">{admin.email}</td>
                              <td data-col="Status" className="px-6 py-3">
                                {admin.status === 'active' ? (
                                  <span className="badge-green">Active</span>
                                ) : (
                                  <span className="badge-gray">Inactive</span>
                                )}
                              </td>
                              <td data-col="Date Added" className="px-6 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(admin.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Registration Number</label>
                  <input type="text" value={editRegNumber} onChange={(e) => setEditRegNumber(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contact Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">MSIC Code</label>
                      <input type="text" value={editMsic} onChange={(e) => setEditMsic(e.target.value)} className="input-recessed w-full" placeholder="5-digit code" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">SST Registration</label>
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
      {showModal && (
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
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Admin name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Email *</label>
                  <input
                    type="email"
                    value={modalEmail}
                    onChange={(e) => setModalEmail(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Phone</label>
                  <input
                    type="text"
                    value={modalPhone}
                    onChange={(e) => setModalPhone(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    value={modalPassword}
                    onChange={(e) => setModalPassword(e.target.value)}
                    className="input-recessed w-full"
                    placeholder="Min 8 characters"
                  />
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-low)] px-6 py-4 flex gap-3">
              <button
                onClick={submitAdmin}
                disabled={modalSaving}
                className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
