'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  fiscal_year_id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
}

interface FiscalYear {
  id: string;
  firm_id: string;
  year_label: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  periods: Period[];
}

interface Firm {
  id: string;
  name: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatPeriodLabel(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_BADGE: Record<string, { class: string; label: string }> = {
  open:   { class: 'badge-green', label: 'Open' },
  closed: { class: 'badge-amber', label: 'Closed' },
  locked: { class: 'badge-gray',  label: 'Locked' },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FiscalPeriodsPage() {
  usePageTitle('Fiscal Periods');
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedFY, setExpandedFY] = useState<Set<string>>(new Set());

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [modalLabel, setModalLabel] = useState('');
  const [modalMonth, setModalMonth] = useState(0); // 0 = January
  const [modalYear, setModalYear] = useState(new Date().getFullYear());
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Load firms
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setFirms(j.data);
          if (j.data.length === 1) setFirmId(j.data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Load fiscal years
  useEffect(() => {
    if (!firmId) { setFiscalYears([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    fetch(`/api/fiscal-years?firmId=${firmId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const data = j.data ?? [];
          setFiscalYears(data);
          // Expand the first (most recent) FY by default
          if (data.length > 0) setExpandedFY(new Set([data[0].id]));
          setLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleExpandFY = (id: string) => {
    setExpandedFY((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  const toggleFYStatus = async (fy: FiscalYear) => {
    const newStatus = fy.status === 'open' ? 'closed' : 'open';
    try {
      const res = await fetch(`/api/fiscal-years/${fy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) refresh();
      else {
        const json = await res.json();
        alert(json.error || 'Failed to update');
      }
    } catch {
      alert('Network error');
    }
  };

  const changePeriodStatus = async (fyId: string, period: Period, newStatus: string) => {
    try {
      const res = await fetch(`/api/fiscal-years/${fyId}/periods/${period.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) refresh();
      else {
        const json = await res.json();
        alert(json.error || 'Failed to update');
      }
    } catch {
      alert('Network error');
    }
  };

  // ─── Create Modal ─────────────────────────────────────────────────────────

  const openCreateModal = () => {
    const now = new Date();
    setModalLabel(`FY${now.getFullYear()}`);
    setModalMonth(0);
    setModalYear(now.getFullYear());
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitCreate = async () => {
    if (!modalLabel.trim()) {
      setModalError('Label is required.');
      return;
    }
    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmId,
          yearLabel: modalLabel.trim(),
          startMonth: modalMonth,
          startYear: modalYear,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to create');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
    } catch {
      setModalError('Network error');
      setModalSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6F8]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Fiscal Periods</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className="input-field">
                <option value="">Select Firm</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}

            {firmId && (
              <button onClick={openCreateModal} className="ml-auto btn-primary text-sm px-4 py-2 rounded-lg font-semibold">
                Create Fiscal Year
              </button>
            )}
          </div>

          {!firmId ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Select a firm to manage fiscal periods.</div>
          ) : loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : fiscalYears.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#191C1E] mb-1">No Fiscal Years</h3>
              <p className="text-sm text-[#8E9196] mb-6">Create your first fiscal year to define accounting periods.</p>
              <button onClick={openCreateModal} className="btn-primary text-sm px-6 py-2.5 rounded-lg font-semibold">
                Create Fiscal Year
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {fiscalYears.map((fy) => {
                const isExpanded = expandedFY.has(fy.id);
                const openCount = fy.periods.filter((p) => p.status === 'open').length;
                const closedCount = fy.periods.filter((p) => p.status === 'closed').length;
                const lockedCount = fy.periods.filter((p) => p.status === 'locked').length;

                return (
                  <div key={fy.id} className="bg-white rounded-lg overflow-hidden">
                    {/* FY Header */}
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#F2F4F6] transition-colors"
                      onClick={() => toggleExpandFY(fy.id)}
                    >
                      <div className="flex items-center gap-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E9196" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div>
                          <span className="font-semibold text-[#191C1E] text-[15px]">{fy.year_label}</span>
                          <span className="ml-3 text-sm text-[#8E9196]">{formatDate(fy.start_date)} — {formatDate(fy.end_date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-[#8E9196]">
                          {openCount > 0 && <span>{openCount} open</span>}
                          {closedCount > 0 && <span>{closedCount} closed</span>}
                          {lockedCount > 0 && <span>{lockedCount} locked</span>}
                        </div>
                        <span className={STATUS_BADGE[fy.status].class}>{STATUS_BADGE[fy.status].label}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFYStatus(fy); }}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 hover:text-[#191C1E] transition-colors"
                        >
                          {fy.status === 'open' ? 'Close Year' : 'Reopen Year'}
                        </button>
                      </div>
                    </div>

                    {/* Periods table */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <table className="w-full">
                          <thead>
                            <tr className="ds-table-header text-left">
                              <th className="px-5 py-2.5 w-16">#</th>
                              <th className="px-3 py-2.5">Period</th>
                              <th className="px-3 py-2.5">Start Date</th>
                              <th className="px-3 py-2.5">End Date</th>
                              <th className="px-3 py-2.5 w-[100px]">Status</th>
                              <th className="px-3 py-2.5 w-[200px]">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fy.periods.map((p) => (
                              <tr key={p.id} className="text-body-sm hover:bg-[#F2F4F6] transition-colors border-b border-gray-50">
                                <td className="px-5 py-3 text-[#8E9196] tabular-nums">{p.period_number}</td>
                                <td className="px-3 py-3 text-[#191C1E] font-medium">{formatPeriodLabel(p.start_date)}</td>
                                <td className="px-3 py-3 text-[#434654] tabular-nums">{formatDate(p.start_date)}</td>
                                <td className="px-3 py-3 text-[#434654] tabular-nums">{formatDate(p.end_date)}</td>
                                <td className="px-3 py-3">
                                  <span className={STATUS_BADGE[p.status].class}>{STATUS_BADGE[p.status].label}</span>
                                </td>
                                <td className="px-3 py-3">
                                  {p.status === 'locked' ? (
                                    <span className="text-xs text-[#8E9196]">Permanently locked</span>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {p.status === 'open' && (
                                        <>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'closed')}
                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                                          >
                                            Close
                                          </button>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'locked')}
                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                          >
                                            Lock
                                          </button>
                                        </>
                                      )}
                                      {p.status === 'closed' && (
                                        <>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'open')}
                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                                          >
                                            Reopen
                                          </button>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'locked')}
                                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                          >
                                            Lock
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* === CREATE FISCAL YEAR MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setShowModal(false)} />
      )}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <span className="text-white font-semibold text-sm">Create Fiscal Year</span>
              <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {modalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              )}

              <div>
                <label className="input-label">Label *</label>
                <input type="text" value={modalLabel} onChange={(e) => setModalLabel(e.target.value)} className="input-field w-full" placeholder="e.g. FY2026" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Start Month</label>
                  <select value={modalMonth} onChange={(e) => setModalMonth(Number(e.target.value))} className="input-field w-full">
                    {FULL_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Start Year</label>
                  <input type="number" value={modalYear} onChange={(e) => setModalYear(Number(e.target.value))} className="input-field w-full" min={2020} max={2040} />
                </div>
              </div>

              <div className="bg-[#F5F6F8] rounded-lg p-3 text-sm text-[#434654]">
                <span className="font-medium">Preview:</span> {FULL_MONTHS[modalMonth]} {modalYear} — {FULL_MONTHS[(modalMonth + 11) % 12]} {modalMonth === 0 ? modalYear : modalYear + 1}
                <br />
                <span className="text-xs text-[#8E9196]">12 monthly periods will be created automatically.</span>
              </div>
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3 border-t border-gray-100">
              <button onClick={submitCreate} disabled={modalSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
                {modalSaving ? 'Creating...' : 'Create Fiscal Year'}
              </button>
              <button onClick={() => setShowModal(false)} disabled={modalSaving} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
