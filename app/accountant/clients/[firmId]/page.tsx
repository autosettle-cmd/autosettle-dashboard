'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

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
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FirmDetailPage() {
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
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      <Sidebar role="accountant" />

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-gray-900 font-bold text-title-lg tracking-tight">Firm Details</h1>
        </header>

        <main className="flex-1 overflow-auto flex flex-col gap-4 p-6 animate-in">

          {/* ── Back link ── */}
          <Link
            href="/accountant/clients"
            className="text-body-md text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1 w-fit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
            Back to Clients
          </Link>

          {firmLoading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : !firm ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Firm not found.</div>
          ) : (
            <>
              {/* ── FIRM INFO CARD ── */}
              <div className="bg-white rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-title-md font-semibold text-gray-900">{firm.name}</h2>
                  <button
                    onClick={openEditPanel}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Registration Number</p>
                    <p className="text-body-md text-gray-900">{firm.registration_number ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Contact Email</p>
                    <p className="text-body-md text-gray-900">{firm.contact_email ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Contact Phone</p>
                    <p className="text-body-md text-gray-900">{firm.contact_phone ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Plan</p>
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
                    <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">LHDN / E-Invoice</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {firm.tin && (
                        <div>
                          <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">TIN</p>
                          <p className="text-body-md text-gray-900">{firm.tin}</p>
                        </div>
                      )}
                      {firm.brn && (
                        <div>
                          <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">BRN</p>
                          <p className="text-body-md text-gray-900">{firm.brn}</p>
                        </div>
                      )}
                      {firm.msic_code && (
                        <div>
                          <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">MSIC Code</p>
                          <p className="text-body-md text-gray-900">{firm.msic_code}</p>
                        </div>
                      )}
                      {firm.sst_registration_number && (
                        <div>
                          <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">SST Registration</p>
                          <p className="text-body-md text-gray-900">{firm.sst_registration_number}</p>
                        </div>
                      )}
                      {firm.address_line1 && (
                        <div className="col-span-2">
                          <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Address</p>
                          <p className="text-body-md text-gray-900">
                            {firm.address_line1}{firm.address_line2 ? `, ${firm.address_line2}` : ''}{firm.city ? `, ${firm.city}` : ''}{firm.postal_code ? ` ${firm.postal_code}` : ''}{firm.state ? `, ${firm.state}` : ''}
                          </p>
                        </div>
                      )}
                      {firm.lhdn_client_id && (
                        <div>
                          <p className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-0.5">LHDN Credentials</p>
                          <span className="badge-green text-label-sm">Configured</span>
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
                  className="text-sm px-4 py-2 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View Claims
                </Link>
                <Link
                  href={`/accountant/receipts?firmId=${firmId}`}
                  className="text-sm px-4 py-2 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View Receipts
                </Link>
              </div>

              {/* ── ADMINS SECTION ── */}
              <div className="bg-white rounded-lg overflow-hidden">
                <div className="px-6 py-3 flex items-center justify-between">
                  <h2 className="text-body-md font-semibold text-gray-900">Admins</h2>
                  <button
                    onClick={openModal}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium btn-primary"
                  >
                    Add Admin
                  </button>
                </div>
                {adminsLoading ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-400">Loading...</div>
                ) : admins.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-400">No admins found for this firm.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="ds-table-header text-left">
                          <th className="px-6 py-2.5">Name</th>
                          <th className="px-6 py-2.5">Email</th>
                          <th className="px-6 py-2.5">Status</th>
                          <th className="px-6 py-2.5">Date Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {admins.map((admin) => (
                          <tr key={admin.id} className={`group text-body-md hover:bg-[#F2F4F6] transition-colors`}>
                            <td className="px-6 py-3 text-gray-900 font-medium">{admin.name}</td>
                            <td className="px-6 py-3 text-gray-600">{admin.email}</td>
                            <td className="px-6 py-3">
                              {admin.status === 'active' ? (
                                <span className="badge-green">Active</span>
                              ) : (
                                <span className="badge-gray">Inactive</span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-gray-600">{formatDate(admin.created_at)}</td>
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

      {/* === EDIT FIRM SIDE PANEL === */}
      {showEditPanel && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setShowEditPanel(false)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-16 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Edit Client</h2>
              <button onClick={() => setShowEditPanel(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="input-label">Firm Name *</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="input-label">Registration Number</label>
                  <input type="text" value={editRegNumber} onChange={(e) => setEditRegNumber(e.target.value)} className="input-field w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Contact Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-field w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Contact Phone</label>
                  <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-field w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Plan</label>
                  <select value={editPlan} onChange={(e) => setEditPlan(e.target.value)} className="input-field w-full">
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              {/* LHDN / E-Invoice Section */}
              <div className="pt-2">
                <h3 className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">LHDN / E-Invoice</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">TIN</label>
                      <input type="text" value={editTin} onChange={(e) => setEditTin(e.target.value)} className="input-field w-full" placeholder="Tax ID Number" />
                    </div>
                    <div>
                      <label className="input-label">BRN</label>
                      <input type="text" value={editBrn} onChange={(e) => setEditBrn(e.target.value)} className="input-field w-full" placeholder="Business Reg No" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">MSIC Code</label>
                      <input type="text" value={editMsic} onChange={(e) => setEditMsic(e.target.value)} className="input-field w-full" placeholder="5-digit code" />
                    </div>
                    <div>
                      <label className="input-label">SST Registration</label>
                      <input type="text" value={editSst} onChange={(e) => setEditSst(e.target.value)} className="input-field w-full" placeholder="Optional" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="pt-2">
                <h3 className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Address</h3>
                <div className="space-y-3">
                  <div>
                    <label className="input-label">Address Line 1</label>
                    <input type="text" value={editAddr1} onChange={(e) => setEditAddr1(e.target.value)} className="input-field w-full" placeholder="Street address" />
                  </div>
                  <div>
                    <label className="input-label">Address Line 2</label>
                    <input type="text" value={editAddr2} onChange={(e) => setEditAddr2(e.target.value)} className="input-field w-full" placeholder="Optional" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">City</label>
                      <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="input-label">Postal Code</label>
                      <input type="text" value={editPostal} onChange={(e) => setEditPostal(e.target.value)} className="input-field w-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">State</label>
                      <input type="text" value={editState} onChange={(e) => setEditState(e.target.value)} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="input-label">Country</label>
                      <input type="text" value={editCountry} onChange={(e) => setEditCountry(e.target.value)} className="input-field w-full" placeholder="MYS" />
                    </div>
                  </div>
                </div>
              </div>

              {/* LHDN Credentials Section */}
              <div className="pt-2">
                <h3 className="text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">LHDN API Credentials (Optional)</h3>
                <p className="text-label-sm text-gray-400 mb-3">Only needed if this firm uses their own LHDN credentials instead of the platform default.</p>
                <div className="space-y-3">
                  <div>
                    <label className="input-label">Client ID</label>
                    <input type="text" value={editLhdnId} onChange={(e) => setEditLhdnId(e.target.value)} className="input-field w-full" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="input-label">Client Secret</label>
                    <input type="password" value={editLhdnSecret} onChange={(e) => setEditLhdnSecret(e.target.value)} className="input-field w-full" placeholder="Optional" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3">
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setShowEditPanel(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* === ADD ADMIN MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Add Admin</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Create a new admin user for this firm.</p>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Full Name *</label>
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
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Email *</label>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone</label>
                <input
                  type="text"
                  value={modalPhone}
                  onChange={(e) => setModalPhone(e.target.value)}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Temporary Password *</label>
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
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {modalSaving ? 'Creating...' : 'Create Admin'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
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
